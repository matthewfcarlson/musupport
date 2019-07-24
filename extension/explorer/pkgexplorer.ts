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
import { RepoScanner, PCD } from '../reposcanner';
import { logger } from '../logger';
import { PkgNode, Node } from './models';
import { Package } from '../parsers/models';

const VIEW_NAMESPACE: string = 'uefiPackageExplorer';

/**
 * Provides a treeview for exploring UEFI packages.
 * Packages are discovered by the RepoScanner class.
 */
export class PackageTreeProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;

    private static readonly SELECT_COMMAND: string = `${VIEW_NAMESPACE}.select`;

    private packages: Package[];

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
            PackageTreeProvider.SELECT_COMMAND, item => { item.selected(); }
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
            return Promise.resolve(this.packages.map((pkg) => new PkgNode(pkg, PackageTreeProvider.SELECT_COMMAND) ));
        }
    }
}
