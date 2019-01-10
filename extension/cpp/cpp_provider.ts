import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { PersistentFolderState } from '../persistentState';
import { promisify } from 'util';
import { promisifyReadDir, promisifyExists, promisifyWriteFile, promisifyIsDir } from '../utilities';

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
    logger.log("We loaded the stupid API PROPERLY")
    vscode.window.showInformationMessage('We loaded the stupid API PROPERLY');
    if (api.notifyReady) {
      if (workspaces !== undefined) {
        let apis: CppProvider[] = [];
        for (const wp of workspaces) {
          const configLoader = new CppProvider(wp, api, resourceRoot);
          api.registerCustomConfigurationProvider(configLoader);

          context.subscriptions.push(configLoader);
          api.notifyReady(configLoader);
          apis.push(configLoader)
        }
        createCommands(context, apis)
      }
    } else {
      logger.error("This is not the correct version of CPP Tools")

    }
  }
}


export class CppProvider implements CustomConfigurationProvider {
  public readonly workspace: vscode.WorkspaceFolder;
  private packages: string[] = [];
  private disposables: vscode.Disposable[] = [];
  private cppToolsApi: CppToolsApi;
  private statusBar: vscode.StatusBarItem;
  public readonly extensionId: string = 'musupport';
  public readonly name: string = 'MuCpp';
  private registered: boolean = false;
  private foundFiles: SourceFileConfigurationItem[] = [];
  private selectedName: PersistentFolderState<string>;

  private buildRelativePatterns: vscode.RelativePattern[];
  private buildWatchers: vscode.FileSystemWatcher[];

  constructor(workspace: vscode.WorkspaceFolder, cppToolsApi: CppToolsApi, resourceRoot: string) {

    this.disposables.push(this.statusBar);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.workspace = workspace;
    this.cppToolsApi = cppToolsApi;

    const fsPath = workspace.uri.fsPath;
    this.selectedName = new PersistentFolderState<string>('musupport_dsc.selectedName', 'none', fsPath);

    this.statusBar.tooltip = "Determines which DSC to look at to determine what package build directory we need to look in";
    this.statusBar.text = this.selectedName.Value;
    this.statusBar.tooltip = 'Click to change package';
    this.statusBar.command = 'musupport.selectPackage';
    this.statusBar.show();
    this.foundFiles = [];

    this.buildWatchers = [];
    this.buildRelativePatterns = [];

    this.setupWatchers();

    this.runPackageRefresh();

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

  }

  public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
    return true;
  }

  private buildChanged(e: vscode.Uri): void {
    logger.log("The build changed")
    logger.log(e.toString())
  }

  public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
    //TODO: figure out if we are a Mu project or not?
    const config: WorkspaceBrowseConfiguration = {
      browsePath: [],
      standard: 'c11',
    };
    return config;
  }

  public async canProvideConfiguration(uri: vscode.Uri, _: vscode.CancellationToken | undefined): Promise<boolean> {
    const fileWp = vscode.workspace.getWorkspaceFolder(uri);
    if (fileWp === undefined || fileWp.index !== this.workspace.index) {
      return false;
    }
    if (this.selectedName.Value == 'none') return false;
    return true;
  }

  public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
    const ret: SourceFileConfigurationItem[] = [];
    const basePath = this.workspace.uri.fsPath;
    for (const uri of uris) {
      const uriPath = uri.toString();
      const uriSubPath = uriPath.substring(basePath.length)
      logger.info("Looking for configuration for "+uriPath+" relative to "+uriPath)
      logger.info("Remaping "+uriSubPath)

      const normalizedPath = normalizeDriveLetter(uri.fsPath);
      const args: string[] = [];
      const macros: string[] = [];
      const includePaths: string[] = [];
      const msvc = true;
      ret.push({configuration: {
          defines: macros,
          includePath: includePaths,
          intelliSenseMode: msvc ? 'msvc-x64' : 'clang-x64',
          standard: 'c11',
        },
        uri: uriPath,
      });
    }

    return ret;

  }

  private onDelete() {
    this.statusBar.text = 'none';
    this.foundFiles = [];
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private async couldBeUpdated(): Promise<void> {
    const result = await vscode.window.showInformationMessage('Intellisense configurations might have been updated. Refresh them now?', 'Yes', 'No');
    if (result && result === 'Yes') {
      //await this.runGradleRefresh();
    }
  }
  private async findMatchingBinary(uri: vscode.Uri): Promise<boolean> {
    const uriPath = uri.toString();

    for (const f of this.foundFiles) {
      if (f.uri === uriPath) {
        return true;
      }
    }

    logger.log(`Searching for Binary for ${uriPath}`);
    const found = false;
    if (found) {
      const normalizedPath = normalizeDriveLetter(uri.fsPath);
      const args: string[] = [];
      const macros: string[] = [];
      const includePaths: string[] = [];
      const msvc = true;
      this.foundFiles.push({
        configuration: {
          defines: macros,
          includePath: includePaths,
          intelliSenseMode: msvc ? 'msvc-x64' : 'clang-x64',
          standard: 'c11',
        },
        uri: uriPath,
      });
      return true;
    }
    else {

      logger.log(`Did not find provider for ${uriPath}`);
      return false;
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
        this.foundFiles = [];
      }
      this.selectedName.Value = result;
      this.statusBar.text = result;
      this.cppToolsApi.didChangeCustomConfiguration(this);
    }
  }
  public async runPackageRefresh(): Promise<boolean> {
    logger.info("Running a package refresh")
    //Check to make sure we have all the packages we need
    this.packages = [];
    const fsPath = this.workspace.uri.fsPath;
    const buildPath = path.join(fsPath, 'Build');
    const exists = await promisifyExists(buildPath);

    if (!exists) return false;
    const folders = await promisifyReadDir(buildPath)
    for (const folder of folders){
      const folderPath = path.join(fsPath, 'Build',folder);
      if (await promisifyIsDir(folderPath)){
        this.packages.push(folder)
      }
    }
    logger.info(folders.toString())
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