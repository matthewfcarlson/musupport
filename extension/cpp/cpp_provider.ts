import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../logger';
import { PersistentFolderState } from '../persistentState';
import { promisify } from 'util';
import { promisifyReadDir, promisifyExists, promisifyGlob, promisifyIsDir, promisifyReadFile } from '../utilities';

import * as makefile_parser from './makefile_parser';
import { match } from 'minimatch';


function normalizeDriveLetter(pth: string): string {
  if (hasDriveLetter(pth)) {
    return pth.charAt(0).toUpperCase() + pth.slice(1);
  }
  return pth;
}

function hasDriveLetter(pth: string): boolean {
  return isWindows && pth[1] === ':';
}

function pathMatch(path1: string, path2: string, pkgName: string, workspace: string): number {
  let path1_short = path1;
  let path2_short = path2;
  let matchStrength = 0;
  if (path1.indexOf(workspace) != -1) {
    path1_short = path1.substr(workspace.length)
  }
  if (path2.indexOf(workspace) != -1) {
    path2_short = path2.substr(workspace.length)
  }
  //logger.info("PATHMATCH:" + path1_short + " and " + path2_short)
  const path1parts = path1_short.split(/[\\\/]/)
  const path2parts = path2_short.split(/[\\\/]/)
  //remove everything until we get to the package
  while (path1parts.length > 0 && path1parts[0] != pkgName) path1parts.shift();
  while (path2parts.length > 0 && path2parts[0] != pkgName) path2parts.shift();
  for (let i = 1; i < path1parts.length && i < path2parts.length; i++) {
    //logger.info(path1parts[i] + " and " + path2parts[i])
    if (path1parts[i] == path2parts[i]) matchStrength++;
  }
  return matchStrength;
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

interface MakeFile {
  path: string,
  includes: string[]
}

class MakeFiles {
  //package, uri, includes
  private data: Map<string, Map<string, Set<string>>> // TODO this is super ugly
  private workspace: string;
  constructor(workspace: string) {
    this.data = new Map<string, Map<string, Set<string>>>()
    this.workspace = workspace;
  }
  public hasPkg(pkgName: string): boolean {
    if (this.data.has(pkgName)) return true;
    return false
  }
  public tryCreatePkg(pkgName: string) {
    if (!this.data.has(pkgName)) {
      this.data.set(pkgName, new Map<string, Set<string>>());
    }
  }
  public tryClearPkg(pkgName: string) {
    if (this.data.has(pkgName)) {
      this.data.get(pkgName).clear()
      this.data.delete(pkgName);
    }
  }
  public has(pkgName: string): boolean {
    return this.data.has(pkgName);
  }

  public get(pkgName: string, subPath: string): string[] {
    let ret = [];
    if (!this.data.has(pkgName)) {
      return [];
    }
    const matches = this.data.get(pkgName).keys();
    let maxMatch = "";
    let maxMatchStrength = 0;
    //logger.info("MakeFiles:Get: Looking for matches for " + subPath)
    for (const match of matches) {
      //logger.info("MakeFiles:" + match + " vs " + subPath);
      const matchStrength = pathMatch(match, subPath, pkgName, this.workspace);
      if (maxMatchStrength < matchStrength) {
        maxMatch = match;
        maxMatchStrength = matchStrength;
      }
    }
    const matchData = this.data.get(pkgName).get(maxMatch);
    if (maxMatch == "") return ret;
    //logger.info("MakeFiles:Get: We selected" + maxMatch);
    for (const includePath of matchData) {
      ret.push(includePath);
    }
    return ret;
  }


  public clear() {
    //clear everything
    this.data.clear();
  }

  public async Add(pkgName: string, makepath: string) {
    //logger.info("MakeFiles:Add: " + pkgName + " - " + makepath)
    if (!this.data.has(pkgName)) {
      this.tryCreatePkg(pkgName);
    }
    if (!(await promisifyExists(makepath))) {
      logger.error("THIS PATH DOES NOT EXIST: " + makepath + " PKG:" + pkgName);
      return
    }
    if (!this.data.get(pkgName).has(makepath)) {
      this.data.get(pkgName).set(makepath, new Set<string>());
    }
    else {
      logger.warn("MakeFiles: removing " + pkgName + " for " + makepath);
      this.data.get(pkgName).clear();
    }

    //open the file and read it
    let contents = await promisifyReadFile(makepath);
    const debugDir = path.join(path.parse(makepath).dir, "DEBUG")
    if (contents) {
      let makeFile = makefile_parser.parseMakefile(contents)
      if (makeFile.variables["INC"]) {
        const includes = makeFile.variables["INC"].split(/\s+/);
        for (const include_path of includes) {
          const inclde_real_path = include_path.
            replace("/I", "").
            replace("$(WORKSPACE)", this.workspace).
            replace("$(DEBUG_DIR)", debugDir)
          this.data.get(pkgName).get(makepath).add(inclde_real_path);

        }
        //logger.info("MakeFiles:Add: Adding " + includes.length + " includes to " + pkgName)
      }
      else {
        logger.error("MakeFiles: The MAKEfile didn't include any includes" + path)
      }
    }
    else {
      logger.error("MakeFiles:Add: error opening file")
    };
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
  private foundAutoGens: Map<string, Set<string>>;
  private foundMakefiles: MakeFiles; //package, uri, includes
  private selectedName: PersistentFolderState<string>;

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
    this.statusBar.text = this.selectedName.Value || "None";
    this.statusBar.tooltip = 'Click to change package';
    this.statusBar.command = 'musupport.selectPackage';
    this.statusBar.show();
    this.foundAutoGens = new Map<string, Set<string>>();
    this.foundMakefiles = new MakeFiles(fsPath);

    this.buildWatchers = [];
    this.buildRelativePatterns = [];

    this.setupWatchers();

    this.runPackageRefresh();

    //this.searchForAutoGens()

    //logger.info("Finished setup");

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
    // clear out what we know so far
    // only clear out if it's in the package
    const packageName = null;//get the package name and determine
    if (packageName) {
      this.foundMakefiles.tryClearPkg(packageName)
      this.foundAutoGens.get(packageName).clear()
    }
    else {
      this.foundMakefiles.clear()
      this.foundAutoGens.clear()
    }
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

  // Search for AutoGen.h files
  public async searchForAutoGens(packageName?: string): Promise<boolean> {
    const fsPath = this.workspace.uri.fsPath;

    if (this.selectedName.Value == 'None') return false;
    const wsBuildPath = path.join(fsPath, 'Build', this.selectedName.Value)
    let base = "";
    if (packageName) {
      base = path.join(wsBuildPath, "*", "*", packageName);
      if (this.foundAutoGens.has(packageName)) this.foundAutoGens.get(packageName).clear();
    }
    else {
      base = path.join(wsBuildPath, "*", "*", "*Pkg");
      this.foundAutoGens.clear();
    }

    const files = await promisifyGlob(path.join(base, "**", "AutoGen.h"));

    for (const single_file of files) {
      const filePackageName = this.getPackageFromPath(single_file.substr(wsBuildPath.length))
      if (filePackageName == null) {
        logger.error("searchForAutoGens: We couldn't parse a package for " + single_file)
        continue
      }
      if (!this.foundAutoGens.has(filePackageName)) {
        this.foundAutoGens.set(filePackageName, new Set<string>())
      }
      this.foundAutoGens.get(filePackageName).add(single_file);
    }

    //logger.info("searchForAutoGens: We found " + files.length + " autogen.h files")
    if (!packageName) this.cppToolsApi.didChangeCustomConfiguration(this);

    if (files.length = 0) return false;
    return true;
  }

  // Search for Make Files
  public async searchForMakeFiles(packageName?: string): Promise<boolean> {
    const fsPath = this.workspace.uri.fsPath;

    if (this.selectedName.Value == 'None') {
      logger.error("searchForMakeFiles: We don't have a package to search")
      return false;
    }
    const wsBuildPath = path.join(fsPath, 'Build', this.selectedName.Value)
    let base = "";
    if (packageName) {
      base = path.join(wsBuildPath, "*", "*", packageName);
      this.foundMakefiles.tryClearPkg(packageName);
    }
    else {
      base = path.join(wsBuildPath, "*", "*", "*Pkg"); 4
      this.foundMakefiles.clear();
    }

    const files = await promisifyGlob(path.join(base, "**", "Makefile"));

    for (const single_file of files) {
      const filePackageName = this.getPackageFromPath(single_file.substr(wsBuildPath.length));
      if (filePackageName == null) {
        logger.error("searchForMakeFiles: We couldn't parse a package for " + single_file)
        continue;
      }
      const normalizedFile = path.normalize(single_file);
      await this.foundMakefiles.Add(filePackageName, normalizedFile);
    }

    //logger.info("searchForMakeFiles: We found " + files.length + " makefiles files")
    if (!packageName) this.cppToolsApi.didChangeCustomConfiguration(this);

    if (files.length = 0) return false;
    return true;
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
    if (uriSubPath.startsWith(path.sep + "Build" + path.sep)) {
      //logger.info("We cannot provide config for a build file?")
      return false;
    }
    const packageName = this.getPackageFromPath(uriSubPath);
    //kick off search for make files and autogen.h
    if (this.foundMakefiles.has(packageName)) return true;
    this.searchForAutoGens(packageName);
    return await this.searchForMakeFiles(packageName);
  }


  public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
    const ret: SourceFileConfigurationItem[] = [];
    const basePath = this.workspace.uri.fsPath;
    for (const uri of uris) {
      const defines: string[] = ["_DEBUG", "UNICODE", "_UNICODE"];
      const uriPath = uri.fsPath;
      const uriSubPath = uriPath.substring(basePath.length)
      const includePaths: string[] = [basePath];
      const msvc = true;

      if (uriSubPath.startsWith(path.sep + "Build" + path.sep)) {
        //logger.info("Skipping " + uri)
        ret.push({
          configuration: {
            defines: defines,
            includePath: includePaths,
            intelliSenseMode: msvc ? 'msvc-x64' : 'clang-x64',
            standard: 'c99',
          },
          uri: vscode.Uri.file(uriPath),
        });
        continue;
      }

      //logger.info("-----")
      //logger.info("Remaping " + uriSubPath)

      let forcedInclude = [];
      //remove the actual file part
      const packageName = this.getPackageFromPath(uriSubPath);

      //logger.info("Finding AutoGen for " + packageName)
      if (this.foundAutoGens.has(packageName)) {
        const packageFiles = this.foundAutoGens.get(packageName)
        logger.info("We found autogen files for this package: " + packageFiles.size);
        // TODO only add the ones that we care about
        let maxMatchStrength = 0;
        let maxMatch = "";
        for (const packageFile of packageFiles) {
          const matchStrength = pathMatch(packageFile, uriPath, packageName, basePath);
          if (maxMatchStrength < matchStrength) {
            maxMatch = packageFile;
            maxMatchStrength = matchStrength;
            //logger.info("Better match is "+maxMatch)
          }
        }
        forcedInclude.push(maxMatch);
      } else {
        logger.error("WE didn't find any autogen for this package" + packageName)
      }
      //logger.info("Finding MakeFiles for " + packageName)
      if (this.foundMakefiles.has(packageName)) {
        const packageFiles = this.foundMakefiles.get(packageName, uriPath)
        logger.info("We found make files for this package: " + packageFiles.length);
        for (const packageFile of packageFiles) includePaths.push(packageFile);
        //TODO read the make file we care about and figure what we want to do
        //TODO store these results by uri?
      } else {
        logger.error("WE didn't find makefiles for this package" + packageName)
      }

      //logger.info("Include Paths: " + includePaths.join(" , "))
      //logger.info("Force Include Paths: " + forcedInclude.join(" , "))


      ret.push({
        configuration: {
          defines: defines,
          includePath: includePaths,
          forcedInclude: forcedInclude,
          intelliSenseMode: msvc ? 'msvc-x64' : 'clang-x64',
          standard: 'c99',
        },
        uri: uri,
      });
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
        this.foundAutoGens.clear();
        this.foundMakefiles.clear();
        //kick off a search for autogens and make files
        this.searchForAutoGens()
        this.searchForMakeFiles()
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