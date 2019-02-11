

import { InstallCppProvider } from "./cpp/cpp_provider";
import * as path from 'path';
import { PersistentFolderState } from './persistentState';
import { logger } from './logger';
import { setExtensionContext } from './utilities';

// Dispose of the 'api' in your extension's deactivate() method, or whenever you want to unregister the provider.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

  setExtensionContext(context);
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  const workspaces = vscode.workspace.workspaceFolders;
  const resourceRoot = path.join(context.extensionPath, 'resources');

  //InstallCppProvider(context, workspaces, resourceRoot);

}

// this method is called when your extension is deactivated
export function deactivate() { }
