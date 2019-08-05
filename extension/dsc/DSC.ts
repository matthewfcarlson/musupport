import * as vscode from 'vscode';
import { logger } from '../logger';
import { delay } from '../utilities';
import { InfStore } from '../data_store';
import { DscParser } from './parser';
import { createReadStream } from 'fs';

let diagnosticCollection: vscode.DiagnosticCollection;
let workspace: vscode.WorkspaceFolder;

function DscOnCreate(event: vscode.Uri): any {
  logger.info("File was created "+event.toString());
  logger.info(event.toString())
  //TODO: remove all the entries from the diagnostic collection
  let parsing = DscParser.ParseFull(event, workspace.uri);
  //TODO: add errors from parsing to Diagnostics
}



async function DscOnEdit(event: vscode.Uri): Promise<any> {
  logger.info("File was edited "+event.toString());
  //TODO: remove all the entries from the diagnostic collection
  logger.info(event.toString())
  let parsing = await DscParser.ParseFull(event, workspace.uri);
  //logger.info("Parsing:", parsing);
  //logger.info("Errors:", parsing.errors);
  logger.info("Found "+parsing.errors.length +" errors");
  //TODO clear existing errors for this uri
  diagnosticCollection.delete(event);
  let newErrors:Map<vscode.Uri, vscode.Diagnostic[]> = new Map();
  for (const error of parsing.errors) {
    let severity: vscode.DiagnosticSeverity = (error.isFatal)?vscode.DiagnosticSeverity.Error:vscode.DiagnosticSeverity.Warning;
    let lineNo = error.source.lineno - 1;
    let col = error.source.column - 1;
    let col_end = col + error.code_text.length;
    if (lineNo < 0) lineNo = 0;
    if (col < 0) col = 0;
    if (col_end < 0) col_end = 0;
    let start: vscode.Position = new vscode.Position(lineNo, col);
    let end = start.translate(0,error.code_text.length)
    let range: vscode.Range = new vscode.Range(start,end)
    let uri = error.source.uri;

    let newError:vscode.Diagnostic = {
      severity: severity,
      message: error.error_msg,
      range: range,
      code: error.code_text,
    };
    if (!newErrors.has(uri)) newErrors.set(uri, []);
    //TODO use error.source.uri to add to the list of sources
    newErrors.get(uri).push(newError);
    logger.warn(error.toString());
  }
  for (const error_item of newErrors){
    let error_uri = error_item[0];
    let error_list = error_item[1];
    diagnosticCollection.set(error_uri, error_list);
  }
}

function DscOnDelete(event: vscode.Uri): any {
  logger.info("File was deleted "+event.toString());
  logger.info(event.toString())
  //TODO: remove all the entries from the diagnostic collection
}

export function activate(ctx: vscode.ExtensionContext, ws:vscode.WorkspaceFolder): void {

  let documentSelector =  { language: 'dsc' };
  let completionProvider = vscode.languages.registerCompletionItemProvider(
    documentSelector, new DscCompletionItemProvider(), '.', '\"', "[", "|");
  
  workspace = ws;
  diagnosticCollection = vscode.languages.createDiagnosticCollection('dsc');
  ctx.subscriptions.push(diagnosticCollection);
  ctx.subscriptions.push(completionProvider);

  let dsc_watcher = vscode.workspace.createFileSystemWatcher("**/*.dsc");
  ctx.subscriptions.push(dsc_watcher);
  dsc_watcher.onDidCreate(DscOnCreate);
  dsc_watcher.onDidChange(DscOnEdit);
  dsc_watcher.onDidDelete(DscOnDelete);
  logger.info('Registering diagnostic collection');

  //TODO find all the 
}

class DscCompletionItemProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):Thenable<vscode.CompletionItem[]> {
    //TODO figure out what we're being triggered to do
    logger.info("Being asked to complete the document at "+ position.line +":" + position.character);
    let completions:vscode.CompletionItem[] = [];
    logger.warn("The range we got was undefined");
    let start = new vscode.Position(position.line, 0)
    let end = new vscode.Position(position.line+1, 0)
    let text_range = new vscode.Range(start, end);    
    let valid_range = document.validateRange(text_range);
    let text = document.getText(valid_range).trim();
    logger.info("Text we care about: "+ text);
    if (text.indexOf("|") != -1){
      let parts = text.split("|");
      let front = parts.shift();
      logger.info("We're looking for a library class that corresponds to "+front);
      //TODO offer better weight to classes that match this library name?
      text = parts.pop();
      const infStore = InfStore.GetStore();
      if (infStore != null){
        const maybe_matches = InfStore.GetStore().GetPossibleParitalMatches(text);

        for(const possible_match of maybe_matches){
          //logger.info("A possible match would be "+possible_match);
          completions.push(new vscode.CompletionItem(possible_match, vscode.CompletionItemKind.File));
        }
      }
    }
    // If we need to suggest the beginning of a section
    else if (text.startsWith("[") && text.indexOf(".") == -1) {
      //Get all the possible sections we could offer
      let sections = DscParser.GetPossibleSections();
      for (const section of sections) {
        completions.push(new vscode.CompletionItem(section, vscode.CompletionItemKind.Enum));
      }
    }
    

    return Promise.resolve(completions);
  }
}

