import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PackageDefinition } from './reposcanner';

export class PackageTreeProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;

    private packages: PackageDefinition[];

    constructor(
        private workspace: vscode.WorkspaceFolder, 
        private repoScanner: RepoScanner
    ) { }

    public register(context: vscode.ExtensionContext) {
        const view = vscode.window.createTreeView('uefiExplorer', {
            treeDataProvider: this
        });

        this.packages = [];
        this.repoScanner.onPackageDiscovered((pkg) => { 
            this.packages.push(pkg);
            this.refresh(); 
        });
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
            // let items = [
            //     new PkgNode("MdePkg"),
            //     new PkgNode("MdeModulePkg"),
            //     new PkgNode("MsSurfaceModulePkg"),
            //     new PkgNode("MsSurfaceIntelPkg"),
            // ];
            //return Promise.resolve(items);
            return Promise.resolve(this.packages.map((pkg) => new PkgNode(pkg) ));
        }
    }
}

abstract class Node extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly hasChildren: boolean = false
    ) {
        super(label, ((hasChildren) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
    }

    getChildren() : Thenable<Node[]> { return Promise.resolve(null); }

    contextValue = 'mu-node';
}

/**
 * Represents a UEFI package backed by a DSC (eg. MdePkg.dsc)
 */
export class PkgNode extends Node {
    constructor (
        private readonly pkg: PackageDefinition
    ) {
        super(pkg.name, true);
    }

    contextValue = 'mu-pkg';

    get tooltip() : string { return this.pkg.dscPath.fsPath; }

    get description() : string { return path.basename(this.pkg.dscPath.fsPath); }

    getChildren() : Thenable<Node[]> {
        // TODO: Pull from DSC parser...
        return Promise.resolve(null);

        // return Promise.resolve([
        //     new ComponentNode("LibraryClasses"),
        //     new ComponentNode("Components"),
        //     //new ComponentNode("Components.IA32"),
        //     //new ComponentNode("Components.X64"),
        // ]);
    }
}

/**
 * Represents a [LibraryClasses] or [Components] section inside the DSC
 */
export class ComponentNode extends Node {
    constructor(
        public readonly label: string
    ) {
        super(label, true);
    }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve([
            new InfNode("BaseLib", ["IA32","X64"]),
            new InfNode("BaseMemoryLib", ["IA32","X64"]),
            new InfNode("DxeMain", ["IA32","X64"]),
            new InfNode("PeiCore", ["IA32","X64"]),
            new InfNode("DebugLib"),
        ]);
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
