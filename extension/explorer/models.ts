import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RepoScanner, PCD } from '../reposcanner';
import { logger } from '../logger';
import { Package, Library, Component } from '../parsers/models';
import { Path } from '../utilities';
import { IDscGuid } from '../parsers/types';

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

    //get description() : string { return this.pkg.fileName; }

    getChildren() : Thenable<Node[]> {
        let items: Node[] = [];

        let decItems: Node[] = []
        let dscItems: Node[] = [];

        let exported_libraries = this.pkg.exportedLibraries;
        if (exported_libraries && exported_libraries.length > 0) {
            decItems.push(new PkgSectionNode(
                "LibraryClasses",
                exported_libraries.map((lib) =>
                    new LibraryClassNode(lib, lib.class, this.selectCommand))
            ));
        }
        let exported_components = this.pkg.exportedComponents;
        if (exported_components && exported_components.length > 0) {
            decItems.push(new PkgSectionNode(
                "Components",
                exported_components.map((comp) =>
                    new ComponentNode(comp, this.selectCommand))
            ));
        }
        let exported_pcds = this.pkg.exportedPcds;
        if (exported_pcds && exported_pcds.length > 0) {
            decItems.push(new PkgSectionNode(
                "PCDs",
                exported_pcds.map((pcd) => 
                    new Node(pcd, false, this.selectCommand)),
            ));
        }
        let exported_guids = this.pkg.exportedGuids;
        if (exported_guids && exported_guids.length > 0) {
            decItems.push(new PkgSectionNode(
                "GUIDs",
                exported_guids.map((pcd) => 
                    new GuidNode(pcd, this.selectCommand)),
            ));
        }
        let exported_protocols = this.pkg.exportedProtocols;
        if (exported_protocols && exported_protocols.length > 0) {
            decItems.push(new PkgSectionNode(
                "Protocols",
                exported_protocols.map((pcd) => 
                    new GuidNode(pcd, this.selectCommand)),
            ));
        }


        let libraries_map = this.pkg.libraryClassesGroupedByName;
        if (libraries_map && (libraries_map.size > 0)) {
            dscItems.push(new PkgSectionNode(
                "LibraryClasses", 
                Array.from(libraries_map.entries())
                    .map(([name, libraries]) => 
                        new LibraryClassCollectionNode(name, libraries, this.selectCommand))
            ));
        }

        // let referenced_libraries = this.pkg.referencedLibraries;
        // if (referenced_libraries && referenced_libraries.length > 0) {
        //     dscItems.push(new PkgSectionNode(
        //         "LibraryClasses",
        //         referenced_libraries.map((lib) => 
        //             new LibraryClassCollectionNode)
        //     ))
        // }

        if (this.pkg.referencedComponents && (this.pkg.referencedComponents.length > 0)) {
            dscItems.push(new PkgSectionNode(
                "Components", 
                this.pkg.referencedComponents.filter((o) => o).map((o) => new ComponentNode(o))
            ));
        }



        // if (this.pkg.pcds && (this.pkg.pcds.length > 0)) {
        //     items.push(new PkgSectionNode(
        //         "PCDs", 
        //         this.pkg.pcds.filter((o) => o).map((o) => new Node(o.name, false))
        //     ));
        // }

        if (this.pkg.decFilePath) {
            items.push(new PkgFileNode("Package Declaration", this.pkg.decFilePath, decItems, this.selectCommand)); 
        }
        if (this.pkg.dscFilePath) {
            items.push(new PkgFileNode("Platform Description", this.pkg.dscFilePath, dscItems, this.selectCommand));
        }
        return Promise.resolve(items);
    }

    selected() {
        let path = this.pkg.filePath;
        logger.info(`Selected package: ${path}`);

        // Open DSC file in editor
        vscode.window.showTextDocument(path.toUri(), { preserveFocus: true });
    }
}

export class PkgFileNode extends Node {
    constructor(
        public readonly label: string,
        public readonly file: Path,
        public readonly items: Node[],
        protected readonly selectCommand: string = null
    ) {
        super(label, (items.length > 0), selectCommand);
    }

    get tooltip(): string { return `${this.file}`; }

    get description(): string { return `${this.file.basename}`; }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve(this.items);
    }

    selected() {
        // Open DEC/DSC file in editor
        vscode.window.showTextDocument(this.file.toUri(), { preserveFocus: true });
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
        super(label, (items.length > 0), selectCommand);
    }

    getChildren() : Thenable<Node[]> {
        return Promise.resolve(this.items);
    }
}

export class LibraryClassNode extends Node {
    constructor(
        public readonly libraryClass: Library,
        label: string = null,
        protected readonly selectCommand: string = null,
        protected readonly showPkgName: boolean = false
    ) {
        super(((label) ? label : libraryClass.name), false, selectCommand);
    }

    get tooltip(): string { return `${this.libraryClass.filePath}`; }

    get description(): string {
        if (this.showPkgName && this.libraryClass.package) {
            return this.libraryClass.package.name;
        }
        return null; // If null, the package isn't used, or usage wasn't detected properly.
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
        protected readonly selectCommand: string = null,
        protected readonly showPkgName: boolean = false
    ) {
        super(name, true, selectCommand);
    }

    get description(): string {
        return `(${this.libraryClasses.length})`;
    }

    getChildren(): Thenable<Node[]> {
        return Promise.resolve(this.libraryClasses.map((cls) => new LibraryClassNode(cls, null, this.selectCommand, this.showPkgName)));
    }

    selected() {
        // Open first library
        if (this.libraryClasses.length >= 1) {
            let path = this.libraryClasses[0].filePath;
            logger.info(`Selected library: ${path}`);
    
            // Open INF file in editor
            vscode.window.showTextDocument(path.toUri(), { preserveFocus: true });
        } 
        // TODO: How to expand node?
        //this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
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

export class GuidNode extends Node {
    constructor(
        public readonly guid: IDscGuid,
        protected readonly selectCommand: string = null
    ) {
        super(guid.name, false, selectCommand);
    }

    get tooltip(): string { return this.guid.guid; }
}
