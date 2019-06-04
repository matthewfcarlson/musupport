'use strict';
import * as path from 'path';
import * as vscode from 'vscode';
import * as utils from './utilities';
import { logger } from './logger';
import { ProjectManager } from './projectmanager';

// See this for why task definitions have to be a 1:1 mapping to tasks.json
// https://github.com/Microsoft/vscode/issues/33523

// TODO: Consider renaming "musupport" to "uefi"

const UEFI_BUILD_PROVIDER: string = "uefi-corebuild";
const UEFI_BUILD_PROBLEM_MATCHER: string = "$uefi-corebuild";

enum UefiTaskAction {
    Update = "update",
    Build = "build"
}

// This must match exactly a definition in tasks.json
// Ie, you cannot customize it with abitrary paths/flags
interface UefiTaskDefinition extends vscode.TaskDefinition {
    task: UefiTaskAction;
    profile?: string; // eg. 'DEV', 'RELEASE'
}

/*
    The UefiTasks class is responsible for providing build tasks that can be used in tasks.json.

    This makes two types of build task available:
        uefi-corebuild.build  (Invokes 'PlatformBuild.py' for the current project)
        uefi-corebuild.update (Invokes 'PlatformBuild.py --UPDATE' for the current project)

    This also provides a way to run abitrary commands using the task framework.
*/
export class UefiTasks implements vscode.Disposable {
    workspace: vscode.WorkspaceFolder;
    projManager: ProjectManager;

    private update_task: vscode.Task;

    constructor(workspace: vscode.WorkspaceFolder, projManager: ProjectManager) {
        this.workspace = workspace;
        this.projManager = projManager;
    }

    register() {

        vscode.tasks.onDidStartTask(async (e) => {
            //let all_tasks = await vscode.tasks.fetchTasks();
            let task = e.execution.task;
            logger.info(`Task ${task.name} started`);
        });
        vscode.tasks.onDidEndTask(async (e) => {
            let task = e.execution.task;
            logger.info(`Task ${task.name} finished`);
        })

        vscode.tasks.registerTaskProvider(UEFI_BUILD_PROVIDER, {
            provideTasks: () => {
                return this.getTasks();
            },
            resolveTask(_task: vscode.Task): vscode.Task | undefined {
                return undefined; // Reserved for future use. Not currently invoked by anything
            },

        });

        logger.info(`Task Provider Registered (${UEFI_BUILD_PROVIDER})`);

        // Generate a uefi-corebuild.update task
        this.update_task = this.createUpdateTask('Update');
    }

    unregister() {
        // TODO
    }

    dispose() {
        // TODO
    }

    public getTasks(): vscode.Task[] { 
        let buildTasks: vscode.Task[] = [];

        buildTasks.push(this.update_task);

        // Generate a uefi-corebuild.build task for each known config/profile (eg. 'DEV', 'RELEASE')
        let configs = this.projManager.getAvailableConfigs();
        let currProj = this.projManager.getCurrentProject();
        if (currProj) {
            logger.info(`Generate build tasks for project ${currProj.projectName} (configs: ${configs})`);

            if (configs) {
                for (var conf of configs) {
                    buildTasks.push(this.createBuildTask(`Build ${conf}`, conf));
                }
            } else {
                logger.warn('No build tasks generated for the current project');
            }
        }
        else {
            logger.warn('No build tasks generated because project not selected');
        }
        
        return buildTasks;
    }

    public async runTaskByName(name: string, type: string = 'uefi-corebuild') {
        let tasks = await vscode.tasks.fetchTasks({type: type});
        if (tasks) {
            let task = tasks.find((v,i,o) => { return (v.name === name); });
            if (task) {
                return this.runTask(task);
            }
        }
        throw new Error('Could not find task');
    }

    public async runTask(task: vscode.Task) {
         // Create a promise that completes when the task has ended
         let promise = new Promise<number>((resolve, reject) => {
            let evtHandler = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution.task == task) {
                    evtHandler.dispose();
                    resolve(e.exitCode);
                }
            });
            // TODO: If task doesn't run a process, this will break.
        });

        await vscode.tasks.executeTask(task);
        let exitCode = await promise;
        if (exitCode != 0) {
            logger.error(`Failed to run task (exit:${exitCode})`);
            throw Error('Task failed');
        }
    }


    private createBuildTask(name: string, config: string): vscode.Task {
        let definition: UefiTaskDefinition = {
            task: UefiTaskAction.Build,
            type: UEFI_BUILD_PROVIDER,
            profile: config
        };

        // Arguments to pass to the build script (not overrideable by tasks.json)
        let args: string[] = [
            "${config:musupport.currentPlatformBuildScriptPath}",
        ];

        const cfg = vscode.workspace.getConfiguration('musupport', null);
        let cfgArgs: string[] = cfg.get('platformBuildScriptArgs');
        if (cfgArgs) {
            // Expand ${config} variable
            cfgArgs = cfgArgs.map((arg) => arg.replace('${config}', config));
            args = args.concat(cfgArgs);
        }

        let options: vscode.ProcessExecutionOptions = {
        };
        let pythonPath = utils.getPythonPath(this.workspace);
        let task = new vscode.Task(definition, name, 'UEFI',
            new vscode.ProcessExecution(pythonPath, args, options),
            UEFI_BUILD_PROBLEM_MATCHER);

        task.group = vscode.TaskGroup.Build;
        return task;
    }

    private createUpdateTask(name: string): vscode.Task {
        let definition: UefiTaskDefinition = {
            task: UefiTaskAction.Update,
            type: UEFI_BUILD_PROVIDER
        };
        let args: string[] = [
            "${config:musupport.currentPlatformBuildScriptPath}",
            "--update"
        ];
        let options: vscode.ProcessExecutionOptions = {};
        let pythonPath = utils.getPythonPath(this.workspace);
        let task = new vscode.Task(definition, name, 'UEFI',
            new vscode.ProcessExecution(pythonPath, args, options),
            UEFI_BUILD_PROBLEM_MATCHER);

        task.group = vscode.TaskGroup.Build;
        return task;
    }

    public async runUpdateTask() {
        if (this.update_task) {
            return this.runTask(this.update_task);
        }
    }

    /**
     * Run a command as a temporary task and wait for it to complete
     * 
     * @param exec The process to execute within the task
     * @param args Arguments to pass to the process. 
     * @param name The task name to show in the UI
     * @param cwd  The current working directory for the process
     * @returns    The process exit code
     */
    public async runCommandAsTask(exec: string, args: string[], name: string = null, cwd: string = null) : Promise<number> {
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
     * Run python.exe as a task, using the currently configured interpreter (python.pythonPath)
     * Waits until the task completes, and throws an exception if the exit code is not 0.
     * 
     * @param args      Arguments to pass to python.exe
     * @param label     The task label
     * @param cwd       The current working directory
     */
    public async runPythonTask(args: string[], label: string = null, cwd: string = null) {
        let pythonPath = utils.getPythonPath(this.workspace);

        let exitCode = await this.runCommandAsTask(pythonPath, args, label, cwd);
        if (exitCode != 0) {
            logger.error(`Failed to execute: python ${args} (exit:${exitCode})`);
            throw Error('Failed to execute python command');
        }
    }

}