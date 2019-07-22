import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


export class DepNodeProvider implements vscode.TreeDataProvider<Dependency> {
    private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;
    
    constructor(private workspaceRoot: string) { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: Dependency): vscode.TreeItem {
		return element;
	}

	getChildren(element?: Dependency): Thenable<Dependency[]> {
		if (!this.workspaceRoot) {
			vscode.window.showInformationMessage('No dependency in empty workspace');
			return Promise.resolve([]);
        }
        
        return Promise.resolve([
            new Dependency("Hello", "123", vscode.TreeItemCollapsibleState.Collapsed)
        ]);

		// if (element) {
		// 	return Promise.resolve(this.getDepsInPackageJson(path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')));
		// } else {
		// 	const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
		// 	if (this.pathExists(packageJsonPath)) {
		// 		return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
		// 	} else {
		// 		vscode.window.showInformationMessage('Workspace has no package.json');
		// 		return Promise.resolve([]);
		// 	}
		// }

	}
}

export class Dependency extends vscode.TreeItem {

	constructor(
		public readonly label: string,
		private version: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}

	get tooltip(): string {
		return `${this.label}-${this.version}`;
	}

	get description(): string {
		return this.version;
	}

	// iconPath = {
	// 	light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
	// 	dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
	// };

	contextValue = 'dependency';

}

export class ActivityView implements vscode.Disposable {
    private workspace: vscode.WorkspaceFolder;

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
    }

    dispose() {
    }

    public register(context: vscode.ExtensionContext) {
		const treeProvider = new DepNodeProvider(vscode.workspace.rootPath);
		
		// View in Activity Bar
        vscode.window.registerTreeDataProvider('uefiExplorer', treeProvider);
		// vscode.commands.registerCommand('uefiExplorer.refreshEntry', () => treeProvider.refresh());

		// View in Explorer Bar
        const view = vscode.window.createTreeView('uefiProjects', { 
            treeDataProvider: treeProvider
        });
    }
}
