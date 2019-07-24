import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, IDscComponent } from "./types";
import * as utils from '../utilities';
import { Path } from '../utilities';

/***
 * Represents a DSC package
 * A package may include zero or more components (.inf), library classes, or PCDs. 
 */
export class DscPackage {
    name: string;
    data: IDscData;
    extendedData: IDscDataExtended;

    get fileName(): string { return (this.filePath) ? this.filePath.basename : null; }
    get filePath(): Path { return (this.data) ? new Path(this.data.filePath.fsPath) : null; }
    get packageRoot(): Path { return (this.filePath) ? this.filePath.parent : null; }

    /**
     * Returns a flattened list of components referenced in the DSC.
     */
    get components(): DscComponent[] { 
        if (this.data && this.data.components) {
            let items: DscComponent[] = [];

            // Iterate over each architecture
            for (let [arch, components] of this.data.components.entries()) {
                for (let component of components) {
                    // TODO: Will need to parse the INF component??
                    let comp: IDscComponent = {
                        infPath: new Path(component),
                        archs: [], // TODO
                        libraryClasses: null,
                        source: null
                    };
                    items.push(new DscComponent(comp, this, null)); // TODO: Name should come from INF
                }
            }
            return items;
        }
        return null;
    }

    private libraryClassFromData(name: string, path: Path) : DscLibraryClass {
        // TODO: To resolve the path, we need to know which DSC package the INF actually belongs to
        //let resolvedPath: Path = this.packageRoot.join(new Path(path));
        let resolvedPath = new Path(path);

        let lib: IDscComponent = {
            infPath: resolvedPath,
            archs: [], // TODO
            libraryClasses: null,
            source: null
        };
        return new DscLibraryClass(lib, name);
    }

    /**
     * Returns a flattened list of libraryclasses referenced in the DSC.
     */
    get libraryClasses(): DscLibraryClass[] {
        if (this.data && this.data.libraries) {
            let items: DscLibraryClass[] = [];

            for (let [arch, libraries] of this.data.libraries.entries()) {
                for (let [name, path] of libraries) {
                    items.push(this.libraryClassFromData(name.toString(), new Path(path)));
                }
            }
            return items;
        }
        return null;
    }

    get libraryClassesGroupedByName(): Map<string, DscLibraryClass[]> {
        if (this.data && this.data.libraries) {
            let map = new Map<string, DscLibraryClass[]>();

            for (let [arch, libraries] of this.data.libraries.entries()) {
                for (let [name, path] of libraries) {
                    let lib = this.libraryClassFromData(name.toString(), new Path(path));
                    let entries = map.get(lib.name) || [];
                    entries.push(lib);
                    map.set(lib.name, entries);
                }
            }
            return map;
        }
        return null;
    }

    /**
     * Resolve a relative path defined in this DSC package
     * @param path 
     */
    // resolvePath(pkgPath: Path): Path {
    //     if (!pkgPath.isAbsolute) {
    //         pkgPath = this.packageRoot.join(pkgPath);
    //     }
    //     return pkgPath;
    // }

    constructor(data: IDscData, extendedData: IDscDataExtended = null) {
        this.data = data;
        this.extendedData = extendedData;

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
export class DscComponent {
    name: string;
    data: IDscComponent;
    filePath: Path;

    constructor(data: IDscComponent, pkg: DscPackage = null, name: string = null) {
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

export class DscLibraryClass {
    name: string;
    data: IDscComponent;
    filePath: Path;

    get archs() { return this.data.archs; }

    constructor(data: IDscComponent, name: string = null) { // TODO: Is this the right interface?
        this.data = data;
        this.name = name;

        if (data) {
            if (data) {
                this.filePath = data.infPath;
    
                if (!this.name && this.filePath) {
                    this.name = this.filePath.basename;
                }
            }
        }
    }
}
