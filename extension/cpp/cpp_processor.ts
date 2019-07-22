import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { containsMuProjects, promisifyReadDir, promisifyExists, promisifyGlob, promisifyIsDir, promisifyReadFile } from '../utilities';

import * as makefile_parser from './parsers/makefile_parser';
//import { match } from 'minimatch';
import { InfStore, DecStore } from './data_store';
import { CCppProperties } from "./cpp_properties";
import { SourceFileConfigurationItem, SourceFileConfiguration } from 'vscode-cpptools';
// When long running- use this progress Sample
//https://github.com/Microsoft/vscode-extension-samples/tree/master/progress-sample

/*
Logic:
1. Identify component .inf
2. Parse .inf to get package refrences
3. Parse corresponding package .dec files to get [include] sections
4. generate include path as the union of all [include] section paths.
*/


function normalizeDriveLetter(pth: string): string {
    if (hasDriveLetter(pth)) {
        return pth.charAt(0).toUpperCase() + pth.slice(1);
    }
    return pth;
}

function hasDriveLetter(pth: string): boolean {
    return isWindows && pth[1] === ':';
}


const isWindows = (process.platform === 'win32');

export class CppProcessor {

    private buildRelativePatterns: vscode.RelativePattern[];
    private buildWatchers: vscode.FileSystemWatcher[];
    private infStore: InfStore;
    private decStore: DecStore;
    public readonly workspace: vscode.WorkspaceFolder;
    private active: boolean;
    private packages: string[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
        this.infStore = new InfStore(workspace);
        this.decStore = new DecStore(workspace);
        const fsPath = workspace.uri.fsPath;
        this.active = containsMuProjects(fsPath);
        this.buildWatchers = [];
        this.buildRelativePatterns = [];


        this.setupWatchers();
        this.RunPlatformPackageRefresh();
    }

    private setupWatchers(): void {
        const fsPath = this.workspace.uri.fsPath;
        const buildRelativePattern = new vscode.RelativePattern(path.join(fsPath, 'Build'), "BUILDLOG*");
        const buildWatcher = vscode.workspace.createFileSystemWatcher(buildRelativePattern)
        buildWatcher.onDidChange(this.buildChanged, this, this.disposables);
        this.buildRelativePatterns.push(buildRelativePattern);
        this.buildWatchers.push(buildWatcher);

        const buildRelativePattern2 = new vscode.RelativePattern(path.join(fsPath, 'Build'), "**/*{.dsc,.h,AutoGen}");
        const buildWatcher2 = vscode.workspace.createFileSystemWatcher(buildRelativePattern2);
        this.buildRelativePatterns.push(buildRelativePattern2);
        this.buildWatchers.push(buildWatcher2);
        buildWatcher2.onDidChange(this.buildChanged, this, this.disposables);

        vscode.workspace.onDidChangeWorkspaceFolders(events => {
            events.added.forEach(async folder => {
                if (containsMuProjects(folder.uri.fsPath)) {
                    CCppProperties.writeDefaultCCppPropertiesJsonIfNotExist(folder.uri);

                    //startFloatingPromise(() => this.nMakeJsonRpcServer.initializeWorkspaceFolder(folder.uri, this.workspaceIndexingMode), "Each folder can initialize independently");
                }
            });
        });

    }

    public HasConfigForFile(uri: vscode.Uri): boolean {
        return this.infStore.HasInfForFile(uri);
    }

    public GetConfigForFile(uri: vscode.Uri): SourceFileConfigurationItem {
        const data = this.infStore.GetInfsForFile(uri);
        logger.info("CPP_PROCESSOR: get config for file", uri, data);
        var includePaths = new Set<string>();
        var defines = new Set<string>();

        for (const infData of data) { //for each inf that includes this file
            for (const decFile of infData.packages) { //for each package in the inf
                const decList = this.decStore.GetDataForFile(decFile);
                for (const decData of decList) { //for each dec that was found
                    for (const decInclude of decData.includes) { //for each include in this dec
                        includePaths.add(decInclude); //append to the list of the paths
                    }
                }
            }
        }
        logger.info("CPP_PROCESSOR: incldue paths ", Array.from(includePaths))
        const configuration: SourceFileConfiguration = {
            includePath: Array.from(includePaths),
            defines: Array.from(defines),
            standard: "c11",
            intelliSenseMode: "msvc-x64"
        };

        return {
            uri: uri,
            configuration: configuration
        };
    }

    public IsActive(): boolean {
        return this.active;
    }

    public async RefreshWorkspace() {
        //refresh the inf's
        await this.decStore.Scan();
        await this.infStore.Scan();

    }

    public GetPackages(): string[] {
        if (this.packages.length == 0) this.RunPlatformPackageRefresh();
        return this.packages;
    }

    private buildChanged(e: vscode.Uri): void {
        logger.log("The build changed")
        logger.log(e.toString())

    }

    public async RunPlatformPackageRefresh(): Promise<boolean> {
        //logger.info("Running a package refresh")
        //Check to make sure we have all the packages we need
        this.packages = [];
        const basePath = this.workspace.uri.fsPath;
        var data = new Set<string>();

        //scan dec files for platform package files
        const decFiles = await promisifyGlob(path.join(basePath, "**", "PlatformPkg.dsc"));
        for (const single_file of decFiles) {
            const single_dir = path.dirname(single_file);
            const packageName = path.basename(single_dir);
            data.add(packageName);
        }

        this.packages = Array.from(data);
        return true
    }

}