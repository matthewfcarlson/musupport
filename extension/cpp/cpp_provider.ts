import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { PersistentFolderState } from '../persistentState';
import { CppProcessor } from './cpp_processor';

/**
 *  Installs the CPP provider for each workspace, as well as installs the commands
 * @param context 
 * @param workspaces 
 * @param resourceRoot 
 */


export async function InstallCppProvider(context: vscode.ExtensionContext, workspaces: vscode.WorkspaceFolder[], resourceRoot: string) {
  let api: CppToolsApi | undefined = await getCppToolsApi(Version.v2);
  CppProvider.SetEnabled(true);
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
/**
 * Uninstalls the CPP Provider, this is a WIP
 * @param context 
 * @param workspaces 
 * @param resourceRoot 
 */
export async function UninstallCppProvider(context: vscode.ExtensionContext, workspaces: vscode.WorkspaceFolder[], resourceRoot: string) {
  let api: CppToolsApi | undefined = await getCppToolsApi(Version.v2);
  //TODO clean this up
  logger.info("Disposing off CPP Provider");
  CppProvider.SetEnabled(false);
  if (api) {
    api.dispose(); //not sure how to remove what has been installed
  }
}

/**
 * This class handled talking to the CppToolsAPI and tries to be agnostic of the filesystem underneath
 */
export class CppProvider implements CustomConfigurationProvider {
  public readonly workspace: vscode.WorkspaceFolder;

  private disposables: vscode.Disposable[] = [];
  private cppToolsApi: CppToolsApi;
  private static enabled: boolean = true;
  private statusBar: vscode.StatusBarItem;
  public readonly extensionId: string = 'musupport';
  public readonly name: string = 'MuCpp';
  private selectedName: PersistentFolderState<string>;
  private packageName: string = "";
  private processor: CppProcessor;

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

    this.processor = new CppProcessor(workspace);

    if (this.processor.IsActive()) {
      this.processor.RefreshInfs();
    }
  }


  public static SetEnabled(isEnabled: boolean) {
    CppProvider.enabled = isEnabled;
  }

  public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
    if (this.selectedName.Value == 'None') return false;
    if (this.processor.IsActive() == false) return false;
    if (!CppProvider.enabled) return false;
    return true;
  }


  public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
    //TODO: figure out if we are a Mu project or not?
    const config: WorkspaceBrowseConfiguration = {
      browsePath: ["${workspaceFolder}\\**"],
      standard: 'c11',
    };
    return config;
  }



  public async canProvideConfiguration(uri: vscode.Uri, _: vscode.CancellationToken | undefined): Promise<boolean> {
    const fileWp = vscode.workspace.getWorkspaceFolder(uri);
    if (fileWp === undefined || fileWp.index !== this.workspace.index) {
      return false;
    }
    if (this.selectedName.Value == 'None') return false;

    if (!CppProvider.enabled) return false;

    const uriPath = uri.fsPath;
    const basePath = this.workspace.uri.fsPath;
    const uriSubPath = uriPath.substring(basePath.length)

    if (this.processor.HasConfigForFile(uri)) return true;
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

  public async Refresh(): Promise<void> {
    await this.processor.RunPackageRefresh();
  }

  public async selectPackage(): Promise<void> {
    const selections: string[] = [];
    for (const c of this.processor.GetPackages()) {
      selections.push(`${c}`);
    }
    if (selections.length === 0) {
      const configResult = await vscode.window.showInformationMessage('No packages could be found. Would you like to scan again?', {
        modal: true,
      }, 'Yes', 'No');
      if (configResult === 'Yes') {
        await this.processor.RunPackageRefresh();
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
          await loader.Refresh();
        }
      }
    }
  }));
}