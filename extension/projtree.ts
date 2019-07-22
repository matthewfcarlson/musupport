import * as vscode from 'vscode';
import { ProjectManager, ProjectDefinition } from './projectmanager';
import { RepoScanner } from './reposcanner';

export class ProjectTreeNodeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ProjectTreeItem | undefined> = new vscode.EventEmitter<ProjectTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ProjectTreeItem| undefined> = this._onDidChangeTreeData.event;
	
	private projManager: ProjectManager;
	private repoScanner: RepoScanner;

	constructor(private workspace: vscode.WorkspaceFolder, projManager: ProjectManager, repoScanner: RepoScanner) {
		this.projManager = projManager;
		this.repoScanner = repoScanner;
	}

	register() {
		vscode.window.registerTreeDataProvider('uefiProjects', this);

		this.repoScanner.onProjectDiscovered((proj) => {
			this.refresh();
		});
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: vscode.TreeItem): Thenable<ProjectTreeItem[]> {
		if (!this.projManager) {
			return Promise.resolve(null);
		}
		
		if (element) {
			// No child items
			return Promise.resolve(null);
		}
		else {
			let projects = this.projManager.getAvailableProjects();
			let items = projects.map((p) => new ProjectTreeItem(p));
			return Promise.resolve(items);
		}
	}
}

export class ProjectTreeItem extends vscode.TreeItem {
	constructor(
		public readonly proj: ProjectDefinition
	) {
		super(proj.projectName, vscode.TreeItemCollapsibleState.None);
	}

	get tooltip(): string {
		return `${this.proj.platformBuildScriptPath}`;
	}

	get description(): string {
		return (this.proj.platformBuildScriptPath) ? "PY" : "DSC";
	}

	contextValue = 'project';
}
