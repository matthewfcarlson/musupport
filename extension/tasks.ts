'use strict';
import * as vscode from 'vscode';
import * as utils from './utilities';
import { logger } from './logger';

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
    profile?: string;
}


export class UefiTasks implements vscode.Disposable {
    constructor() {
        
    }

    register() {
        vscode.tasks.registerTaskProvider(UEFI_BUILD_PROVIDER, {
            provideTasks: () => {
                return this.getTasks();
            },
            resolveTask(_task: vscode.Task): vscode.Task | undefined {
                return undefined; // Reserved for future use. Not currently invoked by anything
            },

        });

        logger.info(`Task Provider Registered (${UEFI_BUILD_PROVIDER})`);
    }

    unregister() {
        // TODO
    }

    dispose() {
        // TODO
    }


    getTasks(): vscode.Task[] { 
        let buildTasks: vscode.Task[] = [];

        let configs = ['DEV'];
        //let configs = this.projManager.getAvailableConfigs(); // TODO: Scan for known build configurations
        //utils.debug(`Generate build tasks for project ${this.projManager.getCurrentProject().projectName} (configs: ${configs})`);
        if (configs) {
            for (var conf of configs) {
                buildTasks.push(this.createBuildTask(`Build ${conf}`, conf));
            }
        }

        buildTasks.push(this.createUpdateTask('Update'));
        
        return buildTasks;
    }

    async runTask(name: string, type: string = 'uefi-corebuild') {
        let tasks = await vscode.tasks.fetchTasks({type: type});
        if (tasks) {
            let task = tasks.find((v,i,o) => { return (v.name === name); });
            if (task) {
                vscode.tasks.executeTask(task);
                return;
            }
        }
        throw new Error('Could not find task');
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
        let pythonPath = utils.getPythonPath();
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
        let pythonPath = utils.getPythonPath();
        let task = new vscode.Task(definition, name, 'UEFI',
            new vscode.ProcessExecution(pythonPath, args, options),
            UEFI_BUILD_PROBLEM_MATCHER);

        task.group = vscode.TaskGroup.Build;
        return task;
    }
}