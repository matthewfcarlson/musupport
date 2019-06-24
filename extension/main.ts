

import * as vscode from 'vscode';
//import { InstallCppProvider, UninstallCppProvider } from "./cpp/cpp_provider";
import * as path from 'path';
import { PersistentFolderState } from './persistentState';
import { logger } from './logger';
import * as utils from './utilities';
import { UefiTasks } from "./tasks";
import { RepoScanner } from './reposcanner';
import { ProjectManager } from './projectmanager';
import { UefiTerminal } from './terminal';
import { UefiCommands } from './commands';
import * as exec from './exec';
import { CppConfigurationProvider } from './cpp/cpp_provider';
//import { CppProvider } from './cpp/cpp_provider';

let main: MainClass = undefined;

/**
 * The MainClass keeps track of all state for a specific workspace
 * (ie, one MainClass per workspace)
 */
export class MainClass implements vscode.Disposable {
    disposables: vscode.Disposable[] = [];
    context:     vscode.ExtensionContext;

    workspace:   vscode.WorkspaceFolder;
    repoScanner: RepoScanner;
    projManager: ProjectManager;
    tasks:       UefiTasks;
    terminal:    UefiTerminal;
    commands:    UefiCommands;
    cppProvider: CppConfigurationProvider;
    //cppProvider: cpp_provider.CppProvider;

    constructor(context: vscode.ExtensionContext, workspace: vscode.WorkspaceFolder) {
        //const workspaces = vscode.workspace.workspaceFolders;
        const resourceRoot = path.join(context.extensionPath, 'resources');

        this.context      = context;
        this.workspace    = workspace;
        this.terminal     = new UefiTerminal(this.workspace);
        this.repoScanner  = new RepoScanner(this.workspace);
        this.projManager  = new ProjectManager(this.repoScanner);
        this.tasks        = new UefiTasks(this.workspace, this.projManager);
        this.commands     = new UefiCommands(this.workspace, this.projManager, this.repoScanner, this.tasks, this.terminal);
        this.cppProvider  = new CppConfigurationProvider(context, this.workspace);

        this.disposables.push(
            this.terminal,
            this.tasks,
            this.repoScanner,
            this.projManager,
            this.commands,
            this.cppProvider 
        );

        // Event handlers
        this.disposables.push(this.repoScanner.onProjectDiscovered((p) => {
        }));

        this.disposables.push(this.projManager.onProjectSelected((p) => {
            // Activate the C/C++ provider if it hasn't already been activated
            if (!this.cppProvider.isEnabled) {
                this.cppProvider.register();
            }
            
            // Update the C/C++ provider with the current project's search paths
            this.cppProvider.setActiveProject(p);
        }));
    }

    /**
     * Called once on extension activation.
     * Use this to register with the UI, but nothing should depend on the current config...
     */
    async activate() {
        logger.info('Initializing Extension');
        try {
            this.commands.register(this.context);
            this.tasks.register();
            this.projManager.register();
            //this.cppProvider.register();
        }
        catch (err) {
            logger.error('Error activating extension', err);
        }
    }

    /**
     * Called on extension activation and whenever the configuration changes.
     * Use this to refresh things that depend on the current config.
     */
    async setup() {
        logger.info("MAIN - SETTING UP CONTEXT");
        const config = vscode.workspace.getConfiguration("musupport");

        try {
            // Locate the current python interpreter
            await utils.validatePythonPath(this.workspace);

            if (config.get('enableRepoScanner', true)) {
                // Begin a workspace scan (can also be invoked through a VSCode command)
                await this.commands.executeCommand('musupport.scan');
            }

            // if (config.get("useAsCppProvider", true)) {
            //     this.cppProvider.register();
            //     let curProj = this.projManager.getCurrentProject();
            //     if (curProj) {
            //         this.cppProvider.setActiveProject(curProj);
            //     }
            // } else {
            //     this.cppProvider.unregister();
            // }
        }
        catch (err) {
          logger.error("Error setting up extension", err)
          return;
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

    let workspaces = vscode.workspace.workspaceFolders;
    if (workspaces && workspaces.length >= 1) {
        let workspace = workspaces[0]; // TODO: Support multiple workspaces...

        main = new MainClass(context, workspace);
        await main.activate();
        await main.setup();

        vscode.workspace.onDidChangeConfiguration(async (e) => {
            await main.setup();
        });

    } else {
        utils.showError('No workspaces available!');
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    if (main) {
        main.dispose();
        main = undefined;
    }
}
