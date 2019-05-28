import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utilities';
import { ProjectDefinition, ProjectManager } from './projectmanager';
import { stringify } from 'querystring';
import { logger } from './logger';

/*
    The RepoScanner class is responsible for scanning the repository for projects and other information.
    It may feed this information into the ProjectManager or the C/C++ language provider.
*/
export class RepoScanner implements vscode.Disposable {
    private readonly _onProjectDiscovered: vscode.EventEmitter<ProjectDefinition> = new vscode.EventEmitter<ProjectDefinition>();
    public  readonly  onProjectDiscovered: vscode.Event<ProjectDefinition>        = this._onProjectDiscovered.event;

    constructor() {
    }

    dispose() {
        this._onProjectDiscovered.dispose();
    }

    async gatherProjectInformation(def: ProjectDefinition) {
        def.configs = ['DEV', 'SELFHOST'];
        // TODO: Automatically pull from build script
    }

   async scanForProjects(): Promise<ProjectDefinition[]> {
        const config = vscode.workspace.getConfiguration(null, null);
        const platformBuildScript: string = config.get('musupport.platformBuildScript');
        const platformDsc: string = config.get('musupport.platformDsc');
        //config.update('musupport.currentProj', '', false);
        if (!platformBuildScript) {
            logger.error('musupport.platformBuildScript is not defined');
            return null;
        }
        if (!platformDsc) {
            logger.error('musupport.platformDsc is not defined');
            return null;
        }

        // In the future we could use DSC files instead of PlatformBuild.py files to represent a project.
        var platformBuildScriptFiles = await vscode.workspace.findFiles(platformBuildScript);
        var platformDscFiles         = await vscode.workspace.findFiles(platformDsc);

        //console.log(`Projects detected in workspace (using ${platformBuildScript})`);
        //console.log(platformBuildScriptFiles);
        if (!platformBuildScriptFiles) {
            vscode.window.showWarningMessage('No UEFI projects detected in the workspace (Looking for PlatformBuild.py)');
            return null;
        }

        var promises = platformBuildScriptFiles
            .map((f) => this.createProjectDef(f, platformDscFiles));
        return (await Promise.all(promises))
            .filter((def) => (def)); // Remove null entries
    }

    private async createProjectDef(uri: vscode.Uri, platformDscFiles: vscode.Uri[]) {
        if (!uri) {
            throw new Error('Project uri must not be null');
        }

        var def = new ProjectDefinition();
        def.platformBuildScriptPath = uri.fsPath;
        //def.platformDscPath = null; // This gets discovered later
        def.projectRoot = path.dirname(uri.fsPath);
        def.buildRoot = ""; // TODO

        // Project name derived from the folder that contains the build script
        def.projectName = path.basename(path.dirname(def.platformBuildScriptPath));

        // Find a matching DSC file, if possible
        let matches = platformDscFiles.filter((file) => (file) && (file.fsPath.startsWith(def.projectRoot)));
        if (matches && matches[0]) {
            def.platformDscPath = matches[0].fsPath;
        }
        if (!def.platformDscPath) {
            logger.info(`WARNING: Could not find a DSC for project '${def.projectName}'`);
            return null;
        }

        await this.gatherProjectInformation(def);

        // Signal project has been discovered
        this._onProjectDiscovered.fire(def);

        logger.info(`Project Found: ${def.projectName} @ ${def.platformDscPath}`);
        return def;
    }

}