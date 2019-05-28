

import * as vscode from 'vscode';
import { InstallCppProvider, UninstallCppProvider } from "./cpp/cpp_provider";
import * as path from 'path';
import { PersistentFolderState } from './persistentState';
import { logger } from './logger';
import { setExtensionContext } from './utilities';
import { UefiTasks } from "./tasks";


let tasks: UefiTasks;


function SetupContext(context: vscode.ExtensionContext) {
  logger.info("MAIN - SETTING UP CONTEXT");
  const workspaces = vscode.workspace.workspaceFolders;
  const resourceRoot = path.join(context.extensionPath, 'resources');
  const config = vscode.workspace.getConfiguration("musupport");
  try {
    if (config["useAsCppProvider"] != undefined) {
      if (config["useAsCppProvider"]) InstallCppProvider(context, workspaces, resourceRoot);
      else UninstallCppProvider(context, workspaces, resourceRoot);
    }
  }
  catch (err) {
    logger.error("MAIN error", err)
  }
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

  setExtensionContext(context);
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated

  SetupContext(context);
  vscode.workspace.onDidChangeConfiguration((e) => {
    SetupContext(context);
  });

  tasks = new UefiTasks();
  tasks.register();
}


// this method is called when your extension is deactivated
export function deactivate() {
  if (tasks) {
    tasks.dispose();
    tasks = undefined;
  }

}
