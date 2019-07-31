import { logger, setLoggerDirectory } from "./logger";
import * as vscode from 'vscode';
import * as path from 'path';
import { promisifyExists, promisifyGlob, promisifyIsDir, delay, getPackageFromPath, Path } from './utilities';
import { InfPaser } from "./parsers/inf_parser";
import { DecPaser } from "./parsers/dec_parser";
import { ExceptionHandler } from "winston";
import { InfData, DecData, IDscData, DscLibClass } from "./parsers/types";
import { PathLike } from "fs";
import { Library, Package } from "./parsers/models";
import { DscParser } from "./dsc/parser";
import * as utils from './utilities';

//TODO make this a map or an array to handle multiple workspaces
let _SharedInfStore: InfStore;

/**
 * This class stores the relationship between a given file and the inf
 */
export class InfStore {
    private workspace: vscode.WorkspaceFolder;
    
    private infs: Map<string, InfData>;
    private possibleInfPaths: Set<string>;
    //this keeps track of an inf(value) for the source file (key)
    private infsForSource: Map<string, InfData[]>;
    //need some way to keep track of file => inf's
    //
    
    public infFiles: Path[];

    private scanInProgress = false;
    constructor(workspace: vscode.WorkspaceFolder) {
        this.infFiles = [];
        this.infs = new Map();
        this.infsForSource = new Map();
        this.possibleInfPaths = new Set();
        this.workspace = workspace;
        this.Clear();
    }

    public static GetStore(): InfStore {
        return _SharedInfStore;
    }
    public static SetupStore(ws: vscode.WorkspaceFolder): InfStore {
        _SharedInfStore = new InfStore(ws);
        return _SharedInfStore;
    }

    public HasInfForFile(uri: vscode.Uri): boolean {
        logger.info("INF_STORE: Looking for " + uri.fsPath);
        const found = this.infsForSource.has(uri.fsPath);

        if (found) logger.info("INF_STORE: found");

        return found;
    }
    public GetInfsForFile(uri: vscode.Uri): InfData[] {
        if (!this.HasInfForFile(uri)) return [];
        const data = this.infsForSource.get(uri.fsPath);
        return data;
    }

    /**
     * Clears the relationship for a given URI
     * @param uri if not specified, clear all relationships
     */
    public Clear(uri?: vscode.Uri) {
        logger.info("INF_STORE Clearing data");
        if (uri) {
            logger.error("INF_STORE clearing for specific URI is not supported")
        }
        else {
            this.infFiles = [];
            this.infs.clear();
            this.infsForSource.clear();
            this.possibleInfPaths.clear();
        }
    }

    // private async WaitForScanToFinish() {
    //     logger.info("INF_STORE: Waiting for scan to finish");
    //     var waitTimer = 50;
    //     while (this.scanInProgress) { //busy loop
    //         await delay(waitTimer);
    //         waitTimer *= 1.4; //increase the wait timer each time
    //     }
    // }

    public GetPossibleParitalMatches(partial:string):string[]{
        return [];
    }

    // public async Scan(uri?: vscode.Uri) {
    //     if (this.scanInProgress) await this.WaitForScanToFinish();
    //     this.scanInProgress = true;
    //     //TODO make sure that the uri isn't a file (make sure it is a directory)
    //     const basePath = (uri) ? uri.fsPath : this.workspace.uri.fsPath;

    //     logger.info("INF_STORE: Scanning workspace ")

    //     const infFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.inf"));
    //     logger.info("INF_STORE: processing " + infFiles.length + " inf files");

    //     //keep track of all the calls we've made
    //     const asyncCalls = [];
    //     for (const single_file of infFiles) {
    //         asyncCalls.push(this.ProcessInf(single_file));
    //     }
    //     await Promise.all(asyncCalls);

    //     logger.info("INF_STORE: Finished Scanning");
    //     this.scanInProgress = false;

    // }

    // private async ProcessInf(path: string): Promise<void> {
    //     //keep track of the INF
    //     const data = await InfPaser.ParseInf(path);
    //     for (const source of data.sources) {
    //         if (!this.infsForSource.has(source)) this.infsForSource.set(source, []);
    //         this.infsForSource.get(source).unshift(data);
    //     }
    //     if (!this.infs.has(path)) this.infs.set(path, data);


    //     //logger.info("INFSTORE data", data);
    // }

    /**
     * Find all INFs in the workspace, but do not load them
     */
    public async scan() {
        // NOTE: It is faster to do a single batch search than many individual searches.
        this.infFiles = (await vscode.workspace.findFiles('**/*.inf'))
            .map((f) => new Path(f.fsPath));
    }

    /**
     * Get all INFs under a path, and load the INF data
     * @param root The path to search
     */
    public async getInfsInPath(root: Path) : Promise<InfData[]> {
        if (!this.infFiles) return null;

        let infs = this.infFiles.filter(
            (inf) => inf.startsWith(root.toString())
        );
        return Promise.all(
            infs.map((path) => InfPaser.ParseInf(path))
        );
    }
};

export class DecStore {

