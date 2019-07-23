import * as vscode from 'vscode';
import * as utils from './utilities';
import * as fs from 'fs';
import { ProjectManager, ProjectDefinition } from './projectmanager';
import { UefiTerminal } from './terminal';
import { RepoScanner } from './reposcanner';
import { logger } from './logger';
import { execPython } from './exec';

/*
    The UefiCommands class is responsible for providing / handling commands (eg. invokable through Ctrl+Shift+P)

    The following commands are provided:
        musupport.scan                   (Re-)Scans the repository for projects / packages
        musupport.update                 Invokes 'PlatformBuild.py --UPDATE' for the current project
        musupport.install_corebuild      Installs MU corebuild via PIP
*/
export class UefiCommands implements vscode.Disposable {
    private projManager: ProjectManager;
    private repoScanner: RepoScanner;
    private term: UefiTerminal;

    constructor(
        projManager: ProjectManager,
        repoScanner: RepoScanner,
        term: UefiTerminal
    ) {
        this.projManager = projManager;
        this.repoScanner = repoScanner;
        this.term = term;
    }

    dispose() {
    }

    async register(context: vscode.ExtensionContext) {
        // TODO: If commands are already registered, don't re-register
        context.subscriptions.push(...[
            vscode.commands.registerCommand('musupport.scan', () => {
                return this.scanRepository();
            }),
            vscode.commands.registerCommand('musupport.update', () => {
                return this.updateRepository();
            }),
            vscode.commands.registerCommand('musupport.install_corebuild', () => {
                return this.installMuEnvironment();
            }),
        ]);

        // var listener = function(proj: ProjectDefinition) {
        //     //console.info(`Discovered ${proj.projectName}`);
        //     //utils.showMessage(`Discovered ${proj.projectName}`);
        // };
        // this.repoScanner.onProjectDiscovered(listener);
    }

    executeCommand(command: string) {
        return vscode.commands.executeCommand(command);
    }

    async scanRepository() {
        logger.info('Scan started');
        await this.scanRepositoryForProjects();

        //await this.scanGuids();
        //utils.showMessage(`Scan complete! Found ${this.projManager.projectCount} projects, ${this.repoScanner.guidDatabase.count} GUIDs`);
        //utils.showMessage(`Scan complete! Found ${this.projManager.projectCount} projects`);

        // TODO: This could run in parallel to the main scan
        if (!await this.isMuEnvironmentInstalled()) {
            logger.info('Project Mu Environment not yet installed');
            await this.installMuEnvironment();
            if (!await this.isMuEnvironmentInstalled()) {
                logger.error('Could not install the Mu Environment!\nCheck your pip/python');
            }
        }
    }

    async scanRepositoryForProjects() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: 'Scanning for UEFI projects...'
        }, async (p, t) => {
            // TODO: This might belong in a different scan command?
            await this.repoScanner.scanForPackages();

            let projects = await this.repoScanner.scanForProjects();
            if (projects && projects.length > 0) {
                logger.info(`Discovered ${projects.length} projects`);
            } else {
                const config = vscode.workspace.getConfiguration(null, null);
                let platformDsc: string = config.get('musupport.platformDsc');
                utils.showWarning(`No projects found in the current workspace (Looking for '${platformDsc}')`);
            }
        });
    }

    // async scanGuids() {
    //     // Build GUID database
    //     await vscode.window.withProgress({
    //         location: vscode.ProgressLocation.Window,
    //         title: "Building GUID database..."
    //     }, async (p, t) => {
    //         await this.repoScanner.gatherRepoInformation();
    //     });
    // }

    async updateRepository() {
        if (!this.projManager) {
            utils.showError("UEFI extension hasn't finished loading!");
            return;
        }

        let proj = this.projManager.getCurrentProject();
        if (!proj) {
            utils.showError("No project selected!");
            return;
        }

        /*const config = vscode.workspace.getConfiguration();
        let buildScriptPath : string = config.get('musupport.currentPlatformBuildScriptPath');
        if (!buildScriptPath) {
            utils.showError('No project selected!');
            return;
        }*/

        await this.term.runPythonCommand([proj.platformBuildScriptPath, "--update"]);
        // TODO: Catch errors
    }

    async isMuEnvironmentInstalled() : Promise<boolean> {
        // Try to import the Mu pip package to see if it is installed
        try {
            await execPython('from MuEnvironment import CommonBuildEntry');
            logger.info('Mu environment is installed');
            return true;
        } catch {
            logger.info('Mu environment is NOT installed');
            return false;
        }
    }

    async installMuEnvironment() {
        // TODO: If pip_requirements.txt isn't present, install the latest mu_build modules...
        await this.term.runPythonCommand(["-m", "pip", "install", "--upgrade", "-r", "pip_requirements.txt"]);
        //await this.term.runPythonCommand(["-m", "pip", "install", "--upgrade", "mu-build", "mu-environment", "mu-python-library"]);
        // TODO: Catch errors
    }
}
