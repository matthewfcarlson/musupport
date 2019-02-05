import { logger } from "../logger";
import * as vscode from 'vscode';
import * as path from 'path';
import { promisifyReadDir, promisifyExists, promisifyGlob, promisifyIsDir, promisifyReadFile } from '../utilities';
import { runInContext } from "vm";

export class InfStore {
    private workspace: vscode.WorkspaceFolder;
    constructor(workspace: vscode.WorkspaceFolder) {
        this.workspace = workspace;
    }

    public HasInfForFile(uri: vscode.Uri): boolean {
        logger.info("INF_STORE: Looking for "+uri);
        return false;
    }
    public GetInfForFile(uri: vscode.Uri): vscode.Uri[] {
        let ret = [];

        return ret;
    }

    public Clear(uri?:vscode.Uri){

    }

    public async Scan(uri?:vscode.Uri){
        //TODO make sure that the uri isn't a file (make sure it is a directory)
        const basePath = (uri)?uri.fsPath: this.workspace.uri.fsPath;
        
        logger.info("INF_STORE: Scanning workspace")
        const files = await promisifyGlob(path.join(basePath, "**", "*.inf"));

        for (const single_file of files) {
            logger.info(single_file);
            this.ProcessInf(single_file);
        }
          
    }
    private async ProcessInf(path:string){
        InfParser.
    }

};