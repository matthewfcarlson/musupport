import * as vscode from 'vscode';
import * as path from 'path';
import { IDscData, IDscDataExtended, IDscComponent } from "./types";

/***
 * Represents a DSC package
 * A package may include zero or more components (.inf), library classes, or PCDs. 
 */
export class DscPackage {
    name: string;
    data: IDscData;
    extendedData: IDscDataExtended;

    get fileName(): string { return (this.filePath) ? path.basename(this.filePath.fsPath) : null; }
    get filePath(): vscode.Uri { return (this.data) ? this.data.filePath : null; }

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
                        infPath: component.toString(),
                        archs: [], // TODO
                        libraryClasses: null,
                        source: null
                    };
                    items.push(new DscComponent(comp));
                }
            }
            return items;
        }
        return null;
    }

    /**
     * Returns a flattened list of libraryclasses referenced in the DSC.
     */
    get libraryClasses(): DscLibraryClass[] {
        if (this.data && this.data.libraries) {
            let items: DscLibraryClass[] = [];

            for (let [arch, libraries] of this.data.libraries.entries()) {
                for (let [name, path] of libraries.entries()) {
                    let lib: IDscComponent = {
                        infPath: path.toString(),
                        archs: [], // TODO
                        libraryClasses: null,
                        source: null
                    };
                    items.push(new DscLibraryClass(lib, name.toString()));
                }
            }
            return items;
        }
        return null;
    }

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

    get filePath(): vscode.Uri { 
        return (this.data.infPath) ? vscode.Uri.file(this.data.infPath.toString()) : null; 
    }

    constructor(data: IDscComponent) {
        this.data = data;

        this.name = path.basename(data.infPath.toString()); // TODO: Should come from parsed INF
    }
}

export class DscLibraryClass {
    name: string;
    data: IDscComponent;

    get filePath(): vscode.Uri { 
        return (this.data.infPath) ? vscode.Uri.file(this.data.infPath.toString()) : null; 
    }

    get archs() { return this.data.archs; }

    constructor(data: IDscComponent, name: string) { // TODO: Is this the right interface?
        this.data = data;
        this.name = name;
        // if (data) {
        //     this.name = path.basename(data.infPath.toString());
        // }
    }
}

/**
 * A store of all known library classes
 */
export class LibraryClassStore {
    // The outer map groups classes by name
    // The inner map keeps a unique set of classes
    // TODO: Use a Set<DscLibraryClass> for the inner collection.
    private classes: Map<string, Map<string, DscLibraryClass>>;

    constructor() {
        this.classes = new Map<string, Map<string, DscLibraryClass>>();
    }

    clear() {
        this.classes.clear();
    }

    add(cls: DscLibraryClass) {
        if (cls) {
            // Add library class to dictionary
            let entries = this.classes.get(cls.name) || new Map<string, DscLibraryClass>();
            entries.set(cls.filePath.fsPath, cls);
            this.classes.set(cls.name, entries);
        }
    }

    getClassesByArch(arch) {
        return null; // TODO
    }

    getClassesForDsc(dsc) {
        return null;
    }

    getClassesGroupedByName(): [string, DscLibraryClass[]][] {
        return Array
            .from(this.classes.entries())
            .map(
               ([a,b]) => { 
                   let r: [string, DscLibraryClass[]] = [a, Array.from(b.values())];
                   return r;
                }
            );
    }
}