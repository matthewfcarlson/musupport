import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, IComponent, IDscLibClass, InfData } from "./types";
import * as utils from '../utilities';
import { Path } from '../utilities';
import { InfPaser } from './inf_parser';
import { logger } from '../logger';
import { LibraryStore, InfStore } from '../data_store';
import { DscPaser } from '../dsc/parser';

/***
 * Represents a DEC/DSC package
 * A package may include zero or more components (.inf), library classes, or PCDs. 
 */
export class Package {
    private workspace: vscode.WorkspaceFolder;

    name: string;
    data: IDscData;
    extendedData: IDscDataExtended;

    // Libraries contained within this package (not necessarily referenced in the DSC or DEC)
    libraries: LibraryStore;

    // Libraries exported by this package's DEC file
    //exportedLibraries: Library[];

    // Libraries built by this package's DSC file
    //includedLibraries: Library[];

    get fileName(): string { return (this.filePath) ? this.filePath.basename : null; }
    get filePath(): Path { return (this.data) ? new Path(this.data.filePath.fsPath) : null; }
    get packageRoot(): Path { return (this.filePath) ? this.filePath.parent : null; }

    /**
     * Returns a flattened list of components referenced in the DSC.
     */
    get components(): Component[] { 
        if (this.data && this.data.components) {
            let items: Component[] = [];

            // Iterate over each architecture
            for (let [arch, components] of this.data.components.entries()) {
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

    async scanLibraries(infStore: InfStore) {
        let infs = await infStore.getInfsInPath(this.packageRoot);
        if (infs) {
            for (let inf of infs) {
                let lib = Library.fromInfData(inf);
                if (lib) {
                    this.libraries.add(lib);
                }
            }
        }
    }

    static async createFromDsc(dscFile: Path, infFiles: Path[], workspace: vscode.WorkspaceFolder) {
        let dsc: IDscData = await DscPaser.Parse(dscFile.toUri(), workspace.uri);
        if (dsc) {
            // TODO
            // if (dsc.errors) {
            //     logger.error(`Could not parse DSC: ${dsc.errors}`); // TODO: Verify formatting
            //     continue;
            // }

            // INF libraries built by the DSC
            // for (let lib of pkg.libraryClasses) {
            //     this.libraryClassStore.add(lib);
            // }

            // Look for INF libraries contained within the package root
            // TODO: Edge case - what if the a DEC package is defined inside another DEC package?
            // let libs = infFiles.filter((f) => f.startsWith(pkg.packageRoot.toString()));
            // for (let infPath of libs) {
            //     let lib = await Library.parseInf(infPath);
            //     if (lib) {
            //         // Add to package's known libraries
            //         pkg.addLibrary(lib);

            //         // Also add to global library store
            //         this.libraryClassStore.add(lib);
            //     }
            // }

            return new Package(workspace, dsc);
        }
    }

    constructor(workspace: vscode.WorkspaceFolder, data: IDscData, extendedData: IDscDataExtended = null) {
        this.workspace = workspace;
        this.data = data;
        this.extendedData = extendedData;
        this.libraries = new LibraryStore(this.workspace);

        if (data) {
            if (this.data.defines) {
                let def = this.data.defines.get('PLATFORM_NAME');
                if (def) { this.name = def.toString(); }

                if (!this.name) {
                    let def = this.data.defines.get('PROJECT_NAME');
                    if (def) { this.name = def.toString(); }
                }
            }
            
            if (!this.name && this.data.filePath) {
                this.name = path.basename(data.filePath.fsPath);
            }
            
            if (!this.name) {
                throw new Error(`Could not find name for DSC`);
            }
        }
    }
}

/**
 * Represents a INF component (PEI/DXE/SMM Driver/Application)
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

export class Library {
    name: string;
    class: string;
    data: IComponent;
    includedInPackage: Package;
    filePath: Path;

    get archs() { return this.data.archs; }

    static async parseInf(infFile: Path) : Promise<Library> {
        try {
            return Library.fromInfData(await InfPaser.ParseInf(infFile.toString()));
        } catch (e) {
            logger.error(`Error parsing INF: ${infFile} - ${e}`);
        }
        return null;
    }

    static fromInfData(info: InfData) : Library {
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

            return new Library(comp);
        }
    }

    constructor(data: IDscLibClass, pkg: Package = null) {
        this.data = data;
        this.includedInPackage = pkg;

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
