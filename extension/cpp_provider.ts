import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';

const isWindows = (process.platform === 'win32');

export class CppProvider implements CustomConfigurationProvider {
  public readonly workspace: vscode.WorkspaceFolder;
  private disposables: vscode.Disposable[] = [];
  private cppToolsApi: CppToolsApi;
  private statusBar: vscode.StatusBarItem;
  public readonly extensionId: string = 'musupport';
  public readonly name: string = 'MuCpp';
  private registered: boolean = false;

  private buildRelativePattern: vscode.RelativePattern;
  private buildWatcher: vscode.FileSystemWatcher;

  constructor(workspace: vscode.WorkspaceFolder, cppToolsApi: CppToolsApi, resourceRoot: string) {

    this.disposables.push(this.statusBar);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 2);
    this.workspace = workspace;
    this.cppToolsApi = cppToolsApi;
    this.statusBar.text = "DSC";
    this.statusBar.tooltip = "Determines which DSC to look at to determine what package build directory we need to look in";
    this.statusBar.show();

    const fsPath = workspace.uri.fsPath;

    this.buildRelativePattern = new vscode.RelativePattern(path.join(fsPath, 'build'), "*Pkg");
    this.buildWatcher = vscode.workspace.createFileSystemWatcher(this.buildRelativePattern)
  }

  public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
    return true;
  }

  public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
    //TODO: figure out if we are a Mu project or not?
    const config: WorkspaceBrowseConfiguration = {
      browsePath: ["${workspaceRoot}"],
      standard: 'c11',
    };
    return config;
  }

  public async canProvideConfiguration(uri: vscode.Uri, _: vscode.CancellationToken | undefined): Promise<boolean> {
    return true;
  }

  public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
    const ret: SourceFileConfigurationItem[] = [];
    for (const uri of uris) {
      const uriPath = uri.toString();
      console.log(uriPath);
    }
    return ret;

  }

  private onDelete() {
    this.statusBar.text = 'none';
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
}