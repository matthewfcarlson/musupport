'use strict';
import * as fs from 'fs';
import * as path from 'path';
import * as timers from 'timers';
import * as vscode from 'vscode';
import * as glob from 'glob';


// General utilites usable by multiple classes

export function getIsWindows(): boolean {
  const nodePlatform: NodeJS.Platform = process.platform;
  return nodePlatform === 'win32';
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
  return new Promise((resolve, reject) => {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

export function promisifyReadFile(filename: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(filename, 'utf8', (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
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

export function promisifyGlob(pattern: vscode.GlobPattern, options?:glob.IOptions): Promise<string[]> {
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

export function getDesktopEnabled(buildgradle: string): Promise<boolean | undefined> {
  return new Promise<boolean | undefined>((resolve) => {
    fs.readFile(buildgradle, 'utf8', (err, dataIn) => {
      if (err) {
        resolve(undefined);
      } else {
        const dataOut = dataIn.match(/def\s+includeDesktopSupport\s*=\s*(true|false)/m);
        if (dataOut === null) {
          resolve(undefined);
        } else {
          resolve(dataOut[1] === 'true');
        }
      }
    });
  });
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