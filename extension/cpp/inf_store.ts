import { logger } from "../logger";
import * as vscode from 'vscode';
import * as path from 'path';
import { promisifyExists, promisifyGlob, promisifyIsDir, delay } from '../utilities';
import { InfPaser } from "./inf_parser";

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

        logger.info("INF_STORE: Scanning workspace")
        const files = await promisifyGlob(path.join(basePath, "!(Build)", "**", "*.inf"));

        for (const single_file of files) {
            this.ProcessInf(single_file);
        }
        logger.info("INF_STORE: Finished Scanning");
        this.scanInProgress = false;

    }
    private async ProcessInf(path: string) {
        //TODO add the data to our store?
        logger.info("INF_STORE", path);
        this.infs.push(path);

        const data = await InfPaser.ParseInf(path);
        logger.info("INFSTORE data", data);
    }

};