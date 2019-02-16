import { logger, setLoggerDirectory } from "../logger";
import * as vscode from 'vscode';
import * as path from 'path';
import { promisifyExists, promisifyGlob, promisifyIsDir, delay, getPackageFromPath } from '../utilities';
import { InfPaser } from "./parsers/inf_parser";
import { DecPaser } from "./parsers/dec_parser";
import { ExceptionHandler } from "winston";
import { InfData, DecData } from "./types";
import { PathLike } from "fs";

/**
 * This class stores the relationship between a given file and the inf
 */
export class InfStore {
    private workspace: vscode.WorkspaceFolder;
    private infs: Map<string, InfData>;
    //this keeps track of an inf(value) for the source file (key)
    private infsForSource: Map<string, InfData[]>;
    //need some way to keep track of file => inf's
    //
    private scanInProgress = false;
    constructor(workspace: vscode.WorkspaceFolder) {
        this.infs = new Map();
        this.infsForSource = new Map();
        this.workspace = workspace;
        this.Clear();
    }

    public HasInfForFile(uri: vscode.Uri): boolean {
        logger.info("INF_STORE: Looking for " + uri.fsPath);
        const found = this.infsForSource.has(uri.fsPath);

        if (found) logger.info("INF_STORE: found");

        return found;
    }
    public GetInfsForFile(uri: vscode.Uri): InfData[] {
        if (!this.HasInfForFile(uri)) return [];
        const data = this.infsForSource.get(uri.fsPath);
        return data;
    }

    /**
     * Clears the relationship for a given URI
     * @param uri if not specified, clear all relationships
     */
    public Clear(uri?: vscode.Uri) {
        logger.info("INF_STORE Clearing data");
        if (uri) {
            logger.error("INF_STORE clearing for specific URI is not supported")
        }
        else {
            this.infs.clear();
            this.infsForSource.clear();
        }
    }

    private async WaitForScanToFinish() {
        logger.info("INF_STORE: Waiting for scan to finish");
        var waitTimer = 50;
        while (this.scanInProgress) { //busy loop
            await delay(waitTimer);
            waitTimer *= 1.4; //increase the wait timer each time
        }
    }

    public async Scan(uri?: vscode.Uri) {
        if (this.scanInProgress) await this.WaitForScanToFinish();
        this.scanInProgress = true;
        //TODO make sure that the uri isn't a file (make sure it is a directory)
        const basePath = (uri) ? uri.fsPath : this.workspace.uri.fsPath;

        logger.info("INF_STORE: Scanning workspace ")

        const infFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.inf"));
        logger.info("INF_STORE: processing " + infFiles.length + " inf files");

        //keep track of all the calls we've made
        const asyncCalls = [];
        for (const single_file of infFiles) {
            asyncCalls.push(this.ProcessInf(single_file));
        }
        await Promise.all(asyncCalls);

        logger.info("INF_STORE: Finished Scanning");
        this.scanInProgress = false;

    }
    private async ProcessInf(path: string): Promise<void> {
        //keep track of the INF
        const data = await InfPaser.ParseInf(path);
        for (const source of data.sources) {
            if (!this.infsForSource.has(source)) this.infsForSource.set(source, []);
            this.infsForSource.get(source).unshift(data);
        }
        if (!this.infs.has(path)) this.infs.set(path, data);


        //logger.info("INFSTORE data", data);
    }


};

export class DecStore {

    private workspace: vscode.WorkspaceFolder;
    private scanInProgress = false;
    private decs: Map<string, DecData[]>;

    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
        this.decs = new Map();
        this.Clear();
    }

    /**
     * Finds
     * @param path takes a package path like MdePkg/MdePkg.dec
     */
    public GetDataForFile(filepath: string): DecData[] {
        filepath = path.normalize(filepath);
        if (!this.decs.has(filepath)) return [];
        const data = this.decs.get(filepath);
        return data;
    }

    /**
    * Clears the relationship for a given URI
    * @param uri if not specified, clear all relationships
    */
    public Clear(uri?: string) {
        if (uri) {
            logger.error("DEC_STORE clearing for specific URI is not supported")
        }
        else {
            this.decs.clear();
        }
    }



    private async WaitForScanToFinish() {
        logger.info("DEC_STORE: Waiting for scan to finish");
        var waitTimer = 50;
        while (this.scanInProgress) { //busy loop
            await delay(waitTimer);
            waitTimer *= 1.4; //increase the wait timer each time
        }
    }

    public async Scan(uri?: vscode.Uri) {
        if (this.scanInProgress) await this.WaitForScanToFinish();
        this.scanInProgress = true;
        //TODO make sure that the uri isn't a file (make sure it is a directory)
        const basePath = (uri) ? uri.fsPath : this.workspace.uri.fsPath;

        logger.info("DEC_STORE: Scanning workspace ")

        //scan dec files
        const decFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.dec"));
        logger.info("DEC_STORE: processing " + decFiles.length + " dec files");
        for (const single_file of decFiles) {
            this.ProcessDec(single_file);
        }
        logger.info("DEC_STORE: Finished Scanning");
        this.scanInProgress = false;

    }

    private async ProcessDec(decpath: string) {
        decpath = path.normalize(decpath);
        const data = await DecPaser.ParseDec(decpath);
        const decFileName = path.basename(decpath);
        const packageName = getPackageFromPath(decpath);
        const packagePath = path.join(packageName,decFileName);
        // check to make sure it's a valid package name
        if (packageName) {
            if (!this.decs.has(packagePath)) this.decs.set(packagePath, []);
            this.decs.get(packagePath).unshift(data);
        }
        else {
            logger.error("DEC_STORE unable to process package name for " + path)
        }
    }


}

export class PackageStore {
    public static async GetDevicePackages(root: vscode.Uri): Promise<string[]> {
        const basePath = root.fsPath;
        var data = new Set<string>();

        logger.info("PACKAGE_STORE: Scanning workspace ")

        //scan dec files
        const decFiles = await promisifyGlob(path.join(basePath, "**", "PlatformPkg.dsc"));
        for (const single_file of decFiles) {
            const single_dir = path.dirname(single_file);
            const packageName = path.basename(single_dir);
            data.add(packageName);
        }

        const listData = Array.from(data);

        return listData;
    }
}