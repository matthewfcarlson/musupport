import * as vscode from 'vscode';
import { RepoScanner } from './reposcanner';
import * as exec from './exec';
import { logger } from './logger';
import * as utils from './utilities';

export class ProjectDefinition {
    // Display name for the project
    projectName: string;

    // The directory containing the platform
    projectRoot: string;

    // The Platform DSC file
    platformDscPath: string;

    // The PlatformBuild.py script to invoke when building
    platformBuildScriptPath: string;

    // The parsed project DSC file
    //projectDsc: dsc.DscFile; // TODO

    buildRoot: string;

    // Paths to search for EFI packages
    packageSearchPaths: string[];

    // Possible build configurations
    configs: string[];
}

/*
    The ProjectManager class is responsible for keeping track of the active project.
*/
export class ProjectManager implements vscode.Disposable {
    private static PROJECT_TEXT = "$(circuit-board)";
    private static CONFIG_TEXT  = "$(gear)";

    private onProjectDiscoveredRegistration: vscode.Disposable;

    private availableConfigs: Array<string>;
    private availableProjects: Array<ProjectDefinition>;

    private currentProject: ProjectDefinition;
    //private currentConfig: string;
    private statusBarProject: vscode.StatusBarItem;
    //private statusBarConfig: vscode.StatusBarItem;

    constructor(repoScanner: RepoScanner) {
        this.availableProjects = [];
        this.availableConfigs = [];
        
        this.availableConfigs = ['DEV', 'SELFHOST']; // TODO: Detect from selected project
        // if (this.availableConfigs.length >= 1) {
        //     this.currentConfig = this.availableConfigs[0];
        // }

        // IMPORTANT: event handler must be inside a closure or 'this' won't be captured.
        this.onProjectDiscoveredRegistration = repoScanner.onProjectDiscovered(
            (p) => this.projectDiscovered(p));

        this.addStatusBarItems();
        this.registerCommands();
    }

    dispose() {
        this.statusBarProject.dispose();
        //this.statusBarConfig.dispose();
        this.onProjectDiscoveredRegistration.dispose();
    }

    projectDiscovered(proj: ProjectDefinition) {
        const config = vscode.workspace.getConfiguration(null, null);
        let currentProjectName: string = config.get('musupport.currentPlatform');

        // TODO: Should we use the project name or path as the key?
        // There may be duplicate project names...
        if (this.availableProjects.some((p) => p.projectName === proj.projectName)) {
            logger.info(`Project ${proj.projectName} already discovered`);
            return;
        }

        console.info(`Discovered ${proj.projectName} @ ${proj.platformBuildScriptPath}`);
        this.availableProjects.push(proj);

        // Restore selection
        if (proj.projectName === currentProjectName) {
            this.selectProject(currentProjectName);
        }
    }

    get projectCount() {
        return this.availableProjects.length;
    }

    addStatusBarItems() {
        // Register status bar items
        this.statusBarProject = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
        this.statusBarProject.command = "musupport.selectProject";
        this.statusBarProject.tooltip = "Select the UEFI project to build";

        // this.statusBarConfig = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
        // this.statusBarConfig.command = "musupport.selectConfig";
        // this.statusBarConfig.tooltip = "Select the UEFI project configuration / target";

        this.updateStatusBar();

        this.statusBarProject.show();
        //this.statusBarConfig.show();
    }

    registerCommands() {
        vscode.commands.registerCommand('musupport.selectProject', () => {
            if (this.availableProjects) {
                return this.selectProject();
            }
            else {
                utils.showError('No UEFI projects detected in the workspace');
            }
        });

        // vscode.commands.registerCommand('musupport.selectConfig', () => {
        //     if (this.availableConfigs) {
        //         return this.selectConfig();
        //     }
        //     else {
        //         vscode.window.showErrorMessage('No configurations available');
        //     }
        // });
    }

    updateStatusBar() {
        this.statusBarProject.text = ProjectManager.PROJECT_TEXT + ' ' + ((this.currentProject !== undefined) ? this.currentProject.projectName : '<Select Project>');
        //this.statusBarConfig.text = ProjectManager.CONFIG_TEXT + ' ' + ((this.currentConfig !== undefined) ? this.currentConfig : '<Select Config>');
    }

