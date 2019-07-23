import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PackageDefinition, ComponentDefinition, LibraryClassDefinition, PCD } from '../reposcanner';
import { logger } from '../logger';

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
        public readonly pkg: PackageDefinition,
        protected readonly selectCommand: string = null
    ) {
        super(pkg.name, true, selectCommand);
    }

    contextValue = 'mu-pkg';

    get tooltip() : string { return this.pkg.dscPath.fsPath; }

    get description() : string { return path.basename(this.pkg.dscPath.fsPath); }

    getChildren() : Thenable<Node[]> {
        let items: Node[] = [];
        if (this.pkg.libraryClasses && (this.pkg.libraryClasses.length > 0)) {
            items.push(new PkgSectionNode(
                "LibraryClasses", 
                this.pkg.libraryClasses.filter((o) => o).map((o) => new LibraryClassNode(o, this.selectCommand))
            ));
        }
        if (this.pkg.components && (this.pkg.components.length > 0)) {
            items.push(new PkgSectionNode(
                "Components", 
                this.pkg.components.filter((o) => o).map((o) => new ComponentNode(o))
            ));
        }
        if (this.pkg.pcds && (this.pkg.pcds.length > 0)) {
            items.push(new PkgSectionNode(
                "PCDs", 
                this.pkg.pcds.filter((o) => o).map((o) => new Node(o.name, false))
            ));
        }
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
        public readonly libraryClass: LibraryClassDefinition,
        protected readonly selectCommand: string = null
    ) {
        super(libraryClass.name, false, selectCommand);
    }

    get tooltip(): string { return this.libraryClass.path.fsPath; }

    get description(): string { 
        // eg. "[IA32,X64]"
        return (this.libraryClass.arch) ? `[${this.libraryClass.arch.join(',')}]` : null; 
    }
}

export class LibraryClassCollectionNode extends Node {
    constructor(
        public readonly name: string,
        public readonly libraryClasses: LibraryClassDefinition[],
        protected readonly selectCommand: string = null
    ) {
        super(name, true, selectCommand);
    }

    get description(): string {
        return `(${this.libraryClasses.length})`;
    }

    getChildren(): Thenable<Node[]> {
        return Promise.resolve(this.libraryClasses.map((cls) => new LibraryClassUsageNode(cls, this.selectCommand)));
    }
}

export class LibraryClassUsageNode extends Node {
    constructor(
        public readonly libraryClass: LibraryClassDefinition,
        protected readonly selectCommand: string = null
    ) {
        super(libraryClass.path.fsPath, false, selectCommand);
    }

    // TODO: When selected, this should navigate to where the library class is used
}

export class ComponentNode extends Node {
    constructor(
        public readonly component: ComponentDefinition,
        protected readonly selectCommand: string = null
    ) {
        super(component.name, false, selectCommand);
    }

    get tooltip(): string { return this.component.path.fsPath; }

    get description(): string { 
        // eg. "[IA32,X64]"
        return (this.component.arch) ? `[${this.component.arch.join(',')}]` : null; 
    }
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
