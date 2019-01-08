import { CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi } from 'vscode-cpptools';

import { CppProvider } from "./cpp_provider";
import * as path from 'path';


// Dispose of the 'api' in your extension's deactivate() method, or whenever you want to unregister the provider.

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "helloworld-sample" is now active!');
  const workspaces = vscode.workspace.workspaceFolders;
  const resourceRoot = path.join(context.extensionPath, 'resources');
  let api: CppToolsApi | undefined = await getCppToolsApi(Version.v2);
  if (api) {
    context.subscriptions.push(api);
    console.log("We loaded the stupid API PROPERLY")
    vscode.window.showInformationMessage('We loaded the stupid API PROPERLY');
    if (api.notifyReady) {
      if (workspaces !== undefined) {
        for (const wp of workspaces) {
          const configLoader = new CppProvider(wp, api, resourceRoot);
          api.registerCustomConfigurationProvider(configLoader);
          api.didChangeCustomConfiguration(configLoader);
          context.subscriptions.push(configLoader);
          api.notifyReady(configLoader);
        }
      }
    } else {
      // Running on a version of cpptools that doesn't support v2 yet.

      // Do any required setup that the provider needs.

      // Inform cpptools that a custom config provider will be able to service the current workspace.
      //cpp_api.registerCustomConfigurationProvider(provider);
      //cpp_api.didChangeCustomConfiguration(provider);
      const configLoader = new CppProvider(workspaces[0], api, resourceRoot);
      api.registerCustomConfigurationProvider(configLoader);
      context.subscriptions.push(configLoader);
      api.notifyReady(configLoader);
    }
  }

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