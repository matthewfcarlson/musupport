import * as vscode from 'vscode';
import { logger } from '../logger';
import { delay } from '../utilities';
import { InfStore } from '../cpp/data_store';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {

  let documentSelector =  { language: 'dsc' };
  let completionProvider = vscode.languages.registerCompletionItemProvider(
    documentSelector, new DscCompletionItemProvider(), '.', '\"', "[", "|")
  
  diagnosticCollection = vscode.languages.createDiagnosticCollection('dsc');
  ctx.subscriptions.push(diagnosticCollection);
  ctx.subscriptions.push(completionProvider);

  logger.info('Registering diagnostic collection');
}

class DscCompletionItemProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken):Thenable<vscode.CompletionItem[]> {
    //
    logger.info("Being asked to complete the document at "+ position.line +":" + position.character);
    let completions:vscode.CompletionItem[] = [];
    let text_range = document.getWordRangeAtPosition(position);
    if (text_range == undefined){
      logger.warn("The range we got was undefined");
      let start = new vscode.Position(position.line, 0)
      let end = new vscode.Position(position.line+1, 0)
      text_range = new vscode.Range(start, end);
    }
    let valid_range = document.validateRange(text_range);
    let text = document.getText(valid_range);
    logger.info("Text we care about: "+ text);
    if (text.indexOf("|") != -1){
      let parts = text.split("|");
      let front = parts.shift();
      logger.info("We're looking for a library class that corresponds to "+front);
      //TODO offer better weight to classes that match this library name?
      text = parts.pop();
    }

    const maybe_matches = InfStore.GetStore().GetPossibleParitalMatches(text);

    for(const possible_match of maybe_matches){
      completions.push(new vscode.CompletionItem(possible_match, vscode.CompletionItemKind.Reference));
    }

    return Promise.resolve(completions);
  }
}

