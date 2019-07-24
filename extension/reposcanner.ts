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

    // public projects: ProjectDefinition[];
    // public packages: Package[];
    // public components: ComponentDefinition[];
    // public libraryClasses: LibraryClassDefinition[];

    public projects:            Set<ProjectDefinition>;
    public packagesStore:       PackageStore;
    public libraryClassStore:   LibraryClassStore;

    constructor(private readonly workspace: vscode.WorkspaceFolder) {
        this.projects = new Set<ProjectDefinition>();
        this.packagesStore = new PackageStore();
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

            this.clear();

            // Scan for all INFs in the repository
            // NOTE: It is faster to do a single batch search than many individual searches.
            let infFiles = (await vscode.workspace.findFiles('**/*.inf'))
                .map((f) => new Path(f.fsPath));

            // Find all DSC files in the workspace that match the specified glob
            let decFiles = await vscode.workspace.findFiles('**/*.dsc');
            if (decFiles) {
                for (let uri of decFiles) {
                    let def: Package;
                    let dscPath = uri;
                    let dscParentPath = vscode.Uri.file(path.dirname(uri.fsPath));

                    let dsc: IDscData = await DscPaser.Parse(dscPath, this.workspace.uri);
                    if (dsc) {
                        // if (dsc.errors) {
                        //     logger.error(`Could not parse DSC: ${dsc.errors}`); // TODO: Verify formatting
                        //     continue;
                        // }

                        logger.info(`Discovered DSC: ${dsc.filePath.fsPath}`);
                        let pkg = new Package(dsc);

                        // INF libraries built by the DSC
                        // for (let lib of pkg.libraryClasses) {
                        //     this.libraryClassStore.add(lib);
                        // }

                        // Look for INF libraries contained within the package root
                        // TODO: Edge case - what if the a DEC package is defined inside another DEC package?
                        let libs = infFiles.filter((f) => f.startsWith(pkg.packageRoot.toString()));
                        for (let infPath of libs) {
                            let lib = await Library.parseInf(infPath);
                            if (lib) {
                                // Add to package's known libraries
                                pkg.addLibrary(lib);

                                // Also add to global library store
                                this.libraryClassStore.add(lib);
                            }
                        }

                        // Look for buildable project packages
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
            }

        } catch (e) {
            logger.error(`Error scanning packages: ${e}`, e);
            throw e;
        }
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
        return proj;
    }

    private async gatherProjectInformation(proj: ProjectDefinition) {
        // TODO: Parse DSC

        // TODO: Automatically pull from build script
        proj.configs = ['DEV', 'SELFHOST'];
        
        //proj.projectName = ""; // TODO: Pull from DSC's PLATFORM_NAME property
    }


}


export class PackageStore {
    private packages: Package[];
    private package_map: Map<string, Package>;

    constructor() {
        this.packages = [];
        this.package_map = new Map<string, Package>();
    }

    clear() {
        this.packages = [];
        this.package_map.clear();
    }

    add(pkg: Package) {
        if (pkg) {
            this.packages.push(pkg);
            this.package_map.set(pkg.name, pkg);
        }
    }

    get items(): Package[] {
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
    // TODO: Use a Set<Library> for the inner collection.
    private libraries: Library[];
    private class_map: Map<string, Map<string, Library>>;

    constructor() {
        this.libraries = [];
        this.class_map = new Map<string, Map<string, Library>>();
    }

    clear() {
        this.libraries = [];
        this.class_map.clear();
    }

    add(lib: Library) {
        if (lib) {
            this.libraries.push(lib);

            // Add library class to dictionary
            let entries = this.class_map.get(lib.class) || new Map<string, Library>();
            entries.set(lib.filePath.toString(), lib);
            this.class_map.set(lib.class, entries);
        }
    }

    get items(): Library[] {
        return this.libraries;
    }

    get classes(): string[] {
        return Array.from(this.class_map.keys());
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
    getLibrariesGroupedByName(): [string, Library[]][] {
        return Array
            .from(this.class_map.entries())
            .map(
               ([a,b]) => { 
                   let r: [string, Library[]] = [a, Array.from(b.values())];
                   return r;
                }
            );
    }
}

