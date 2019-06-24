/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as utils from '../utilities';

/**
 * Represents the contents of c_cpp_properties.json
 * Copied from https://github.com/Microsoft/vscode-cpptools/blob/HEAD/Extension/src/LanguageServer/configurations.ts
 * Note: Currently this extension writes a c_cpp_properties.json file to the workspace folder, to be read by cpptools.
 * This is a temporary solution until "Add browse.path API for CustomConfigurationProviders #2237"
 * and "Add a "isReady" method to CppToolsApi #2350" are in place.
 */
export interface ConfigurationJson {
    configurations: Configuration[];
    env?: {[key: string]: string | string[]};
    version: number;
}

/**
 * Represents the contents of a 'configuration' object in c_cpp_properties.json
 * Copied from https://github.com/Microsoft/vscode-cpptools/blob/HEAD/Extension/src/LanguageServer/configurations.ts
 */
export interface Configuration {
    name: string;
    compilerPath?: string;
    cStandard?: string;
    cppStandard?: string;
    includePath?: string[];
    macFrameworkPath?: string[];
    windowsSdkVersion?: string;
    defines?: string[];
    intelliSenseMode?: string;
    compileCommands?: string;
    forcedInclude?: string[];
    configurationProvider?: string;
    browse: Browse;
}

/**
 * The Browse configurations
 * Copied from https://github.com/Microsoft/vscode-cpptools/blob/HEAD/Extension/src/LanguageServer/configurations.ts
 */
export interface Browse {
    path?: string[];
    limitSymbolsToIncludedHeaders?: boolean | string;
    databaseFilename?: string;
}

/**
 * Compiler default configurations
 * Copied from https://github.com/Microsoft/vscode-cpptools/blob/HEAD/Extension/src/LanguageServer/configurations.ts
 */
export interface CompilerDefaults {
    compilerPath: string;
    cStandard: string;
    cppStandard: string;
    includes: string[];
    frameworks: string[];
    windowsSdkVersion: string;
    intelliSenseMode: string;
}

/**
 * A utility class to manage the c_cpp_properties.json file.
 * Note: Currently this extension writes a c_cpp_properties.json file to the workspace folder, to be read by cpptools.
 * This is a temporary solution until "Add browse.path API for CustomConfigurationProviders #2237"
 * and "Add a "isReady" method to CppToolsApi #2350" are in place.
 */
export class CCppProperties {
    /**
     * The version of the c_cpp_properties.json file
     */
    private static readonly configVersion: number = 4;

    /**
     * The default c_cpp_properties configuration
     */
    private static readonly defaultConfiguration: Configuration = {
        name: "UEFI",
        compilerPath: "", // Set to empty string so we don't pick up default Visual Studio installed headers
        includePath: [], // Set to empty to override default includes
        defines: [], // Set to empty to override default defines
        browse: {
            path: [], // Set this to empty so the tag parser won't try to hydrate the workspace
            limitSymbolsToIncludedHeaders: true, // This keeps the intellisense scope limited to just the files that are relevant
            databaseFilename: "${workspaceFolder}/.vscode/" // Store database files in .vscode folder
        },
        configurationProvider: utils.extension.id // Specify this extension as the config provider, so users won't be prompted to allow this
    };

    /**
     * Writes the default c_cpp_properties.json for the workspace folder if one does not already exist.
     * @param workspaceFolder The URI of the workspace folder.
     */
    public static writeDefaultCCppPropertiesJsonIfNotExist(workspaceFolder: vscode.Uri): void {
        const dotVsCodeFolder: string = path.join(workspaceFolder.fsPath, ".vscode");
        if (!fs.existsSync(dotVsCodeFolder)) {
            fs.mkdirSync(dotVsCodeFolder);
        }

        if (!fs.existsSync(CCppProperties.getPropertiesJsonPath(workspaceFolder.fsPath))) {
            CCppProperties.writeCCppPropertiesJson(CCppProperties.defaultConfiguration, workspaceFolder.fsPath);
        }
    }

    /**
     * Writes the contents of @param configurationJson to a c_cpp_properties.json file in the
     * the .vscode directory of the workspace folder.
     * @param configuration The contents of the c_cpp_properties.json file
     * @param workspaceFolder The URI of the workspace folder
     */
    public static writeCCppPropertiesJson(configuration: Configuration, workspaceFolder: string): void {
        const configurationJson: ConfigurationJson = {
            configurations: [
                configuration
            ],
            version: CCppProperties.configVersion
        };

        fs.writeFileSync(CCppProperties.getPropertiesJsonPath(workspaceFolder), CCppProperties.stringify(configurationJson));
    }

    /**
     * Returns default @see ConfigurationJson object.
     */
    public static getDefaultCppConfiguration(): Configuration {
        // Return a deep-copy of CCppProperties.defaultConfiguration so that changing its properties will not affect
        // the properties of CCppProperties.defaultConfiguration.
        return {
            name: CCppProperties.defaultConfiguration.name,
            compilerPath: CCppProperties.defaultConfiguration.compilerPath,
            includePath: CCppProperties.defaultConfiguration.includePath,
            defines: CCppProperties.defaultConfiguration.defines,
            browse: {
                path: CCppProperties.defaultConfiguration.browse.path,
                limitSymbolsToIncludedHeaders: CCppProperties.defaultConfiguration.browse.limitSymbolsToIncludedHeaders,
                databaseFilename: CCppProperties.defaultConfiguration.browse.databaseFilename
            },
            configurationProvider: CCppProperties.defaultConfiguration.configurationProvider
        };
    }

    /**
     * Gets the absolute path to the c_cpp_properties.json file for the @param workspaceFolder
     * @param workspaceFolder The URI of the workspace folder.
     */
    private static getPropertiesJsonPath(workspaceFolder: string): string {
        return path.join(workspaceFolder, ".vscode", "c_cpp_properties.json");
    }

    /**
     * Returns the formated string version of the @param configurationJson.
     * @param configurationJson The @see ConfigurationJson to stringify.
     */
    private static stringify(configurationJson: ConfigurationJson): string {
        // Stringify with 4-space intentation, the same way that cpptools does.
        // See https://github.com/Microsoft/vscode-cpptools/blob/HEAD/Extension/src/LanguageServer/configurations.ts
        return JSON.stringify(
            /**/ configurationJson,
            /*replacer*/ null,
            /*space*/ 4);
    }
}