    async selectProject(projectName: string = undefined): Promise<string|null> {
        if (!projectName) {
            // Display a drop-down picker
            let items: vscode.QuickPickItem[] = this.availableProjects.map(proj => { return {
                label:  proj.projectName,
                // Show either the PlatformBuild.py path or the PlatformPkg.dsc path
                detail: (proj.platformBuildScriptPath || proj.platformDscPath), 
            }});
            let selectedItem = await vscode.window.showQuickPick(items);
            if (!selectedItem || !selectedItem.label) {
                // Selection cancelled
                return null;
            }

            projectName = selectedItem.label;
        }

        if (projectName) {
            this.currentProject = this.availableProjects.filter(p => p.projectName === projectName)[0];

            await this.loadPlatformBuild(this.currentProject);
            await this.loadProjectDef(this.currentProject);

            if (this.currentProject.configs) {
                this.availableConfigs = this.currentProject.configs;
            }
           
            // When a project is selected, we must store the path to the platform build script to the config, so we can invoke it in a task.
            const config = vscode.workspace.getConfiguration();
            config.update('musupport.currentPlatform', 
                this.currentProject.projectName,
                vscode.ConfigurationTarget.Workspace);

            config.update('musupport.currentPlatformBuildScriptPath',
                this.currentProject.platformBuildScriptPath, 
                vscode.ConfigurationTarget.Workspace);

            // Update the configuration with discovered values
            // if (this.currentProject) {
            //     main.config.setDynamicConfig({
            //         arch: null,
            //         defines: null,
            //         includePaths: null,
            //         packageSearchPaths: this.currentProject.packageSearchPaths,
            //         packages: null
            //     });
            // }

            //utils.showMessage(`${this.currentProject.projectName} loaded!`);

            this.updateStatusBar();
            return projectName;
        }
    }

    async loadPlatformBuild(def: ProjectDefinition) {
        // TODO: Future support for C/C++ extension
        // // Find PlatformBuild.py and import the module scope (if possible)
        // try {
        //     let pythonScript = vscode.Uri.file(utils.extension.extensionPath + '/extra/PlatformBuildEnv.py');
        //     let result = await exec.execPythonScript(
        //         pythonScript, 
        //         [def.platformBuildScriptPath], 
        //         def.projectRoot);


        //     if (result) {
        //         let module = JSON.parse(result);
        //         logger.info(`PlatformBuild.py parsed: ${module}`);
        //         //utils.showMessage('PlatformBuild.py loaded');

        //         if (module.MODULE_PKGS) {
        //             logger.info(`Selected PlatformBuild.py includes the following packages: ${module.MODULE_PKGS}`);
        //             def.packageSearchPaths = module.MODULE_PKGS;
        //         }

        //         // This is only available if you initialize the platform build environment (PlatformBuilder.SetPlatformEnv())
        //         if (module.ACTIVE_PLATFORM) {
        //             def.platformDscPath = module.ACTIVE_PLATFORM;
        //         }
        //     }
        // } catch (e) {
        //     logger.error(`Error loading PlatformBuild script: ${e}`, e);
        //     // Continue on...
        // }
    }

    async loadProjectDef(def: ProjectDefinition)
    {
        if (!def.platformDscPath) {
            logger.info('No DSC file available for this project');
            return;
        }
        logger.info(`Platform DSC: ${def.platformDscPath}`);

        // Parse the DSC file
        //def.projectDsc = await dsc.DscFile.ParseFile(def.platformDscPath, def.packageSearchPaths); // TODO
    }

    // async selectConfig(): Promise<string|null> {
    //     var configs = ['Debug', 'Release'];
    //     var choice = await vscode.window.showQuickPick(configs);
    //     if (choice) {
    //         this.currentConfig = choice;
    //         this.updateStatusBar();
    //         return choice;
    //     }
    // }

    getCurrentProject(): ProjectDefinition {
        return this.currentProject;
    }

    getAvailableConfigs(): string[] {
        return this.availableConfigs;
    }
}
