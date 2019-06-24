import * as vscode from 'vscode';
import { CppToolsApi, CustomConfigurationProvider, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Version, getCppToolsApi } from 'vscode-cpptools';
import { logger } from '../logger';
import * as utils from '../utilities';
import { ProjectDefinition } from '../projectmanager';
import { CppProcessor } from './cpp_processor';

export class CppConfigurationProvider implements CustomConfigurationProvider, vscode.Disposable {
    get name()        { return utils.extension.packageJSON.description; }
    get extensionId() { return utils.extension.id; }

    private context: vscode.ExtensionContext;
    public readonly workspace: vscode.WorkspaceFolder;

    private activeProject: ProjectDefinition = null;
    private disposables: vscode.Disposable[] = [];
    private cppapi: CppToolsApi = null;
    private processor: CppProcessor;
    private enabled: boolean = false;

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
        logger.info('Register C/C++ configuration provider');

        this.cppapi = await getCppToolsApi(Version.v2);
        if (!this.cppapi) {
            utils.showError("Could not connect to C/C++ extension (ms-vscode.cpptools)");
            return;
        }
        this.disposables.push(this.cppapi);
        //context.subscriptions.push(this); // ??

        // Register our custom configuration provider
        this.cppapi.registerCustomConfigurationProvider(this);

        // Notify the C/C++ extension that the provider is ready to provide custom configurations
        this.cppapi.notifyReady(this);

        // Listen to configuration changes
        //this.disposables.push(main.config.ConfigurationChanged((cfg) => this.updateConfiguration()));

        this.activeProject = null;
        this.processor = new CppProcessor(this.workspace);
        this.enabled = true;
    }

    /**
     * Unregister the C/C++ configuration provider
     * TODO: Need to tell the cppapi that this object is no longer valid?
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
            this.cppapi.didChangeCustomConfiguration(this);
        }
    }

    public async canProvideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<boolean> {
        if (!this.enabled || !this.activeProject) return false;
        if (this.processor.IsActive() == false) return false;
        return true;
      }
    
    
      public async provideBrowseConfiguration(_?: vscode.CancellationToken | undefined): Promise<WorkspaceBrowseConfiguration> {
        //TODO: figure out if we are a Mu project or not?
        const config: WorkspaceBrowseConfiguration = {
          browsePath: ["${workspaceFolder}\\**"],
          standard: 'c11',
        };
        return config;
      }
    
      public async canProvideConfiguration(uri: vscode.Uri, cancel: vscode.CancellationToken | undefined): Promise<boolean> {
        if (!this.enabled || !this.activeProject) return false;

        const fileWp = vscode.workspace.getWorkspaceFolder(uri);
        if (fileWp === undefined || fileWp.index !== this.workspace.index) {
          return false;
        }

        logger.info("CPP_PROVIDER checking if we can provide configuration for ", uri)
    
        //what to do when we can't provide this configurations
        if (this.processor.HasConfigForFile(uri)) return true;
        return false;
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
}
