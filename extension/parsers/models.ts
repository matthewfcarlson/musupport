import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, IComponent, IDscLibClass, InfData, DecData, DscPcdType } from "./types";
import * as utils from '../utilities';
import { Path } from '../utilities';
import { InfPaser } from './inf_parser';
import { logger } from '../logger';
import { LibraryStore, InfStore } from '../data_store';
import { DscPaser } from '../dsc/parser';
import { DecPaser } from './dec_parser';

/***
 * Represents a DEC/DSC package
 * A package may include zero or more components or library classes
 */
export class Package {
    private workspace: vscode.WorkspaceFolder;

    name: string;
    dec: DecData;
    dsc: IDscData;
    dscExtended: IDscDataExtended;
    isProject: boolean;

    // Libraries contained within this package (not necessarily referenced in the DSC or DEC)
    libraries: LibraryStore;

    // Libraries exported by this package's DEC file
    exportedLibraries: Library[];

    // Libraries built by this package's DSC file
    //includedLibraries: Library[];

    get dscFilePath(): Path { return (this.dsc) ? new Path(this.dsc.filePath) : null; }
    get decFilePath(): Path { return (this.dec) ? new Path(this.dec.infPath) : null; }

    get filePath(): Path { return this.decFilePath; }
    get fileName(): string { return (this.filePath) ? this.filePath.basename : null; }
    get packageRoot(): Path { return (this.filePath) ? this.filePath.parent : null; }

    /**
     * Returns a flattened list of components referenced in the DSC.
     */
    get components(): Component[] { 
        if (this.dec && this.dec.components) {
            let items: Component[] = [];

            // Iterate over each architecture
            for (let [arch, components] of this.dec.components.entries()) {
                for (let component of components) {
                    // TODO: Will need to parse the INF component??
                    let comp: IComponent = {
                        infPath: new Path(component),
                        archs: [], // TODO
                        libraryClasses: null,
                        source: null
                    };
                    items.push(new Component(comp, this, null)); // TODO: Name should come from INF
                }
            }
            return items;
        }
        return null;
    }

    get libraryClassesGroupedByName(): Map<string, Library[]> {
        let map = new Map<string, Library[]>();
        for (let [name, items] of this.libraries.getLibrariesGroupedByName()) {
            map.set(name, items);
        }
        return map;
    }

    async addLibrary(lib: Library) {
        this.libraries.add(lib);
    }

    async scanLibraries(libraryStore: LibraryStore) {
        // let infs = await infStore.getInfsInPath(this.packageRoot);
        // if (infs) {
        //     for (let inf of infs) {
        //         let lib = Library.fromInfData(inf, this);
        //         if (lib) {
        //             this.libraries.add(lib);
        //         }
        //     }
        // }
        let libraries = libraryStore.getLibrariesInPath(this.packageRoot);
        if (libraries) {
            for (let lib of libraries) {
                lib.package = this; // Update package owner
                this.libraries.add(lib);
            }
        }
    }

    static async createFromDec(decFile: Path, workspace: vscode.WorkspaceFolder) {
        // DEC is required, DSC is optional.
        let dec: DecData = await DecPaser.ParseDec(decFile);
        if (dec) {
            // Check to see if there's a corresponding DSC file
            let dsc: IDscData;
            let dscFile = decFile.replaceExtension('.dsc');
            if (await utils.promisifyExists(dscFile.toString())) {
                if (dscFile) {
                    dsc = await DscPaser.Parse(dscFile.toUri(), workspace.uri);
                }
            }
            if (dsc) {
                // TODO
                // if (dsc.errors) {
                //     logger.error(`Could not parse DSC: ${dsc.errors}`); // TODO: Verify formatting
                //     continue;
                // }
            }

            return new Package(workspace, dec, dsc);
        }
        return null;
    }

