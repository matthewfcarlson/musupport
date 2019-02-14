import { logger } from "../logger";
import * as vscode from 'vscode';
import * as path from 'path';
import { promisifyExists, promisifyGlob, promisifyIsDir, delay } from '../utilities';
import { InfPaser } from "./inf_parser";
import { DecPaser } from "./dec_parser";

/**
 * This class stores the relationship between a given file and the inf
 */
export class InfStore {
    private workspace: vscode.WorkspaceFolder;
    private infs: string[];
    //need some way to keep track of file => inf's
    //
    private scanInProgress = false;
    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
        this.Clear();
    }

    public HasInfForFile(uri: vscode.Uri): boolean {
        logger.info("INF_STORE: Looking for " + uri);
        return false;
    }
    public GetInfForFile(uri: vscode.Uri): vscode.Uri[] {
        let ret = [];

        return ret;
    }

    /**
     * Clears the relationship for a given URI
     * @param uri if not specified, clear all relationships
     */
    public Clear(uri?: vscode.Uri) {
        this.infs = [];
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
        //scan dec files
        const decFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.dec"));
        logger.info("INF_STORE: processing "+decFiles.length+" dec files");
        for (const single_file of decFiles) {
            this.ProcessDec(single_file);
        }

        const infFiles = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.inf"));
        logger.info("INF_STORE: processing "+infFiles.length+" inf files");
        for (const single_file of infFiles) {
            this.ProcessInf(single_file);
        }
        
        logger.info("INF_STORE: Finished Scanning");
        this.scanInProgress = false;

    }
    private async ProcessInf(path: string) {
        //TODO add the data to our store?
        //logger.info("INF_STORE", path);
        //this.infs.push(path);

        const data = await InfPaser.ParseInf(path);
        //logger.info("INFSTORE data", data);
    }
    private async ProcessDec(path: string) {
        //TODO add the data to our store?
        //logger.info("INF_STORE", path);
        //this.decs.push(path);

        const data = await DecPaser.ParseDec(path);
        //logger.info("INFSTORE data", data);
    }

};