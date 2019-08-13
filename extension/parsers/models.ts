import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, DscComponent, DscLibClass, InfData, DecData, DscPcdType, DscGuid } from "./types";
import * as utils from '../utilities';
import { Path } from '../utilities';
import { InfPaser } from './inf_parser';
import { logger } from '../logger';
import { LibraryStore, InfStore } from '../data_store';
import { DscParser } from '../dsc/parser';
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

    // DSC references
    referencedLibraries: Library[];
    referencedComponents: Component[];

    // DEC exports
    get exportedLibraryClasses(): Library[] {
        if (this.dec) {
            return this.dec.libraryClasses.map((lib) => {
                if (lib.infPath) { lib.infPath = this.packageRoot.join(lib.infPath); }
                return new Library(lib, this);
            });
        }
        return null;
    }
    get exportedGuids(): DscGuid[] {
        return (this.dec) ? this.dec.guids : null;
    }
    get exportedProtocols(): DscGuid[] {
        return (this.dec) ? this.dec.protocols : null;
    }
    get exportedPcds(): string[] {
        return (this.dec) ? this.dec.pcds : null;
    }

    get dscFilePath(): Path { return (this.dsc) ? new Path(this.dsc.filePath) : null; }
    get decFilePath(): Path { return (this.dec) ? new Path(this.dec.infPath) : null; }

    get filePath(): Path { return this.decFilePath; }
    get fileName(): string { return (this.filePath) ? this.filePath.basename : null; }
    get packageRoot(): Path { return (this.filePath) ? this.filePath.parent : null; }

    /**
     * A list of library classes consumed by the DSC, grouped by class name
     */
    get libraryClassesGroupedByName(): Map<string, Library[]> {
        let map = new Map<string, Library[]>();
        for (let lib of this.referencedLibraries) {
            let entries = map.get(lib.class) || [];
            entries.push(lib);
            map.set(lib.class, entries);
        }
        return map;
    }

    /**
     * Scan for components & libraries referenced by the DSC
     */
    async scanLibraries(libraryStore: LibraryStore) {

        // let libraries = libraryStore.getLibrariesInPath(this.packageRoot);
        // if (libraries) {
        //     for (let lib of libraries) {
        //         lib.package = this; // Update package owner
        //         this.libraries.add(lib);
        //     }
        // }

        // Lookup libraries defined in the DSC
        if (this.dsc) {
            if (this.dsc.libraries) {
                for (let info of this.dsc.libraries) {
                    let lib = libraryStore.findLibraryByInfo(info);
                    if (lib) {
                        // TODO: Is this the best way to figure out whether a library belongs to a DSC?
                        if (lib.filePath.startsWithPath(this.packageRoot)) {
                            lib.setOwnerPackage(this);
                        }

                        this.referencedLibraries.push(lib);
                    }
                    else {
                        logger.warn(`Could not find library ${info.className}|${info.infPath} referenced by DSC ${this.dsc.filePath.basename}`);
                    }
                }
            }

            if (this.dsc.components) {
                for (let info of this.dsc.components) {
                    let comp = new Component(info, this);
                    // TODO: Add to component store
                    this.referencedComponents.push(comp);
                }
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
                    dsc = await DscParser.Parse(dscFile, workspace.uri);
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

    toString(): string {
        return `${this.name}`;
    }

    constructor(workspace: vscode.WorkspaceFolder, decData: DecData, dscData: IDscData = null, extendedData: IDscDataExtended = null) {
        this.workspace = workspace;
        this.dec = decData;
        this.dsc = dscData;
        this.dscExtended = extendedData;

        this.referencedLibraries = [];
        this.referencedComponents = [];

        if (this.dec) {
            if (this.dec.defines) {
                let def = this.dec.defines.get('PACKAGE_NAME');
                if (def) { this.name = def.toString(); }
            }

            if (!this.name && this.dec.infPath) {
                this.name = this.dec.infPath.basename;
            }
        }

        if (this.dsc) {
            if (this.dsc.defines) {
                let def = this.dsc.defines.get('PLATFORM_NAME');
                if (def) {
                    this.name = def.trim();
                }
            }
        }

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
    data: DscComponent;
    filePath: Path;

    constructor(data: DscComponent, pkg: Package = null, name: string = null) {
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
    data: DscComponent;
    package: Package;  // The package that the library belongs to
    filePath: Path;

    get archs() { return this.data.descriptors; }

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
            let comp: DscLibClass = {
                name: infPath.basename,
                className: null,
                infPath: infPath,
                descriptors: [], // TODO: Populate from INF
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
                    comp.className = def_classname.trim();
                }
            } else {
                comp.className = lclass.trim();
            }

            // Get the INF basename
            let def_basename = info.defines.get('BASE_NAME');
            if (def_basename) {
                comp.name = def_basename.trim();
            }

            return new Library(comp, pkg);
        }
    }

    setOwnerPackage(pkg: Package) {
        if (pkg) {
            if (this.package && this.package != pkg) {
                logger.warn(`Library ${this} is included in multiple DSCs (${this.package.name}, ${pkg.name})`);
            }
            this.package = pkg;
        }
    }

    toString(): string {
        return `${this.class||"NULL"}|${this.filePath}`;
    }

    constructor(data: DscLibClass, pkg: Package = null) {
        this.data = data;
        this.package = pkg;

        if (data) {
            this.filePath = data.infPath;
            this.name = (data.name) ? data.name.toString() : null;
            this.class = (data.className) ? data.className.toString() : null;
        }

        if (!this.name && this.filePath) {
            this.name = this.filePath.basename;
        }
    }
}
