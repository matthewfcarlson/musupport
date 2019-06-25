import * as vscode from 'vscode';
import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import { logger } from '../logger';
import * as utils from '../utilities';
import { ProjectDefinition } from '../projectmanager';
import { CppProcessor } from './cpp_processor';
import { CCppProperties } from './cpp_properties';

export class CppConfigurationProvider implements CustomConfigurationProvider, vscode.Disposable {
    get name()        { return utils.extension.packageJSON.displayName; }
    get extensionId() { return utils.extension.id; }

    private context: vscode.ExtensionContext;
    public readonly workspace: vscode.WorkspaceFolder;

    private activeProject: ProjectDefinition = null;
    private disposables: vscode.Disposable[] = [];
    private cppapi: CppToolsApi = null;
    private processor: CppProcessor;
    private enabled: boolean = false;

    private defaultBrowseConfig: WorkspaceBrowseConfiguration = {
        standard: 'c11',
        browsePath: ["${workspaceFolder}\\**"]
    };

    constructor(context: vscode.ExtensionContext, workspace: vscode.WorkspaceFolder) {
        this.context = context;
        this.workspace = workspace;
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }

    /**
     * Register the C/C++ configuration provider with a specific workspace
     */
    public async register() {
        this.cppapi = await getCppToolsApi(Version.v2);
        if (!this.cppapi) {
            utils.showError("Could not connect to C/C++ extension (ms-vscode.cpptools)");
            return;
        }
        this.disposables.push(this.cppapi);
        //context.subscriptions.push(this); // ??

        // Write c_cpp_properties.json if not yet present
        CCppProperties.writeDefaultCCppPropertiesJsonIfNotExist(this.workspace.uri);

        // Register our custom configuration provider
        this.cppapi.registerCustomConfigurationProvider(this);

        // Notify the C/C++ extension that the provider is ready to provide custom configurations
        this.cppapi.notifyReady(this);

        // Listen to configuration changes
        //this.disposables.push(main.config.ConfigurationChanged((cfg) => this.updateConfiguration()));

        this.processor = new CppProcessor(this.workspace);
        this.enabled = true;

        logger.info('MU C/C++ configuration provider registered');
    }

    /**
     * Unregister the C/C++ configuration provider
     */
    public unregister() {
        this.enabled = false;
        this.dispose();
        this.cppapi = null;
        this.processor = null;
    }

    public setActiveProject(project: ProjectDefinition) {
        if (project) {
            this.activeProject = project;
            // TODO: Scan the current project's INFs/DCs.
            this.cppapi.didChangeCustomConfiguration(this);
        }
    }

    public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
        if (!this.enabled) {
            logger.warn('CPP_PROVIDER: Not activated');
            return false;
        }
        if (!this.activeProject) {
            logger.warn('CPP_PROVIDER: No project selected');
            return false;
        }
        return true;
    }

    public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
        return Promise.resolve(this.defaultBrowseConfig);
    }
  
    public async canProvideConfiguration(uri: vscode.Uri, cancel: vscode.CancellationToken | undefined): Promise<boolean> {
        logger.info("CPP_PROVIDER: Checking if we can provide configuration for ", uri.fsPath);

        if (!this.enabled) {
            logger.warn('CPP_PROVIDER: Not activated');
            return false;
        }
        if (!this.activeProject) {
            logger.warn('CPP_PROVIDER: No project selected');
            return false;
        }

        const fileWp = vscode.workspace.getWorkspaceFolder(uri);
        if (fileWp === undefined || fileWp.index !== this.workspace.index) {
            logger.warn('CPP_PROVIDER: File not in workspace');
            return false;
        }

        //what to do when we can't provide this configurations
        if (!this.processor.HasConfigForFile(uri)) {
            logger.warn('CPP_PROVIDER: Config not available');
            return false
        }
        return true;
    }

    public async provideConfigurations(uris: vscode.Uri[], _: vscode.CancellationToken | undefined): Promise<SourceFileConfigurationItem[]> {
        const ret: SourceFileConfigurationItem[] = [];
        const basePath = this.workspace.uri.fsPath;
        for (const uri of uris) {
            const data = this.processor.GetConfigForFile(uri);
            ret.push(data);
        }
        return ret;
    }

    public get isEnabled() : boolean {
        return this.enabled;
    }
}
