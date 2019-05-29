import * as vscode from 'vscode';
import { RepoScanner } from './reposcanner';
import * as exec from './exec';
import { logger } from './logger';
import * as utils from './utilities';
import { PersistentFolderState } from './persistentState';

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

    private selectedProjectName: PersistentFolderState<string>;

    private currentProject: ProjectDefinition;
    //private currentConfig: string;
    private statusBarProject: vscode.StatusBarItem;
    //private statusBarConfig: vscode.StatusBarItem;

    private readonly _onProjectSelected: vscode.EventEmitter<ProjectDefinition> = new vscode.EventEmitter<ProjectDefinition>();
    public  readonly  onProjectSelected: vscode.Event<ProjectDefinition>        = this._onProjectSelected.event;

    constructor(repoScanner: RepoScanner) {
        this.availableProjects = [];
        this.availableConfigs = [];

        //const fsPath = workspace.uri.fsPath; // TODO: Multi-workspace support
        const fsPath = vscode.workspace.rootPath;
        this.selectedProjectName = new PersistentFolderState<string>('musupport_dsc.selectedName', 'None', fsPath);
        
        this.availableConfigs = ['DEV', 'SELFHOST']; // TODO: Detect from selected project
        // if (this.availableConfigs.length >= 1) {
        //     this.currentConfig = this.availableConfigs[0];
        // }

        // IMPORTANT: event handler must be inside a closure or 'this' won't be captured.
        this.onProjectDiscoveredRegistration = repoScanner.onProjectDiscovered(
            (p) => this.projectDiscovered(p));
    }

    /**
     * Register with the VSCode UI
     */
    register() {
        this.addStatusBarItems();
        this.registerCommands();
    }

    dispose() {
        this.statusBarProject.dispose();
        //this.statusBarConfig.dispose();
        this.onProjectDiscoveredRegistration.dispose();
        this._onProjectSelected.dispose();
    }

    get projectCount() {
        return this.availableProjects.length;
    }

    /**
     * Called whenever a project is discovered in the workspace
     * 
     * @param proj The definition representing the project that was discovered
     */
    private projectDiscovered(proj: ProjectDefinition) {
        // TODO: Should we use the project name or path as the key?
        // There may be duplicate project names...
        if (this.availableProjects.some((p) => p.projectName === proj.projectName)) {
            logger.warn(`Project ${proj.projectName} already discovered`);
            return;
        }

        console.info(`Discovered ${proj.projectName} @ ${proj.platformBuildScriptPath}`);
        this.availableProjects.push(proj);

        // TODO: Support multiple workspaces
        //const config = vscode.workspace.getConfiguration(null, null);
        //let currentProjectName: string = config.get('musupport.currentPlatform');
        let currentProjectName: string = this.selectedProjectName.Value;

        // Restore selection
        if (currentProjectName && (proj.projectName === currentProjectName)) {
            this.selectProject(proj);
        }
    }

    /**
     * Add items to the VSCode UI status bar
     */
    private addStatusBarItems() {
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

    /**
     * Register VSCode commands for selecting the current project
     */
    private registerCommands() {
        vscode.commands.registerCommand('musupport.selectProject', () => {
            if (this.availableProjects) {
                this.selectProject();
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

    /**
     * Update the status bar to match the current project state
     */
    private updateStatusBar() {
        this.statusBarProject.text = ProjectManager.PROJECT_TEXT + ' ' + ((this.currentProject !== undefined) ? this.currentProject.projectName : '<Select Project>');
        //this.statusBarConfig.text = ProjectManager.CONFIG_TEXT + ' ' + ((this.currentConfig !== undefined) ? this.currentConfig : '<Select Config>');
    }

    private getProjectByName(projectName: string) : ProjectDefinition {
        if (projectName) {
            let idx = this.availableProjects.findIndex((proj, index, arr) => proj.projectName == projectName);
            if (idx >= 0) {
                return this.availableProjects[idx];
            }
        }
        return null;
    }

    /**
     * Display a drop-down picker for selecting the active project.
     * Returns the selection, or null if cancelled.
     */
    private async showProjectPicker() : Promise<ProjectDefinition|null> {
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

        return this.getProjectByName(selectedItem.label);
    }

    /**
     * Change the active project.
     * Fires onProjectSelected so other parts of the extension are notified to the project change
     * 
     * @param project The project to activate
     */
    private async selectProject(project: ProjectDefinition | null = null) {
        if (!project) {
            project = await this.showProjectPicker();
            if (!project) {
                return null;
            }
        }

        logger.info(`'${project.projectName}' selected`);
        this.currentProject = project;

        // Parse the project files to learn more about the current project
        // await this.loadPlatformBuild(this.currentProject);
        // await this.loadProjectDef(this.currentProject);

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

        // Save the currently selected project to persistent storage
        this.selectedProjectName.Value = this.currentProject.projectName;

        // TODO: Store this in persistentState

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

        // Notify others that the active project has changed
        this._onProjectSelected.fire(project);

        //utils.showMessage(`${this.currentProject.projectName} loaded!`);

        this.updateStatusBar();
    }

    // async loadPlatformBuild(def: ProjectDefinition) {
    //     // TODO: Future support for C/C++ extension
    //     // // Find PlatformBuild.py and import the module scope (if possible)
    //     // try {
    //     //     let pythonScript = vscode.Uri.file(utils.extension.extensionPath + '/extra/PlatformBuildEnv.py');
    //     //     let result = await exec.execPythonScript(
    //     //         pythonScript, 
    //     //         [def.platformBuildScriptPath], 
    //     //         def.projectRoot);


    //     //     if (result) {
    //     //         let module = JSON.parse(result);
    //     //         logger.info(`PlatformBuild.py parsed: ${module}`);
    //     //         //utils.showMessage('PlatformBuild.py loaded');

    //     //         if (module.MODULE_PKGS) {
    //     //             logger.info(`Selected PlatformBuild.py includes the following packages: ${module.MODULE_PKGS}`);
    //     //             def.packageSearchPaths = module.MODULE_PKGS;
    //     //         }

    //     //         // This is only available if you initialize the platform build environment (PlatformBuilder.SetPlatformEnv())
    //     //         if (module.ACTIVE_PLATFORM) {
    //     //             def.platformDscPath = module.ACTIVE_PLATFORM;
    //     //         }
    //     //     }
    //     // } catch (e) {
    //     //     logger.error(`Error loading PlatformBuild script: ${e}`, e);
    //     //     // Continue on...
    //     // }
    // }

    // async loadProjectDef(proj: ProjectDefinition)
    // {
    //     if (!proj.platformDscPath) {
    //         throw new Error('platformDscPath not defined');
    //     }
    //     logger.info(`Platform DSC: ${proj.platformDscPath}`);

    //     // Parse the DSC file
    //     //proj.projectDsc = await dsc.DscFile.ParseFile(proj.platformDscPath, proj.packageSearchPaths); // TODO
    // }

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
