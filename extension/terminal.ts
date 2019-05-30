
import * as vscode from 'vscode';
import * as utils from './utilities';

export class UefiTerminal implements vscode.Disposable {
    private workspace: vscode.WorkspaceFolder;
    private uefiTerminal : vscode.Terminal = null;

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
    }

    dispose() {
        if (this.uefiTerminal !== null) {
            this.uefiTerminal.dispose();
            this.uefiTerminal = null;
        }
    }

    private terminate() {
        if (this.uefiTerminal !== null) {
            // TODO: Terminate currently running terminal
            //vscode.window.showErrorMessage("Terminal currently running");
            //return;
            this.uefiTerminal.dispose();
            this.uefiTerminal = null;
        }
    }

    // Run a shell command in the UEFI terminal window
    // Terminal remains open after execution (launches powershell terminal)
    async runCommand(exec: string, args: string[], cwd: string = null) {
        this.terminate();

        if (!cwd) {
            cwd = vscode.workspace.rootPath;
        }

        let options : vscode.TerminalOptions = {
            name: 'MU CoreBuild',
            cwd: cwd,
        };
        this.uefiTerminal = vscode.window.createTerminal(options);
        this.uefiTerminal.show();
        this.uefiTerminal.sendText(exec + ' ' + args.join(' '));

        // TODO: Wait for completion
    }

    // Run a shell command in the UEFI terminal window
    // Automatically closes terminal when execution has completed
    async runShell(exec: string, args: string[], cwd: string = null) {
        this.terminate();

        if (this.uefiTerminal !== null) {
            // TODO: Terminate currently running terminal
            //vscode.window.showErrorMessage("Terminal currently running");
            //return;
            this.uefiTerminal.dispose();
            this.uefiTerminal = null;
        }

        if (!cwd) {
            cwd = vscode.workspace.rootPath;
        }

        let options : vscode.TerminalOptions = {
            name: 'MU CoreBuild',
            cwd: vscode.workspace.rootPath,
            shellPath: exec, // Could be python.exe for example
            shellArgs: args,
            // env: {
            //     PATH: 'C:\\Python27\\',
            //     PYTHON_PATH: 'C:\\Python27\\'
            // }
        };
        this.uefiTerminal = vscode.window.createTerminal(options);
        this.uefiTerminal.show();
    }

    // Run a python command in the UEFI terminal window,
    // using the currently configured python interpreter (python.pythonPath)
    async runPythonCommand(args: string[], cwd: string = null, runAsShell: boolean = false) {
        let pythonPath = utils.getPythonPath(this.workspace);
        if (runAsShell) {
            return this.runShell(pythonPath, args, cwd);
        }
        else {
            return this.runCommand(pythonPath, args, cwd);
        }
    }

}