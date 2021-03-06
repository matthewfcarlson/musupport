

import * as vscode from 'vscode';
import { InstallCppProvider, UninstallCppProvider } from "./cpp/cpp_provider";
import * as path from 'path';
import { PersistentFolderState } from './persistentState';
import { logger } from './logger';
import * as utils from './utilities';
import { UefiTasks } from "./tasks";
import { RepoScanner } from './reposcanner';
import { ProjectManager } from './projectmanager';
import { UefiTerminal } from './terminal';
import { UefiCommands } from './commands';
import { PackageTreeProvider } from './explorer/pkgexplorer';
import { ProjectTreeNodeProvider } from './explorer/projtree';
import * as exec from './exec';
import { LibraryClassProvider } from './explorer/libexplorer';
import * as DSC_LSP from './dsc/DSC';

let main: MainClass = undefined;

export class MainClass implements vscode.Disposable {
    disposables: vscode.Disposable[] = [];
    context:     vscode.ExtensionContext;

    repoScanner: RepoScanner;
    projManager: ProjectManager;
    tasks:       UefiTasks;
    terminal:    UefiTerminal;
    commands:    UefiCommands;
    packageTree: PackageTreeProvider;
    projectTree: ProjectTreeNodeProvider;
    libclsTree:  LibraryClassProvider;
    ws:          vscode.WorkspaceFolder


    constructor(context: vscode.ExtensionContext) {
        const workspace = vscode.workspace.workspaceFolders[0]; // TODO: Merge changes to support multiple workspaces
        this.ws = workspace; //TODO this needs to support multiple workspaces
        this.context      = context;
        this.terminal     = new UefiTerminal();
        this.repoScanner  = new RepoScanner(workspace);
        this.projManager  = new ProjectManager(this.repoScanner);
        this.tasks        = new UefiTasks(this.projManager);
        this.commands     = new UefiCommands(this.projManager, this.repoScanner, this.terminal);
        this.packageTree  = new PackageTreeProvider(workspace, this.repoScanner);
        this.libclsTree   = new LibraryClassProvider(workspace, this.repoScanner);
        this.projectTree  = new ProjectTreeNodeProvider(workspace, this.projManager, this.repoScanner);

        this.disposables.push(
            this.terminal,
            this.tasks,
            this.repoScanner,
            this.projManager,
            this.commands
        );
    }

    // Called on extension activation only
    async activate() {
        logger.info('Initializing Extension');
        try {
            this.commands.register(this.context);
            this.tasks.register();
            DSC_LSP.activate(this.context, this.ws);
            this.packageTree.register(this.context);
            this.libclsTree.register(this.context);
            this.projectTree.register();

            let scanCommand = this.commands.executeCommand('musupport.scan');
            // TODO: On scan completion load or update the C/C++ extension

            this.projectTree.refresh();

            logger.info('Extension ready!');
        }
        catch (err) {
            logger.error('Error activating extension', err);
        }
    }

    // Called whenever the configuration changes
    async setup() {
        logger.info("MAIN - SETTING UP CONTEXT");
        const workspaces = vscode.workspace.workspaceFolders;
        const resourceRoot = path.join(this.context.extensionPath, 'resources');
        const config = vscode.workspace.getConfiguration("musupport");

        try {
            // TODO: Move this into a class & merge my CPP provider code...
            // TODO: completely rewrite the CPP provider
            if (config["useAsCppProvider"] != undefined) {
                //if (config["useAsCppProvider"]) InstallCppProvider(this.context, workspaces, resourceRoot);
                //else UninstallCppProvider(this.context, workspaces, resourceRoot);
            }

            // Locate the current python interpreter
            await utils.validatePythonPath();
        }
        catch (err) {
          logger.error("Error setting up extension", err)
        }
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  utils.setExtensionContext(context);

    main = new MainClass(context);
    await main.activate();
    await main.setup();

    vscode.workspace.onDidChangeConfiguration((e) => {
        main.setup(); // TODO: await?
    });


}

// this method is called when your extension is deactivated
export function deactivate() {
    if (main) {
        main.dispose();
        main = undefined;
    }
}
