import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PCD } from '../reposcanner';
import { logger } from '../logger';
import { Package, Library, Component } from '../parsers/models';

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

    selected() { }

    contextValue = 'mu-node';
}

/**
 * Represents a UEFI package backed by a DSC (eg. MdePkg.dsc)
 */
export class PkgNode extends Node {
    constructor (
        public readonly pkg: Package,
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

    selected() {
        let path = this.pkg.filePath;
        logger.info(`Selected package: ${path}`);

        // Open DSC file in editor
        vscode.window.showTextDocument(path.toUri(), { preserveFocus: true });
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
        public readonly libraryClass: Library,
        protected readonly selectCommand: string = null
    ) {
        super(libraryClass.name, false, selectCommand);
    }

    get tooltip(): string { return `${this.libraryClass.filePath}`; }

    // get description(): string { 
    //     // eg. "[IA32,X64]"
    //     return (this.libraryClass.archs) ? `[${this.libraryClass.archs.join(',')}]` : null; 
    // }

    get description(): string {
        if (this.libraryClass.package) {
            return this.libraryClass.package.name;
        }
        return null;
    }

    selected() {
        let path = this.libraryClass.filePath;
        logger.info(`Selected library: ${path}`);

        // Open INF file in editor
        vscode.window.showTextDocument(path.toUri(), { preserveFocus: true });
    }

    contextValue = 'mu-inf';
}

export class LibraryClassCollectionNode extends Node {
    constructor(
        public readonly name: string,
        public readonly libraryClasses: Library[],
        protected readonly selectCommand: string = null
    ) {
        super(name, true, selectCommand);
    }

    get description(): string {
        return `(${this.libraryClasses.length})`;
    }

    getChildren(): Thenable<Node[]> {
        return Promise.resolve(this.libraryClasses.map((cls) => new LibraryClassNode(cls, this.selectCommand)));
    }

    selected() {
        if (this.libraryClasses.length == 1) {
            let path = this.libraryClasses[0].filePath;
            logger.info(`Selected library: ${path}`);
    
            // Open INF file in editor
            vscode.window.showTextDocument(path.toUri(), { preserveFocus: true });
        } else {
            // TODO: How to expand node?
            //this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }
}

export class ComponentNode extends Node {
    constructor(
        public readonly component: Component,
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
