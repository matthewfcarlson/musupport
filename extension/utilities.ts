'use strict';
import * as fs from 'fs';
import * as path from 'path';
import * as timers from 'timers';
import * as vscode from 'vscode';
import * as glob from 'glob';
import { logger } from './logger';
import { execCommand } from './exec';


// General utilites usable by multiple classes

export const extension = vscode.extensions.getExtension('microsoft.musupport');

export function getIsWindows(): boolean {
  const nodePlatform: NodeJS.Platform = process.platform;
  return nodePlatform === 'win32';
}

export function containsMuProjects(path: string): boolean {
  console.log("Utilities- checking in " + path + " is a mu enabled project")
  return true;
}
export function delay(milliseconds: number): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(() => {
      resolve();
    }, milliseconds);
  });
}
export async function getClassName(): Promise<string | undefined> {
  const promptString = 'Please enter a class name';
  const className = await vscode.window.showInputBox({
    prompt: promptString,
    validateInput: (s) => {
      const match = s.match('^([a-zA-Z_]{1}[a-zA-Z0-9_]*)$');
      if (match === null || match.length === 0) {
        return 'Invalid Classname';
      }
      return undefined;
    },
  });
  return className;
}

export async function getPackageName(): Promise<string | undefined> {
  const promptString = 'Please enter a package name';
  const packageName = await vscode.window.showInputBox({
    prompt: promptString,
    validateInput: (s) => {
      const match = s.match('^([a-zA-Z_]{1}[a-zA-Z0-9_]*(\\.[a-zA-Z_]{1}[a-zA-Z0-9_]*)*)$');

      if (match === null || match.length === 0) {
        return 'Invalid Package Name';
      }

      return undefined;
    },
  });
  return packageName;
}

export function readFileAsync(file: string): Promise<string> {
  return promisifyReadFile(file);
}

export function promisifyReadFile(filename: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
      if (err != null) {
        logger.error("promisifyReadFile err")
        logger.error(typeof err);
        reject(err);
      }
      else resolve(data);
    });
  });
}

export function stringTrim(string: string) {
  return string.replace(/^\s+|\s+$/g, '');
};

export function getPackageFromPath(uriSubPath: string): string | null {
  let pathFragments = path.normalize(uriSubPath).split(path.sep) // should be the file seperator of our system
  let packageName = "";
  while (pathFragments.length > 0 && packageName == "") {
      const pathFragmentPiece = pathFragments.shift();
      if (pathFragmentPiece.endsWith("Pkg")) {
          packageName = pathFragmentPiece;
          return packageName;
      }
  }

  return null;
}

export function promisifyExists(filename: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fs.exists(filename, (e) => {
      resolve(e);
    });
  });
}

export function promisifyIsDir(filename: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    fs.lstat(filename, (e, stats) => {
      if (e) reject(e);
      else resolve(stats.isDirectory());
    });
  });
}

export function promisifyReadDir(foldername: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    fs.readdir(foldername, (e, data) => {
      if (e) reject(e);
      else resolve(data);
    });
  });
}

export function promisifyGlob(pattern: vscode.GlobPattern, options?: glob.IOptions): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    glob(pattern.toString(), (e, data) => {
      if (e) reject(e);
      else resolve(data);
    });
  });
}


export function promisifyWriteFile(filename: string, contents: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fs.writeFile(filename, contents, 'utf8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function promisifyMkDir(dirName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    fs.mkdir(dirName, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function promisifyTimer(time: number): Promise<void> {
  return new Promise<void>((resolve, _) => {
    timers.setTimeout(() => {
      resolve();
    }, time);
  });
}

export function promisifyDeleteFile(file: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    fs.unlink(file, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}



export let extensionContext: vscode.ExtensionContext;
export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}


export async function promptForProjectOpen(toFolder: vscode.Uri): Promise<boolean> {
  const openSelection = await vscode.window.showInformationMessage('Would you like to open the folder?', {
    modal: true,
  }, 'Yes (Current Window)', 'Yes (New Window)', 'No');
  if (openSelection === undefined) {
    return true;
  } else if (openSelection === 'Yes (Current Window)') {
    await vscode.commands.executeCommand('vscode.openFolder', toFolder, false);
  } else if (openSelection === 'Yes (New Window)') {
    await vscode.commands.executeCommand('vscode.openFolder', toFolder, true);
  } else {
    return true;
  }
  return true;
}

export function getPythonPath(workspace: vscode.WorkspaceFolder): string {
  const config = vscode.workspace.getConfiguration("python", workspace.uri);
  return config.get("pythonPath");

	// const config = vscode.workspace.getConfiguration(null, null);
	// let path: string = null;

	// /*path = config.get('mu.pythonPath');
	// if (!path) {
	// 	path = config.get('python.pythonPath');
	// 	if (!path) {
	// 		error('No python path is set');
	// 	}
	// }*/

  // path = config.get('python.pythonPath');
  // if (!path) {
  //   logger.error('No python path is set');
  // }

	// //path = fs.realpathSync(path);
	// // if (!path || !fs.existsSync(path)) {
	// //     return;
	// // }

	//return path;
}

export async function validatePythonPath(workspace: vscode.WorkspaceFolder) {
  let pythonPath = await getPythonPath(workspace);

  // TODO: Find a safer way to detect if python exists in the system PATH
  try {
      let {stdout, stderr} = await execCommand(pythonPath + ' --version', { });
      logger.info("Python Version: " + stdout);
  }
  catch (e) {
      logger.error(e);
      showError("pythonPath does not point to a valid interpreter.\nMake sure it exists in the system path or points directly to python.exe");
      return;
  }
}

export function showMessage(message: string) {
	logger.info(message);
	return vscode.window.showInformationMessage('MU: ' + message);
}

export function showWarning(message: string) {
	logger.warn(message);
	return vscode.window.showWarningMessage('MU: WARNING: ' + message);
}

export function showError(message: string) {
  logger.error(message);
  return vscode.window.showErrorMessage('MU: ' + message);
}
