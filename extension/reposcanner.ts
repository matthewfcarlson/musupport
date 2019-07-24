import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utilities';
import { ProjectDefinition, ProjectManager } from './projectmanager';
import { stringify } from 'querystring';
import { logger } from './logger';
import { InfData, DecData, IDscDataExtended, IDscData, IComponent, DscArch, ISourceInfo, IDscLibClass } from "./parsers/types";
import { DscPaser } from './dsc/parser';
import { Package, Library } from './parsers/models';
import { Path } from './utilities';
import { PackageStore, LibraryStore } from './data_store';

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

    private readonly _onPackageDiscovered: vscode.EventEmitter<Package> = new vscode.EventEmitter<Package>();
    public  readonly  onPackageDiscovered: vscode.Event<Package>        = this._onPackageDiscovered.event;

    private readonly _onLibrariesDiscovered: vscode.EventEmitter<Library[]>  = new vscode.EventEmitter<Library[]>();
    public readonly   onLibrariesDiscovered: vscode.Event<Library[]>         = this._onLibrariesDiscovered.event;

    // public projects: ProjectDefinition[];
    // public packages: Package[];
    // public components: ComponentDefinition[];
    // public libraryClasses: LibraryClassDefinition[];

    public projects:            Set<ProjectDefinition>;
    public packageStore:       PackageStore;
    public libraryClassStore:   LibraryStore;

    constructor(private readonly workspace: vscode.WorkspaceFolder) {
        this.projects           = new Set<ProjectDefinition>();
        this.libraryClassStore  = new LibraryStore(workspace);
        this.packageStore       = new PackageStore(workspace, this.libraryClassStore);

        const config = vscode.workspace.getConfiguration(null, null);
        this.packageStore.onPackageDiscovered(async (pkg) => {
            this._onPackageDiscovered.fire(pkg); // forward event

            const platformDsc: string = config.get('musupport.platformDsc');
            if (platformDsc && (pkg.fileName == platformDsc)) {
                await this.discoveredProject(pkg);
            }
        });
    }

    dispose() {
        this._onProjectDiscovered.dispose();
        this._onPackageDiscovered.dispose();
        this._onLibrariesDiscovered.dispose();
    }

    private clear() {
        this.projects.clear();
        this.packageStore.clear();
        this.libraryClassStore.clear();
    }

    async scan() {
        this.clear();
        
        await this.libraryClassStore.scanForLibraries();
        this._onLibrariesDiscovered.fire(null);

        await this.packageStore.scanForPackages();
    }

    private async discoveredProject(pkg: Package) {
        let proj = await this.createProjectDefFromDsc(pkg.filePath.toUri());
        this.projects.add(proj);
        
        // Signal project has been discovered
        logger.info(`Project Found: ${proj.projectName} @ ${proj.platformDscPath}`);
        this._onProjectDiscovered.fire(proj);
    }

    // private async scanForProjects() {
        
    //     const platformDsc: string = config.get('musupport.platformDsc');
    //     if (!platformDsc) {
    //         utils.showError('musupport.platformDsc is not defined');
    //     }

    //     let projectPackages = this.packageStore.getPackagesByFilename(platformDsc);
    //     if (projectPackages) {
    //         for (let pkg of projectPackages) {

    //         }
    //     }
    // }

    // private async scanForPackages() {
    //     try {
    //         // TODO: If project is selected, filter search path to only those that the project references.


    //         this.clear();




    //         if (decFiles) {
    //             for (let uri of decFiles) {
    //                 let def: Package;
    //                 let dscPath = uri;
    //                 let dscParentPath = vscode.Uri.file(path.dirname(uri.fsPath));

    //                 let dsc: IDscData = await DscPaser.Parse(dscPath, this.workspace.uri);
    //                 if (dsc) {


    //     } catch (e) {
    //         logger.error(`Error scanning packages: ${e}`, e);
    //         throw e;
    //     }
    // }

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
        return proj;
    }

    private async gatherProjectInformation(proj: ProjectDefinition) {
        // TODO: Parse DSC

        // TODO: Automatically pull from build script
        proj.configs = ['DEV', 'SELFHOST'];
        
        //proj.projectName = ""; // TODO: Pull from DSC's PLATFORM_NAME property
    }
}


