import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { PersistentFolderState } from '../persistentState';
import { promisify } from 'util';
import { containsMuProjects, promisifyReadDir, promisifyExists, promisifyGlob, promisifyIsDir, promisifyReadFile } from '../utilities';

import * as makefile_parser from './makefile_parser';
import { match } from 'minimatch';
import { InfStore } from './inf_store';
import { CCppProperties } from "./cpp_properties";

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

export async function InstallCppProvider(context: vscode.ExtensionContext, workspaces: vscode.WorkspaceFolder[], resourceRoot: string) {
  let api: CppToolsApi | undefined = await getCppToolsApi(Version.v2);
  if (api) {
    context.subscriptions.push(api);
    if (api.notifyReady) {
      if (workspaces !== undefined) {
        let apis: CppProvider[] = [];
        for (const wp of workspaces) {
          const configProvider = new CppProvider(wp, api, resourceRoot);
          api.registerCustomConfigurationProvider(configProvider);

          context.subscriptions.push(configProvider);
          api.notifyReady(configProvider);
          apis.push(configProvider)
        }
        createCommands(context, apis)
      }
    } else {
      logger.error("This is not the correct version of CPP Tools")
      vscode.window.showErrorMessage("Please update your version of the C++ tools for VS Code")

    }
  }
}

export class CppProvider implements CustomConfigurationProvider {
  public readonly workspace: vscode.WorkspaceFolder;
  private packages: string[] = [];
  private disposables: vscode.Disposable[] = [];
  private cppToolsApi: CppToolsApi;
  private active: boolean;
  private statusBar: vscode.StatusBarItem;
  public readonly extensionId: string = 'musupport';
  public readonly name: string = 'MuCpp';
  private infStore: InfStore;
  private selectedName: PersistentFolderState<string>;
  private packageName: string = "";

  private buildRelativePatterns: vscode.RelativePattern[];
  private buildWatchers: vscode.FileSystemWatcher[];

  constructor(workspace: vscode.WorkspaceFolder, cppToolsApi: CppToolsApi, resourceRoot: string) {

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.disposables.push(this.statusBar);
    this.workspace = workspace;
    this.cppToolsApi = cppToolsApi;

    const fsPath = workspace.uri.fsPath;
    this.selectedName = new PersistentFolderState<string>('musupport_dsc.selectedName', 'None', fsPath);

    this.statusBar.tooltip = "Determines which DSC to look at to determine what package build directory we need to look in";
    this.packageName = this.selectedName.Value || "None";
    this.statusBar.text = this.packageName;
    this.statusBar.tooltip = 'Click to change package';
    this.statusBar.command = 'musupport.selectPackage';
    this.statusBar.show();

    this.active = containsMuProjects(fsPath);

    this.buildWatchers = [];
    this.buildRelativePatterns = [];


    this.infStore = new InfStore(workspace);

    this.setupWatchers();

    if (this.active) {

      this.runPackageRefresh();
      this.refreshInfs();
    }
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

  private async refreshInfs() {
    await this.infStore.Scan();
  }

  public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
    if (this.selectedName.Value == 'None') return false;
    if (this.active == false) return false;
    return true;
  }

  private buildChanged(e: vscode.Uri): void {
    logger.log("The build changed")
    logger.log(e.toString())

  }

  public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
    //TODO: figure out if we are a Mu project or not?
    const config: WorkspaceBrowseConfiguration = {
      browsePath: ["${workspaceFolder}\\**"],
      standard: 'c11',
    };
    return config;
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

  public async canProvideConfiguration(uri: vscode.Uri, _: vscode.CancellationToken | undefined): Promise<boolean> {
    const fileWp = vscode.workspace.getWorkspaceFolder(uri);
    if (fileWp === undefined || fileWp.index !== this.workspace.index) {
      return false;
    }
    if (this.selectedName.Value == 'None') return false;

    const uriPath = uri.fsPath;
    const basePath = this.workspace.uri.fsPath;
    const uriSubPath = uriPath.substring(basePath.length)

    if (this.infStore.HasInfForFile(uri)) return true;
    return false;

  }


  public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
    const ret: SourceFileConfigurationItem[] = [];
    const basePath = this.workspace.uri.fsPath;
    for (const uri of uris) {

    }
    return ret;

  }

  private onDelete() {
    this.statusBar.text = 'none';
    //this.foundAutoGens = [];
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private async couldBeUpdated(): Promise<void> {
    const result = await vscode.window.showInformationMessage('Intellisense configurations might have been updated. Refresh them now?', 'Yes', 'No');
    if (result && result === 'Yes') {
      await this.runPackageRefresh();
    }
  }
  public async selectPackage(): Promise<void> {
    const selections: string[] = [];
    for (const c of this.packages) {
      selections.push(`${c}`);
    }
    if (selections.length === 0) {
      const configResult = await vscode.window.showInformationMessage('No packages could be found. Would you like to scan again?', {
        modal: true,
      }, 'Yes', 'No');
      if (configResult === 'Yes') {
        await this.runPackageRefresh();
      }
      return;
    }
    const result = await vscode.window.showQuickPick(selections, {
      placeHolder: 'Pick a package',
    });
    if (result !== undefined) {
      if (result !== this.selectedName.Value) {
        //kick off a search for autogens and make files

      }
      this.selectedName.Value = result;
      this.statusBar.text = result;
      this.cppToolsApi.didChangeCustomConfiguration(this);
    }
  }
  public async runPackageRefresh(): Promise<boolean> {
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



function createCommands(context: vscode.ExtensionContext, configLoaders: CppProvider[]) {
  context.subscriptions.push(vscode.commands.registerCommand('musupport.selectPackage', async () => {
    const workspaces = vscode.workspace.workspaceFolders;

    if (workspaces === undefined) {
      return;
    }

    for (const wp of workspaces) {
      for (const loader of configLoaders) {
        if (wp.uri.fsPath === loader.workspace.uri.fsPath) {
          await loader.selectPackage();
        }
      }
    }
  }));

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(vscode.commands.registerCommand('musupport.refreshPackages', async () => {
    const workspaces = vscode.workspace.workspaceFolders;

    if (workspaces === undefined) {
      return;
    }

    for (const wp of workspaces) {
      for (const loader of configLoaders) {
        if (wp.uri.fsPath === loader.workspace.uri.fsPath) {
          await loader.runPackageRefresh();
        }
      }
    }
  }));
}