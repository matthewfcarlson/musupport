import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, IComponent, IDscLibClass } from "./types";
import * as utils from '../utilities';
import { Path } from '../utilities';
import { LibraryClassStore } from '../reposcanner';
import { InfPaser } from './inf_parser';
import { logger } from '../logger';

/***
 * Represents a DEC/DSC package
 * A package may include zero or more components (.inf), library classes, or PCDs. 
 */
export class Package {
    name: string;
    data: IDscData;
    extendedData: IDscDataExtended;

    // Libraries contained within this package (not necessarily referenced in the DSC or DEC)
    libraries: LibraryClassStore;

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

    constructor(data: IDscData, extendedData: IDscDataExtended = null) {
        this.data = data;
        this.extendedData = extendedData;
        this.libraries = new LibraryClassStore();

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
            let comp: IDscLibClass = {
                name: infFile.basename,
                class: null,
                infPath: infFile,
                archs: [], // TODO: Populate from INF
                source: null
            };

            let info = await InfPaser.ParseInf(infFile.toString());
            if (info && info.defines) {
                // Get the INF basename
                let def_basename = info.defines.get('BASE_NAME');
                if (def_basename) {
                    comp.name = def_basename.trim();
                }

                // Get the library class
                let lclass: string = info.defines.get('LIBRARY_CLASS')
                if (lclass && lclass.indexOf('|') > 0) {
                    let [def_classname, def_classtypes] = lclass.split('|');
                    if (def_classname) {
                        comp.class = def_classname.trim();
                    }
                }
            }

            return Promise.resolve(new Library(comp));
        } catch (e) {
            logger.error(`Error parsing INF: ${infFile} - ${e}`);
            return null;
        }
    }

    constructor(data: IDscLibClass, pkg: Package = null) {
        this.data = data;
        this.includedInPackage = pkg;

        if (data) {
            this.filePath = data.infPath;
            this.name = data.name.toString();
            this.class = data.class.toString();
        }

        if (!this.name && this.filePath) {
            this.name = this.filePath.basename;
        }
    }
}
