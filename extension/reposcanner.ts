import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utilities';
import { ProjectDefinition, ProjectManager } from './projectmanager';
import { stringify } from 'querystring';
import { logger } from './logger';
import { InfPaser } from './cpp/parsers/inf_parser';

export class PackageSet {
    rootPath: vscode.Uri;
    packages: PackageDefinition[];
}

export class PackageDefinition {
    name: string; // eg. 'MdePkg'

    dscPath: vscode.Uri;

    defines: string[];
    pcds: string[];
    components: string[];
    libraryClasses: string[];
}

/*
    The RepoScanner class is responsible for scanning the repository for projects and other information.
    It may feed this information into the ProjectManager or the C/C++ language provider.
*/
export class RepoScanner implements vscode.Disposable {
    private readonly _onProjectDiscovered: vscode.EventEmitter<ProjectDefinition> = new vscode.EventEmitter<ProjectDefinition>();
    public  readonly  onProjectDiscovered: vscode.Event<ProjectDefinition>        = this._onProjectDiscovered.event;

    private readonly _onPackageDiscovered: vscode.EventEmitter<PackageDefinition> = new vscode.EventEmitter<PackageDefinition>();
    public  readonly  onPackageDiscovered: vscode.Event<PackageDefinition>        = this._onPackageDiscovered.event;

    constructor() {
    }

    dispose() {
        this._onProjectDiscovered.dispose();
    }

    async scanForPackages() {
        // TODO: If project is selected, filter search path to only those that the project references.

        // Find all DSC files in the workspace that match the specified glob
        var dscFiles = await vscode.workspace.findFiles(`**/*.dsc`); // TODO: Better path handling
        if (!dscFiles) {
            return null;
        }

        //let packageSets: Map<string, PackageDefinition> = new Map<string, PackageDefinition>();
        
        for (let uri of dscFiles) {
            let dscPath = uri;
            let dscName = path.basename(uri.fsPath);
            let dscParentPath = vscode.Uri.file(path.dirname(uri.fsPath));
            let pkgsetName = path.basename(dscParentPath.fsPath);

            let inf = await InfPaser.ParseInf(dscPath.fsPath);
            if (inf && inf.defines) {
                let pkgName = inf.defines.get('PLATFORM_NAME');
                if (!pkgName) {
                    pkgName = inf.defines.get('PACKAGE_NAME');
                    if (!pkgName) {
                        pkgName = path.basename(uri.fsPath, '.dsc');
                    }
                }
                //let pkgGuid = inf.defines.get('PLATFORM_GUID');

                let def: PackageDefinition = {
                    name: pkgName,
                    dscPath: dscPath,
                    defines: [],
                    components: [],
                    libraryClasses: [],
                    pcds: []
                };

                //packageSets[dscParentPath.fsPath] = def;
                //packageSets.set(pkgsetName, def);
                logger.info(`Discovered DSC: ${pkgName}`);
                this._onPackageDiscovered.fire(def);
            }
            else {
                logger.warn(`Invalid DSC: ${dscPath.fsPath}`);
            }
        }

        // for (let [item, def] of packageSets.entries()) {
        //     logger.info(`Discovered package set: ${item}`);
        //     this._onPackageDiscovered.fire(def);
        // }
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
        var platformDscFiles = await vscode.workspace.findFiles(`**/${platformDsc}`); // TODO: Better path handling
        if (!platformDscFiles) {
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
        proj.buildRoot = ""; // TODO: Point to build folder (eg. /Build/MsftXPkg/)

        // Project name derived from the folder that contains the build script
        // TODO: Pull it from the DSC file instead...
        proj.projectName = path.basename(proj.projectRoot);

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