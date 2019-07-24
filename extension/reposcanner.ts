import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as utils from './utilities';
import { ProjectDefinition, ProjectManager } from './projectmanager';
import { stringify } from 'querystring';
import { logger } from './logger';
import { InfData, DecData, IDscDataExtended, IDscData, IDscComponent, DscArch, ISourceInfo, IDscLibClass } from "./parsers/types";
import { DscPaser } from './dsc/parser';
import { DscPackage, DscLibraryClass } from './parsers/models';

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

    public projects: Set<ProjectDefinition>;
    public packagesStore: DscPackageStore;
    public libraryClassStore: LibraryClassStore;

    constructor(private readonly workspace: vscode.WorkspaceFolder) {
        this.projects = new Set<ProjectDefinition>();
        this.packagesStore = new DscPackageStore();
        this.libraryClassStore = new LibraryClassStore();
    }

    dispose() {
        this._onProjectDiscovered.dispose();
    }

    private clear() {
        this.projects.clear();
        this.packagesStore.clear();
        this.libraryClassStore.clear();
    }

    async scanForPackages() {
        try {
            // TODO: If project is selected, filter search path to only those that the project references.

            const config = vscode.workspace.getConfiguration(null, null);
            const platformDsc: string = config.get('musupport.platformDsc');
            if (!platformDsc) {
                utils.showError('musupport.platformDsc is not defined');
            }

            // Find all DSC files in the workspace that match the specified glob
            var dscFiles = await vscode.workspace.findFiles(`**/*.dsc`); // TODO: Better path handling
            if (!dscFiles) {
                return null;
            }

            this.clear();

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
                    let pkg = new DscPackage(dsc);

                    for (let lib of pkg.libraryClasses) {
                        this.libraryClassStore.add(lib);
                    }

                    if (platformDsc) {
                        if (pkg.fileName === platformDsc) {
                            let proj = await this.createProjectDefFromDsc(pkg.filePath.toUri());
                            this.projects.add(proj);
                            
                            // Signal project has been discovered
                            logger.info(`Project Found: ${proj.projectName} @ ${proj.platformDscPath}`);
                            this._onProjectDiscovered.fire(proj);
                        }
                    }
                    
                    this.packagesStore.add(pkg);
                    this._onPackageDiscovered.fire(pkg);
                }
            }
        } catch (e) {
            logger.error(`Error scanning packages: ${e}`, e);
            throw e;
        }
    }

    // /*
    //     Scan the workspace for projects, as defined by musupport.platformDsc glob pattern.
    //     A project must have a DSC file, and may optionally have a PlatformBuild.py build script.
    //     If the PlatformBuild.py build script is not present, functionality will be limited.
    // */
    // async scanForProjects(): Promise<ProjectDefinition[]> {
    //     const config = vscode.workspace.getConfiguration(null, null);
    //     const platformDsc: string = config.get('musupport.platformDsc');
    //     if (!platformDsc) {
    //         utils.showError('musupport.platformDsc is not defined');
    //         return null;
    //     }

    //     // Find all DSC files in the workspace that match the specified glob
    //     var platformDscFiles = await vscode.workspace.findFiles("**/"+platformDsc); // TODO: Better path handling
    //     if (!platformDscFiles) {
    //         logger.warn("No files found for the GLOB")
    //         return null;
    //     }
        
    //     // Create a project definition for each DSC file
    //     var promises = platformDscFiles
    //         .map((f) => this.createProjectDefFromDsc(f));
    //     return (await Promise.all(promises))
    //         .filter((def) => (def)); // Remove null entries
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


export class DscPackageStore {
    private packages: DscPackage[];
    private package_map: Map<string, DscPackage>;

    constructor() {
        this.packages = [];
        this.package_map = new Map<string, DscPackage>();
    }

    clear() {
        this.packages = [];
        this.package_map.clear();
    }

    add(pkg: DscPackage) {
        if (pkg) {
            this.packages.push(pkg);
            this.package_map.set(pkg.name, pkg);
        }
    }

    get items(): DscPackage[] {
        return this.packages;
    }
}


/**
 * A store of all known library classes
 */
export class LibraryClassStore {
    // Grouped by name -> relative path -> library
    // The outer map groups classes by name
    // The inner map keeps a unique set of classes
    // TODO: Use a Set<DscLibraryClass> for the inner collection.
    private classes: DscLibraryClass[];
    private class_map: Map<string, Map<string, DscLibraryClass>>;

    constructor() {
        this.classes = [];
        this.class_map = new Map<string, Map<string, DscLibraryClass>>();
    }

    clear() {
        this.classes = [];
        this.class_map.clear();
    }

    add(lib: DscLibraryClass) {
        if (lib) {
            this.classes.push(lib);

            // Add library class to dictionary
            let entries = this.class_map.get(lib.name) || new Map<string, DscLibraryClass>();
            entries.set(lib.filePath.toString(), lib);
            this.class_map.set(lib.name, entries);
        }
    }

    get items(): DscLibraryClass[] {
        return this.classes;
    }

    getLibrariesForArch(arch) {
        return null; // TODO
    }

    getLibrariesForDsc(dsc) {
        return null;
    }

    /**
     * Returns a list of tuples of libraries grouped by name
     */
    getLibrariesGroupedByName(): [string, DscLibraryClass[]][] {
        return Array
            .from(this.class_map.entries())
            .map(
               ([a,b]) => { 
                   let r: [string, DscLibraryClass[]] = [a, Array.from(b.values())];
                   return r;
                }
            );
    }
}