    constructor(workspace: vscode.WorkspaceFolder, decData: DecData, dscData: IDscData = null, extendedData: IDscDataExtended = null) {
        this.workspace = workspace;
        this.dec = decData;
        this.dsc = dscData;
        this.dscExtended = extendedData;
        this.libraries = new LibraryStore(this.workspace);
        this.exportedLibraries = [];
        this.isProject = false;

        if (this.dec) {
            if (this.dec.defines) {
                let def = this.dec.defines.get('PACKAGE_NAME');
                if (def) { this.name = def.toString(); }
            }

            if (!this.name && this.dec.infPath) {
                this.name = this.dec.infPath.basename;
            }

            if (this.dec.libraryClasses) {
                for (let lib of this.dec.libraryClasses) {
                    this.exportedLibraries.push(new Library(lib, this)); // TODO: Pull library from LibraryStore
                }
            }
        }

        if (this.dsc) {
            // TODO
            // INF libraries built by the DSC
            // for (let lib of pkg.libraryClasses) {
            //     this.libraryClassStore.add(lib);
            // }
            if (this.dsc.defines) {
                let def = this.dsc.defines.get('PLATFORM_NAME');
                if (def) {
                    this.isProject = true;
                    this.name = def.trim();
                }
            }
        }

        // if (this.data) {
        //     if (this.data.defines) {
        //         let def = this.data.defines.get('PLATFORM_NAME');
        //         if (def) { this.name = def.toString(); }

        //         if (!this.name) {
        //             let def = this.data.defines.get('PROJECT_NAME');
        //             if (def) { this.name = def.toString(); }
        //         }
        //     }
            
        //     if (!this.name && this.data.filePath) {
        //         this.name = path.basename(data.filePath.fsPath);
        //     }
            
        //     if (!this.name) {
        //         throw new Error(`Could not find name for DSC`);
        //     }
        // }

        if (!this.name) {
            throw new Error(`Could not find name for Package`);
        }
    }
}

/**
 * Represents an INF component (PEI/DXE/SMM Driver/Application)
 */
export class Component {
    name: string;
    data: IComponent;
    filePath: Path;

    constructor(data: IComponent, pkg: Package = null, name: string = null) {
        this.data = data;
        this.name = name;

        if (data) {
            this.filePath = data.infPath;

            if (!this.name && this.filePath) {
                this.name = path.basename(this.filePath.toString());
            }
        }
    }
}

/**
 * Represents an INF library
 */
export class Library {
    name: string;
    class: string;
    data: IComponent;
    package: Package;  // The package that the library belongs to
    filePath: Path;

    get archs() { return this.data.archs; }

    static async parseInf(infFile: Path) : Promise<Library> {
        try {
            return Library.fromInfData(await InfPaser.ParseInf(infFile));
        } catch (e) {
            logger.error(`Error parsing INF: ${infFile} - ${e}`);
        }
        return null;
    }

    static fromInfData(info: InfData, pkg: Package = null) : Library {
        if (info && info.defines) {
            let infPath = new Path(info.infPath);
            let comp: IDscLibClass = {
                name: infPath.basename,
                class: null,
                infPath: infPath,
                archs: [], // TODO: Populate from INF
                source: null
            };

            // Get the library class
            let lclass: string = info.defines.get('LIBRARY_CLASS')
            if (!lclass) {
                // This INF is not a library!
                return null;
            }

            if (lclass.indexOf('|') > 0) {
                let [def_classname, def_classtypes] = lclass.split('|');
                if (def_classname) {
                    comp.class = def_classname.trim();
                }
            } else {
                comp.class = lclass.trim();
            }

            // Get the INF basename
            let def_basename = info.defines.get('BASE_NAME');
            if (def_basename) {
                comp.name = def_basename.trim();
            }

            return new Library(comp, pkg);
        }
    }

    constructor(data: IDscLibClass, pkg: Package = null) {
        this.data = data;
        this.package = pkg;

        if (data) {
            this.filePath = data.infPath;
            this.name = (data.name) ? data.name.toString() : null;
            this.class = (data.class) ? data.class.toString() : null;
        }

        if (!this.name && this.filePath) {
            this.name = this.filePath.basename;
        }
    }
}
