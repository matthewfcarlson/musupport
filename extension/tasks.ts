'use strict';
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
*/
export class UefiTasks implements vscode.Disposable {
    workspace: vscode.WorkspaceFolder;
    projManager: ProjectManager;

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
    }

    unregister() {
        // TODO
    }

    dispose() {
        // TODO
    }

    getTasks(): vscode.Task[] { 
        let buildTasks: vscode.Task[] = [];

        // Generate a uefi-corebuild.build task for each known config/profile (eg. 'DEV', 'RELEASE')
        let configs = this.projManager.getAvailableConfigs();
        let currProj = this.projManager.getCurrentProject();
        if (!currProj) {
            utils.showError('No project selected - cannot build');
            return null;
        }

        logger.info(`Generate build tasks for project ${currProj.projectName} (configs: ${configs})`);

        if (configs) {
            for (var conf of configs) {
                buildTasks.push(this.createBuildTask(`Build ${conf}`, conf));
            }
        }

        // Generate a uefi-corebuild.update task
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
}