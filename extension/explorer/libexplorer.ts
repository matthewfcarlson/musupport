

import * as vscode from 'vscode';
import { RepoScanner, PackageDefinition, ComponentDefinition, LibraryClassDefinition, PCD } from '../reposcanner';
import { logger } from '../logger';
import { LibraryClassNode, Node, LibraryClassCollectionNode } from './models';

const VIEW_NAMESPACE: string = 'uefiLibClassExplorer';

export class LibraryClassProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;

    private classes: Map<string, Map<string, LibraryClassDefinition>>;

    constructor(
        private workspace: vscode.WorkspaceFolder, 
        private repoScanner: RepoScanner
    ) {
        this.classes = new Map<string, Map<string, LibraryClassDefinition>>();
    }

    public register(context: vscode.ExtensionContext) {
        const view = vscode.window.createTreeView(VIEW_NAMESPACE, {
            treeDataProvider: this
        });

        this.classes.clear();

        // Subscribe to package discovery
        this.repoScanner.onPackageDiscovered((pkg) => { 
            for (let cls of pkg.libraryClasses) {
                if (cls) {
                    // Add library class to dictionary
                    let entries = this.classes.get(cls.name) || new Map<string, LibraryClassDefinition>();
                    entries.set(cls.path.fsPath, cls);
                    this.classes.set(cls.name, entries);
                }
            }
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
            let items = Array.from(this.classes.entries());
            return Promise.resolve(items.map(([name, classes]) => new LibraryClassCollectionNode(name, Array.from(classes.values())) ));
        }
    }

    private selectItem(element?: Node) {

    }
}
