import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { containsMuProjects, promisifyReadDir, promisifyExists, promisifyGlob, promisifyIsDir, promisifyReadFile } from '../utilities';

import * as makefile_parser from './makefile_parser';
import { match } from 'minimatch';
import { InfStore } from './inf_store';
import { CCppProperties } from "./cpp_properties";
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
    public readonly workspace: vscode.WorkspaceFolder;
    private active: boolean;
    private packages: string[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
        this.infStore = new InfStore(workspace);
        const fsPath = workspace.uri.fsPath;
        this.active = containsMuProjects(fsPath);
        this.buildWatchers = [];
        this.buildRelativePatterns = [];


        this.setupWatchers();
        this.RunPackageRefresh();
        this.infStore.Scan();

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

    public IsActive(): boolean {
        return this.active;
    }

    public async RefreshInfs() {
        //refresh the inf's
        await this.infStore.Scan();
    }

    public GetPackages(): string[] {
        if (this.packages.length == 0) this.RunPackageRefresh();
        return this.packages;
    }

    private buildChanged(e: vscode.Uri): void {
        logger.log("The build changed")
        logger.log(e.toString())

    }

    private getPackageFromPath(uriSubPath: string): string | null {
        let pathFragments = path.normalize(uriSubPath).split(path.sep) // should be the file seperator of our system
        let packageName = "";
        while (pathFragments.length > 0 && packageName == "") {
            const pathFragmentPiece = pathFragments.shift();
            //      //logger.info(pathFragmentPiece);
            if (pathFragmentPiece.endsWith("Pkg")) {
                packageName = pathFragmentPiece;
                return packageName;
            }
        }

        return null;
    }
    public async RunPackageRefresh(): Promise<boolean> {
        //logger.info("Running a package refresh")
        //Check to make sure we have all the packages we need
        this.packages = [];
        const fsPath = this.workspace.uri.fsPath;
        const buildPath = path.join(fsPath, 'Build');
        const exists = await promisifyExists(buildPath);

        if (!exists) return false;
        const folders = await promisifyReadDir(buildPath)
        for (const folder of folders) {
            const folderPath = path.join(fsPath, 'Build', folder);
            if (await promisifyIsDir(folderPath)) {
                this.packages.push(folder)
            }
        }
        return true
    }
}