    private workspace: vscode.WorkspaceFolder;
    private scanInProgress = false;
    private decs: Map<string, DecData[]>;

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
        this.decs = new Map();
        this.Clear();
    }

    /**
     * Finds
     * @param path takes a package path like MdePkg/MdePkg.dec
     */
    public GetDataForFile(filepath: string): DecData[] {
        filepath = path.normalize(filepath);
        if (!this.decs.has(filepath)) return [];
        const data = this.decs.get(filepath);
        return data;
    }

    /**
    * Clears the relationship for a given URI
    * @param uri if not specified, clear all relationships
    */
    public Clear(uri?: string) {
        if (uri) {
            logger.error("DEC_STORE clearing for specific URI is not supported")
        }
        else {
            this.decs.clear();
        }
    }

    private async WaitForScanToFinish() {
        logger.info("DEC_STORE: Waiting for scan to finish");
        var waitTimer = 50;
        while (this.scanInProgress) { //busy loop
            await delay(waitTimer);
            waitTimer *= 1.4; //increase the wait timer each time
        }
    }

    public async Scan(uri?: vscode.Uri) {
        if (this.scanInProgress) await this.WaitForScanToFinish();
        this.scanInProgress = true;
        //TODO make sure that the uri isn't a file (make sure it is a directory)
        const basePath = (uri) ? uri.fsPath : this.workspace.uri.fsPath;

        logger.info("DEC_STORE: Scanning workspace ")

        //scan dec files
        const decFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.dec"));
        logger.info("DEC_STORE: processing " + decFiles.length + " dec files");
        for (const single_file of decFiles) {
            this.ProcessDec(single_file);
        }
        logger.info("DEC_STORE: Finished Scanning");
        this.scanInProgress = false;

    }

    private async ProcessDec(decpath: string) {
        decpath = path.normalize(decpath);
        const data = await DecPaser.ParseDec(new Path(decpath));
        const decFileName = path.basename(decpath);
        const packageName = getPackageFromPath(decpath);
        const packagePath = path.join(packageName,decFileName);
        // check to make sure it's a valid package name
        if (packageName) {
            if (!this.decs.has(packagePath)) this.decs.set(packagePath, []);
            this.decs.get(packagePath).unshift(data);
        }
        else {
            logger.error("DEC_STORE unable to process package name for " + path)
        }
    }


}

/***
 * Keeps track of all DEC packages in the workspace, 
 * and the libraries that they include & export
 */
export class PackageStore {
    private readonly _onPackageDiscovered: vscode.EventEmitter<Package> = new vscode.EventEmitter<Package>();
    public  readonly  onPackageDiscovered: vscode.Event<Package>        = this._onPackageDiscovered.event;

    private workspace: vscode.WorkspaceFolder;

    private packages: Package[];
    private package_map: Map<string, Package>; // name -> package

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
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
            this._onPackageDiscovered.fire(pkg); // event
        }
    }

    get items(): Package[] {
        return this.packages;
    }

    get searchPath(): Path[] {
        return this.packages.map((p) => p.packageRoot);
    }

    public async scanForPackages(libraryStore: LibraryStore) {
        logger.info("PACKAGE_STORE: Scanning workspace ")

        // Find all DEC files in the workspace that match the specified glob
        let decFiles = (await vscode.workspace.findFiles('**/*.dec'))
            .map((f) => new Path(f.fsPath));

        for (let decFile of decFiles) {
            try {
                let pkg = await Package.createFromDec(decFile, this.workspace);
                if (pkg) {
                    logger.info(`Discovered Package: ${pkg.filePath}`);

                    await pkg.scanLibraries(libraryStore);

                    this.add(pkg);
                } else {
                    logger.error(`Could not load DSC package: ${decFile}`);
                }
            } catch (e) {
                logger.error(`Could not parse package: ${decFile} - ${e}`);
            }
        }
    }
}

/**
 * A store of all known library classes
 */
export class LibraryStore {
    private workspace: vscode.WorkspaceFolder;
    //private infStore: InfStore;

    // Grouped by name -> relative path -> library
    // The outer map groups classes by name
    // The inner map keeps a unique set of classes
    // TODO: Use a Set<Library> for the inner collection.
    private files: Path[];
    private libraries: Library[];
    private class_map: Map<string, Map<string, Library>>;

    constructor(workspace: vscode.WorkspaceFolder, public readonly infStore: InfStore) {
        this.files = [];
        this.libraries = [];
        this.class_map = new Map<string, Map<string, Library>>();
    }

    clear() {
        this.files = [];
        this.libraries = [];
        this.class_map.clear();
    }

    async addFromFile(infFile: Path) {
        let lib = await Library.parseInf(infFile);
        if (lib) { this.add(lib); }
    }

    add(lib: Library) {
        if (lib && lib.filePath) {
            this.files.push(lib.filePath);
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

    getLibrariesInPath(root: Path) {
        return this.libraries.filter((lib) => 
            lib.filePath.startsWith(root.toString())
        );
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

    findLibraryByInfo(info: DscLibClass) {
        // TODO: Optimize - O(n^2) operation
        for (let lib of this.libraries) {
            // Search the global list of INF's for the provided info
            if (lib.class == info.class && lib.filePath.endsWithPath(info.infPath)) {
                return lib;
            }
        }
        return null; // Not found!
    }

    public async scanForLibraries(infStore: InfStore) {
        try {
            // Scan for all INFs in the repository
            // NOTE: It is faster to do a single batch search than many individual searches.
            // let infFiles = (await vscode.workspace.findFiles('**/*.inf'))
            //     .map((f) => new Path(f.fsPath));
            let infFiles = infStore.infFiles;
                
            for (let infFile of infFiles) {
                if (infFile) {
                    await this.addFromFile(infFile);
                }
            }

            logger.info(`Discovered ${this.libraries.length} libraries and ${this.class_map.size} unique library classes`);
        } catch (e) {
            logger.error(`Error scanning libraries: ${e}`, e);
            throw e;
        }
    }
}
