
import * as vscode from 'vscode';
import * as utils from './utilities';
import { logger } from './logger';

/**
 * Provides a shared terminal in which you can run commands
 * 
 * NOTE: Currently there's no way to wait for a command to complete...
 */
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

    /**
     * Run a shell command in the UEFI terminal window.
     * Terminal remains open after execution (launches powershell terminal).v
     * 
     * NOTE: Arguments are NOT escaped!! Do not trust user input...
     * 
     * @param exec The process to execute within the shell
     * @param args Arguments to pass to the process. 
     * @param cwd  The current working directory for the process
     */
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

        // It is not possible to wait for completion, as the terminal remains open after the command finishes.
    }

    /**
     * Run a shell command in the UEFI terminal window.
     * Terminal automatically closes after execution has completed.
     * 
     * @param exec The process to execute (as a shell)
     * @param args Arguments to pass to the process
     * @param cwd  The current working directory for the shell
     */
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

        // TODO: Wait for 'this.uefiTerminal.processId' to complete
    }

    /**
     * Run python.exe using the currently configured interpreter (python.pythonPath)
     * 
     * @param args Arguments to pass to python.exe
     * @param cwd  The current working directory
     */
    async runPythonCommand(args: string[], label: string = null, cwd: string = null) {
        let pythonPath = utils.getPythonPath(this.workspace);
        //await this.runShell(pythonPath, args, cwd);
        await this.runCommand(pythonPath, args, cwd);
    }

}