

import * as vscode from 'vscode';
import { RepoScanner, PCD } from '../reposcanner';
import { logger } from '../logger';
import { LibraryClassNode, Node, LibraryClassCollectionNode } from './models';

const VIEW_NAMESPACE: string = 'uefiLibClassExplorer';

export class LibraryClassProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;

    constructor(
        private workspace: vscode.WorkspaceFolder, 
        private repoScanner: RepoScanner
    ) {
    }

    public register(context: vscode.ExtensionContext) {
        const view = vscode.window.createTreeView(VIEW_NAMESPACE, {
            treeDataProvider: this
        });


        // Subscribe to package discovery
        this.repoScanner.onPackageDiscovered((pkg) => { 
            this.refresh(); 
        });

        // vscode.commands.registerCommand(
        //     `${VIEW_NAMESPACE}.select`, item => { this.selectItem(item); }
        // );
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
            return Promise.resolve(
                this.repoScanner.libraryClassStore.getLibrariesGroupedByName()
                .map(([name, classes]) => new LibraryClassCollectionNode(name, classes)));
        }
    }

    private selectItem(element?: Node) {

    }
}
