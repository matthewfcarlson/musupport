import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { PersistentFolderState } from '../persistentState';
import { CppProcessor } from './cpp_processor';
import { appendFile } from 'fs';

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
          if (CppProvider.IsInWorkspace(wp.index) == true) {
            logger.info("CPP_PROVIDER Skipping workspace " + wp.name + " as CPP is already installed")
            continue;
          }
          const cppProvider = new CppProvider(wp, api, resourceRoot);
          apis.push(cppProvider);

          context.subscriptions.push(cppProvider);
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
  for (const sub of context.subscriptions) {
    if (sub instanceof CppProvider) sub.dispose();
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

  private static wpInstalls: Set<Number> = new Set<Number>();

  /**
   * Determines whether a CPP provider has been installed for a given
   * @param index
   */
  public static IsInWorkspace(index: number): boolean {
    return CppProvider.wpInstalls.has(index);
  }

  constructor(workspace: vscode.WorkspaceFolder, cppToolsApi: CppToolsApi, resourceRoot: string) {

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.disposables.push(this.statusBar);
    this.workspace = workspace;
    this.cppToolsApi = cppToolsApi;

    const fsPath = workspace.uri.fsPath;
    this.processor = new CppProcessor(workspace);

    if (this.processor.IsActive()) {
      this.FirstTimeSetup();
    }

    CppProvider.wpInstalls.add(workspace.index);

  }

  /**
   * Waits for the refresh to finish
   */
  private async FirstTimeSetup() {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Mu Support: Performing a first time scan of your workspace",
      cancellable: false
    }, async (progress, token) => {
      await this.processor.RefreshWorkspace();
      logger.info("CPP_PROVIDER Firsttime setup is finished");
      this.cppToolsApi.registerCustomConfigurationProvider(this);
      this.cppToolsApi.notifyReady(this);
    });
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



  public async canProvideConfiguration(uri: vscode.Uri, cancel: vscode.CancellationToken | undefined): Promise<boolean> {
    const fileWp = vscode.workspace.getWorkspaceFolder(uri);
    if (fileWp === undefined || fileWp.index !== this.workspace.index) {
      return false;
    }
    if (this.selectedName.Value == 'None') return false;

    if (!CppProvider.enabled) return false;
    logger.info("CPP_PROVIDER checking if we can provide configuration for ", uri)

    //what to do when we can't provide this configurations
    if (this.processor.HasConfigForFile(uri)) return true;
    return false;

  }


  public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
    const ret: SourceFileConfigurationItem[] = [];
    const basePath = this.workspace.uri.fsPath;
    for (const uri of uris) {
      const data = this.processor.GetConfigForFile(uri);
      ret.push(data);
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
    //removing the index from the WP installs
    CppProvider.wpInstalls.delete(this.workspace.index);
  }

  public async Refresh(): Promise<void> {
    await Promise.all([
      this.processor.RunPlatformPackageRefresh(),
      this.processor.RefreshWorkspace()
    ]);
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
        await this.processor.RunPlatformPackageRefresh();
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



async function createCommands(context: vscode.ExtensionContext, configLoaders: CppProvider[]) {
  let current_commands = await vscode.commands.getCommands(true)
  const selectPackageCmd = 'musupport.selectPackage';
  if (current_commands.indexOf(selectPackageCmd) != -1) {
    context.subscriptions.push(vscode.commands.registerCommand(selectPackageCmd, async () => {
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
  }

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  const refreshPackageCmd = 'musupport.refreshPackages';
  if (current_commands.indexOf(refreshPackageCmd) != -1) {
    context.subscriptions.push(vscode.commands.registerCommand(refreshPackageCmd, async () => {
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
}