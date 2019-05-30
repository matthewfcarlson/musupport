import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as utils from './utilities';
import { logger } from "./logger";

// Execute a command asynchronously and return stdout/stderr
export function execCommand(command: string, options: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
    logger.info('Exec: '+command);
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		cp.exec(command, options, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
			}
			resolve({ stdout, stderr });
		});
	});
}

// Execute a python expression asynchronously and return stdout
export async function execPython(workspace: vscode.WorkspaceFolder, expression: string, cwd: string = null, timeout_ms = 10000): Promise<string> {
	if (!cwd) {
		cwd = vscode.workspace.rootPath; // TODO: Support multiple workspaces...
	}

	let pythonPath = utils.getPythonPath(workspace);
	try {
		let options: cp.SpawnOptions = { 
			cwd: cwd,
			windowsVerbatimArguments: true,
			//detached: true,
			stdio: 'pipe'
		};
		let promise = new Promise<string>((resolve, reject) => {
			let proc = cp.spawn(pythonPath, [], options);

			// Kill process if it hangs or takes too long
			setTimeout(() => {
				proc.kill();
				reject("Timeout!");
			}, timeout_ms);

			// Capture stdout/stderr
			let stdout: string = "";
			let stderr: string = "";
			proc.stdout.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			proc.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});

			proc.addListener("exit", (code, signal) => {
				if (code === 0) {
					resolve(stdout);
				} else {
					reject(`exit code=${code}: ${stderr}`);
				}
			});

			// Send the python statement via STDIN and close the pipe to execute
			proc.stdin.write(expression);
			proc.stdin.end();
		});

		return await promise;
	} catch (e) {
		logger.error('Failed to execute python statement:', e);
		throw e;
	}
}

// Execute a python script file asynchronously and return stdout
export async function execPythonScript(workspace: vscode.WorkspaceFolder, file: vscode.Uri, args: string[], cwd: string = null, timeout_ms = 10000): Promise<string> {
	if (!cwd) {
		cwd = vscode.workspace.rootPath;
	}

	let pythonPath = utils.getPythonPath(workspace);
	try {
		let options: cp.ExecOptions = { 
			cwd: cwd
		};
		let promise = new Promise<string>((resolve, reject) => {
			let _args = [file.fsPath];
			if (args) {
				_args = _args.concat(args);
			}
			let proc = cp.execFile(pythonPath, _args, options, (error, stdout, stderr) => {
				if (error) {
					reject(`exit ${stderr}`);
				}
				resolve(stdout);
			});

			// Kill process if it hangs or takes too long
			setTimeout(() => {
				proc.kill();
				reject("Timeout!");
			}, timeout_ms);
		});

		return await promise;
	} catch (e) {
		logger.error('Failed to execute python script', e);
		throw e;
	}
}

