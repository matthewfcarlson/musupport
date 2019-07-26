import * as vscode from 'vscode';
import { logger } from '../logger';
import { delay } from '../utilities';
import { InfStore } from '../data_store';
import { DscParser } from './parser';

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

