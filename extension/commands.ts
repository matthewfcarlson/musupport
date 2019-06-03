import * as vscode from 'vscode';
import * as utils from './utilities';
import * as fs from 'fs';
import { ProjectManager, ProjectDefinition } from './projectmanager';
import { UefiTerminal } from './terminal';
import { RepoScanner } from './reposcanner';
import { logger } from './logger';
import { execPython } from './exec';
import { UefiTasks } from './tasks';

/*
    The UefiCommands class is responsible for providing / handling commands (eg. invokable through Ctrl+Shift+P)

    The following commands are provided:
        musupport.scan                   (Re-)Scans the repository for projects / packages
        musupport.update                 Invokes 'PlatformBuild.py --UPDATE' for the current project
        musupport.install_corebuild      Installs MU corebuild via PIP
*/
export class UefiCommands implements vscode.Disposable {
    private workspace: vscode.WorkspaceFolder;
    private projManager: ProjectManager;
    private repoScanner: RepoScanner;
    private tasks: UefiTasks;
    private term: UefiTerminal;

    constructor(
        workspace: vscode.WorkspaceFolder,
        projManager: ProjectManager,
        repoScanner: RepoScanner,
        tasks: UefiTasks,
        term: UefiTerminal
    ) {
        this.workspace = workspace;
        this.projManager = projManager;
        this.repoScanner = repoScanner;
        this.tasks = tasks;
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
        // TODO: Run this whenever python.pythonPath changes?
        if (!await this.isMuEnvironmentInstalled()) {
            logger.info('Project Mu Environment not yet installed');
            await this.installMuEnvironment();
        }
    }

    async scanRepositoryForProjects() {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'MU: Scanning workspace for projects...',
            cancellable: false
        }, async (p, t) => {
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

        // Just execute the existing update task
        await this.tasks.runUpdateTask();
    }

    /**
     * Determine whether a MU environment is available
     * 
     * @returns true if MU is installed
     */
    async isMuEnvironmentInstalled() : Promise<boolean> {
        // Try to import the Mu pip package to see if it is installed
        try {
            await execPython(this.workspace, 'from MuEnvironment import CommonBuildEntry');
            logger.info('MuEnvironment is available in the current python installation');
            return true;
        } catch {
            logger.info('MuEnvironment is NOT available in the current python installation - failed to import MuEnvironment python package');
            return false;
        }
    }

    /**
     * Install the MU build environment python packages
     */
    async installMuEnvironment() {
        try {
            const task_label = 'Install MU';
            const pip_requirements: string = this.workspace.uri.fsPath + '/pip_requirements.txt';
            let pip_requirements_valid = false;
            if (await utils.promisifyExists(pip_requirements)) {

                // Validate that pip_requirements.txt contains the required dependencies
                let reqs: string = await utils.promisifyReadFile(pip_requirements);
                if (reqs.includes('mu-build') && reqs.includes('mu-environment')) {
                    pip_requirements_valid = true;
                }
                else {
                    utils.showWarning('pip_requirements.txt does not include mu-build & mu-environment. Will install latest available packages');
                }
            }

            if (pip_requirements_valid) {
                await this.tasks.runPythonTask(["-m", "pip", "install", "--upgrade", "-r", "pip_requirements.txt"], task_label);
            } else {
                // No pip_requirements.txt available, install the latest packages...
                await this.tasks.runPythonTask(["-m", "pip", "install", "--upgrade", "mu-build", "mu-environment", "mu-python-library"], task_label);
            }
        }
        catch (e) {
            utils.showError('Failed to install MU environment. Check task output');
            return;
        }

        // Validate that MU is actually installed
        if (!await this.isMuEnvironmentInstalled()) {
            utils.showError('Failed to install MU environment - Check your python installation!');
        }
    }
}
