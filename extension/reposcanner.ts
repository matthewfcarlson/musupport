import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utilities';
import { ProjectDefinition, ProjectManager } from './projectmanager';
import { stringify } from 'querystring';
import { logger } from './logger';
import { InfData, DecData, IDscDataExtended, IDscData, IDscComponent, DscArch, ISourceInfo, DscLibClass } from "./parsers/types";
import { DscPaser } from './dsc/parser';
import { DscPackage } from './parsers/models';

/***
 * Represents a PCD entry in a DSC
 */
export class PCD {
    // TODO: Namespace, Name, Value
    constructor(public name: string) { }
}


/*
    The RepoScanner class is responsible for scanning the repository for projects and other information.
    It may feed this information into the ProjectManager or the C/C++ language provider.
*/
export class RepoScanner implements vscode.Disposable {
    private readonly _onProjectDiscovered: vscode.EventEmitter<ProjectDefinition> = new vscode.EventEmitter<ProjectDefinition>();
    public  readonly  onProjectDiscovered: vscode.Event<ProjectDefinition>        = this._onProjectDiscovered.event;

    private readonly _onPackageDiscovered: vscode.EventEmitter<DscPackage> = new vscode.EventEmitter<DscPackage>();
    public  readonly  onPackageDiscovered: vscode.Event<DscPackage>        = this._onPackageDiscovered.event;

    // public projects: ProjectDefinition[];
    // public packages: DscPackage[];
    // public components: ComponentDefinition[];
    // public libraryClasses: LibraryClassDefinition[];

    constructor(private readonly workspace: vscode.WorkspaceFolder) {
    }

    dispose() {
        this._onProjectDiscovered.dispose();
    }

    async scanForPackages() {
        try {
            // TODO: If project is selected, filter search path to only those that the project references.

            // Find all DSC files in the workspace that match the specified glob
            var dscFiles = await vscode.workspace.findFiles(`**/*.dsc`); // TODO: Better path handling
            if (!dscFiles) {
                return null;
            }

            for (let uri of dscFiles) {
                let def: DscPackage;
                let dscPath = uri;
                let dscParentPath = vscode.Uri.file(path.dirname(uri.fsPath));

                let dsc: IDscData = await DscPaser.Parse(dscPath, this.workspace.uri);
                if (dsc) {
                    // if (dsc.errors) {
                    //     logger.error(`Could not parse DSC: ${dsc.errors}`); // TODO: Verify formatting
                    //     continue;
                    // }
                    logger.info(`Discovered DSC: ${dsc.filePath.fsPath}`);
                    let def = new DscPackage(dsc);
                    this._onPackageDiscovered.fire(def);
                }
            }
        } catch (e) {
            logger.error(`Error scanning packages: ${e}`, e);
            throw e;
        }
    }

    /*
        Scan the workspace for projects, as defined by musupport.platformDsc glob pattern.
        A project must have a DSC file, and may optionally have a PlatformBuild.py build script.
        If the PlatformBuild.py build script is not present, functionality will be limited.
    */
    async scanForProjects(): Promise<ProjectDefinition[]> {
        const config = vscode.workspace.getConfiguration(null, null);
        const platformDsc: string = config.get('musupport.platformDsc');
        if (!platformDsc) {
            utils.showError('musupport.platformDsc is not defined');
            return null;
        }

        // Find all DSC files in the workspace that match the specified glob
        var platformDscFiles = await vscode.workspace.findFiles("**/"+platformDsc); // TODO: Better path handling
        if (!platformDscFiles) {
            logger.warn("No files found for the GLOB")
            return null;
        }
        
        // Create a project definition for each DSC file
        var promises = platformDscFiles
            .map((f) => this.createProjectDefFromDsc(f));
        return (await Promise.all(promises))
            .filter((def) => (def)); // Remove null entries
    }

    private async createProjectDefFromDsc(uri: vscode.Uri) : Promise<ProjectDefinition> {
        if (!uri) {
            throw new Error('Project uri must not be null');
        }

        var proj = new ProjectDefinition();
        proj.platformDscPath = uri.fsPath;
        proj.projectRoot = path.dirname(uri.fsPath);
        //TODO read the DSC in and parse it
        proj.buildRoot = ""; // TODO: Point to build folder (eg. /Build/MsftXPkg/)

        // Project name derived from the folder that contains the build script
        // TODO: Pull it from the DSC file instead...
        proj.projectName = path.basename(proj.projectRoot);
        logger.info("Found project "+proj.projectName);

        // Find the PlatformBuild.py file matching a pattern, if available
        const config = vscode.workspace.getConfiguration(null, null);
        const platformBuildScript: string = config.get('musupport.platformBuildScript');
        if (platformBuildScript) {
            let projFiles = await utils.promisifyGlob(path.join(proj.projectRoot, platformBuildScript));
            if (projFiles) {
                proj.platformBuildScriptPath = projFiles[0]; // TODO: Make this relative?
                logger.info(`Platform build script found: ${proj.platformBuildScriptPath}`);
            }
            // let projFiles = await utils.promisifyReadDir(proj.projectRoot);
            // if (projFiles && projFiles.indexOf(platformBuildScript) >= 0) {
            // }
        }

        if (!proj.platformBuildScriptPath) {
            logger.warn('No platform build script found for project');
        }

        await this.gatherProjectInformation(proj);

        // Signal project has been discovered
        this._onProjectDiscovered.fire(proj);

        logger.info(`Project Found: ${proj.projectName} @ ${proj.platformDscPath}`);
        return proj;
    }

    private async gatherProjectInformation(proj: ProjectDefinition) {
        // TODO: Parse DSC

        // TODO: Automatically pull from build script
        proj.configs = ['DEV', 'SELFHOST'];
        
        //proj.projectName = ""; // TODO: Pull from DSC's PLATFORM_NAME property
    }


}