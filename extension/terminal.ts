
import * as path from 'path';
import * as vscode from 'vscode';
import * as utils from './utilities';
import { logger } from './logger';

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
    // 
    // 
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
     * Run a command as a temporary task and wait for it to complete
     * 
     * @param exec The process to execute within the task
     * @param args Arguments to pass to the process. 
     * @param cwd  The current working directory for the process
     * @returns    The process exit code
     */
    async runCommandAsTask(exec: string, args: string[], name: string = null, cwd: string = null) : Promise<number> {
        if (!name) { 
            name = path.basename(exec);
        }

        // Create a temporary task
        const task_type = 'uefi-temptask';
        let task_exec = new vscode.ProcessExecution(exec, args, { cwd: cwd });
        let task = new vscode.Task({ type: task_type }, name, 'UEFI', task_exec);

        // Create a temporary task provider
        let taskProvider = vscode.tasks.registerTaskProvider(task_type, {
            provideTasks: () => {
                return [task];
            },
            resolveTask(_task: vscode.Task) { return undefined; }
        });

        // Create a promise that completes when the task has ended
        let promise = new Promise<number>((resolve, reject) => {
            let evtHandler = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution.task == task) {
                    evtHandler.dispose();
                    resolve(e.exitCode);
                }
            });
        });

        // Execute
        try {
            await vscode.tasks.executeTask(task);
        } finally {
            // Unregister the task provider so the user can't invoke it
            taskProvider.dispose();
        }

        // Wait for task completion
        return promise;
    }

    /**
     * Run python.exe (using the currently configured interpreter)
     * 
     * @param args Arguments to pass to python.exe
     * @param cwd  The current working directory
     */
    // Run a python command in the UEFI terminal window,
    // using the currently configured python interpreter (python.pythonPath)
    async runPythonCommand(args: string[], label: string = null, cwd: string = null) {
        let pythonPath = utils.getPythonPath(this.workspace);

        let exitCode = await this.runCommandAsTask(pythonPath, args, label, cwd);
        if (exitCode != 0) {
            logger.error(`Failed to execute: python ${args} (exit:${exitCode})`);
            throw Error('Failed to execute python command');
        }
    }

}