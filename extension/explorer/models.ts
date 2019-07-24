import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PCD } from '../reposcanner';
import { logger } from '../logger';
import { DscPackage, DscLibraryClass, DscComponent } from '../parsers/models';

export class Node extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly hasChildren: boolean = false,
        protected readonly selectCommand: string = null //`${VIEW_NAMESPACE}.select`
    ) {
        super(label, ((hasChildren) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
    }

    get command(): vscode.Command {
        return {
            title: '',
            command: this.selectCommand,
            arguments: [this]
        };
    }

    getChildren() : Thenable<Node[]> { return Promise.resolve(null); }

    contextValue = 'mu-node';
}

/**
 * Represents a UEFI package backed by a DSC (eg. MdePkg.dsc)
 */
export class PkgNode extends Node {
    constructor (
        public readonly pkg: DscPackage,
        protected readonly selectCommand: string = null
    ) {
        super(pkg.name, true, selectCommand);
    }

    contextValue = 'mu-pkg';

    get tooltip() : string { return (this.pkg.filePath) ? this.pkg.filePath.toString() : null; }

    get description() : string { return this.pkg.fileName; }

    getChildren() : Thenable<Node[]> {
        let items: Node[] = [];
        let libraries_map = this.pkg.libraryClassesGroupedByName;
        if (libraries_map && (libraries_map.size > 0)) {
            items.push(new PkgSectionNode(
                "LibraryClasses", 
                Array.from(libraries_map.entries())
                    .map(([name, libraries]) => 
                        new LibraryClassCollectionNode(name, libraries, this.selectCommand))
            ));
        }
        if (this.pkg.components && (this.pkg.components.length > 0)) {
            items.push(new PkgSectionNode(
                "Components", 
                this.pkg.components.filter((o) => o).map((o) => new ComponentNode(o))
            ));
        }
        // if (this.pkg.pcds && (this.pkg.pcds.length > 0)) {
        //     items.push(new PkgSectionNode(
        //         "PCDs", 
        //         this.pkg.pcds.filter((o) => o).map((o) => new Node(o.name, false))
        //     ));
        // }
        return Promise.resolve(items);
    }
}

/**
 * Represents a [LibraryClasses] or [Components] section inside the DSC
 */
export class PkgSectionNode extends Node {
    constructor(
        public readonly label: string,
        public readonly items: Node[],
        protected readonly selectCommand: string = null
    ) {
        super(label, true, selectCommand);
    }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve(this.items);
    }
}

export class LibraryClassNode extends Node {
    constructor(
        public readonly libraryClass: DscLibraryClass,
        protected readonly selectCommand: string = null
    ) {
        super(libraryClass.name, false, selectCommand);
    }

    get tooltip(): string { return (this.libraryClass.filePath) ? this.libraryClass.filePath.toString() : null; }

    // get description(): string { 
    //     // eg. "[IA32,X64]"
    //     return (this.libraryClass.archs) ? `[${this.libraryClass.archs.join(',')}]` : null; 
    // }
}

export class LibraryClassCollectionNode extends Node {
    constructor(
        public readonly name: string,
        public readonly libraryClasses: DscLibraryClass[],
        protected readonly selectCommand: string = null
    ) {
        super(name, true, selectCommand);
    }

    get description(): string {
        return `(${this.libraryClasses.length})`;
    }

    getChildren(): Thenable<Node[]> {
        return Promise.resolve(this.libraryClasses.map((cls) => new LibraryClassFileNode(cls, this.selectCommand)));
    }
}

export class LibraryClassFileNode extends Node {
    constructor(
        public readonly libraryClass: DscLibraryClass,
        protected readonly selectCommand: string = null
    ) {
        super(libraryClass.filePath.toString(), false, selectCommand);
    }

    get tooltip(): string { return `${this.libraryClass.filePath}`; }

    contextValue = 'mu-inf';
}

export class ComponentNode extends Node {
    constructor(
        public readonly component: DscComponent,
        protected readonly selectCommand: string = null
    ) {
        super(component.name, false, selectCommand);
    }

    get tooltip(): string { return (this.component.filePath) ? this.component.filePath.toString() : null; }

    // get description(): string { 
    //     // eg. "[IA32,X64]"
    //     return (this.component.archs) ? `[${this.component.arch.join(',')}]` : null; 
    // }
}

// /**
//  * Represents a library, driver, or application backed by a *.inf
//  */
// export class InfNode extends Node {
//     constructor(
//         public readonly label: string,
//         public readonly arch: string[] = null
//     ) { 
//         super(label, false); // No children
//     }

//     get description() : string {
//         return (this.arch) ? this.arch.join(',') : null;
//     }

//     contextValue = 'mu-inf';
// }
