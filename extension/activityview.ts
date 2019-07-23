import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class MuNodeProvider implements vscode.TreeDataProvider<Node> {
    private _onDidChangeTreeData: vscode.EventEmitter<Node | undefined> = new vscode.EventEmitter<Node | undefined>();
    readonly onDidChangeTreeData: vscode.Event<Node | undefined> = this._onDidChangeTreeData.event;
    
    constructor(private workspace: vscode.WorkspaceFolder) { }

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
            let items = [
                new PkgNode("MdePkg"),
                new PkgNode("MdeModulePkg"),
                new PkgNode("MsSurfaceModulePkg"),
                new PkgNode("MsSurfaceIntelPkg"),
            ];
            return Promise.resolve(items);
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
        public readonly label: string
    ) {
        super(label, true);
    }

    contextValue = 'mu-pkg';

    get tooltip() : string { return null; }

    get description() : string { return null; }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve([
            new ComponentNode("LibraryClasses"),
            new ComponentNode("Components"),
            //new ComponentNode("Components.IA32"),
            //new ComponentNode("Components.X64"),
        ]);
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
        const treeProvider = new MuNodeProvider(this.workspace);
        
        const view = vscode.window.createTreeView('uefiExplorer', {
            treeDataProvider: treeProvider
        });
    }
}
