/**
 * Provides a treeview for exploring UEFI packages in the repository.
 * 
 * Example tree layout:
 * MdePkg
 *   Library Classes
 *     BaseLib [IA32,X64]
 *     BaseMemoryLib [IA32,X64]
 *   Components
 *     HelloWorld.inf [DXE,PEI,APP]
 *     Logo.inf [DXE]
 *     PciBusDxe.inf [DXE]
 *   PCDs
 *     gMyNamespace.myPcd
 * MdeModulePkg
 * MyPlatformPkg
 * 
 * Clicking on each node will navigate to the component file
 * Right clicking on a library class, component, or PCD will take you to where it is defined in the DSC.
 * 
 * !preprocessor statements in DSCs will not be evaluated,
 * so !includes will not be traversed, and all paths in an !if block will be shown.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PackageDefinition } from './reposcanner';
import { logger } from './logger';

const VIEW_NAMESPACE: string = 'uefiPackageExplorer';

/**
 * Provides a treeview for exploring UEFI packages.
 * Packages are discovered by the RepoScanner class.
 */
export class PackageTreeProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;

    private packages: PackageDefinition[];

    constructor(
        private workspace: vscode.WorkspaceFolder, 
        private repoScanner: RepoScanner
    ) { }

    public register(context: vscode.ExtensionContext) {
        const view = vscode.window.createTreeView(VIEW_NAMESPACE, {
            treeDataProvider: this
        });

        this.packages = [];

        // Subscribe to package discovery
        // TODO: Delete packages that are missing
        this.repoScanner.onPackageDiscovered((pkg) => { 
            this.packages.push(pkg);
            this.refresh(); 
        });

        vscode.commands.registerCommand(
            `${VIEW_NAMESPACE}.select`, item => { this.selectItem(item); }
        );
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Node): Thenable<Node[]> {
        if (!this.workspace) {
            vscode.window.showInformationMessage('No dependency in empty workspace');
            return Promise.resolve([]);
        }

        if (element) {
            return element.getChildren();
        }
        else {
            // 1st-level nodes
            return Promise.resolve(this.packages.map((pkg) => new PkgNode(pkg) ));
        }
    }

    private selectItem(element?: Node) {
        if (element.contextValue == 'mu-pkg') {
            let pkg = (element as PkgNode).pkg;
            this.navigateToPackageFile(pkg);
        }
    }

    private navigateToPackageFile(pkg: PackageDefinition) {
        logger.info(`Selected package: ${pkg.dscPath}`);
        vscode.window.showTextDocument(pkg.dscPath, { preserveFocus: true });
    }
}

abstract class Node extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly hasChildren: boolean = false
    ) {
        super(label, ((hasChildren) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));

        this.command = {
            title: '',
            command: `${VIEW_NAMESPACE}.select`,
            arguments: [this]
        };
    }

    getChildren() : Thenable<Node[]> { return Promise.resolve(null); }

    contextValue = 'mu-node';
}

/**
 * Represents a UEFI package backed by a DSC (eg. MdePkg.dsc)
 */
export class PkgNode extends Node {
    constructor (
        public readonly pkg: PackageDefinition
    ) {
        super(pkg.name, true);
    }

    contextValue = 'mu-pkg';

    get tooltip() : string { return this.pkg.dscPath.fsPath; }

    get description() : string { return path.basename(this.pkg.dscPath.fsPath); }

    getChildren() : Thenable<Node[]> {
        let items: Node[] = [];
        if (this.pkg.libraryClasses && (this.pkg.libraryClasses.length > 0)) {
            items.push(new ComponentNode("LibraryClasses", this.pkg.libraryClasses));
        }
        if (this.pkg.components && (this.pkg.components.length > 0)) {
            items.push(new ComponentNode("Components", this.pkg.components));
        }
        if (this.pkg.pcds && (this.pkg.pcds.length > 0)) {
            items.push(new ComponentNode("PCDs", this.pkg.pcds));
        }
        return Promise.resolve(items);
    }
}

/**
 * Represents a [LibraryClasses] or [Components] section inside the DSC
 */
export class ComponentNode extends Node {
    constructor(
        public readonly label: string,
        public readonly items: string[]
    ) {
        super(label, true);
    }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve(this.items.map((item) => new InfNode(item)));
    }
}

/**
 * Represents a library, driver, or application backed by a *.inf
 */
export class InfNode extends Node {
    constructor(
        public readonly label: string,
        public readonly arch: string[] = null
    ) { 
        super(label, false); // No children
    }

    get description() : string {
        return (this.arch) ? this.arch.join(',') : null;
    }

    contextValue = 'mu-inf';
}
