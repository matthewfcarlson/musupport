

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
  logger.log('Congratulations, your extension "helloworld-sample" is now active!');
  const workspaces = vscode.workspace.workspaceFolders;
  const resourceRoot = path.join(context.extensionPath, 'resources');

  const wp = vscode.workspace.workspaceFolders;
  if (wp) {
    for (const w of wp) {
      const persistentState = new PersistentFolderState('wpilib.newProjectHelp', false, w.uri.fsPath);
      if (persistentState.Value === false) {
        persistentState.Value = true;
      }
    }

  }

  InstallCppProvider(context, workspaces, resourceRoot);

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('extension.helloWorld', () => {
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage('Hello World!');
  });

  context.subscriptions.push(disposable);

}

// this method is called when your extension is deactivated
export function deactivate() { }
