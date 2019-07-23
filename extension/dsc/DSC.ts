import * as vscode from 'vscode';
import { logger } from '../logger';

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(ctx: vscode.ExtensionContext): void {
  
  diagnosticCollection = vscode.languages.createDiagnosticCollection('dsc');
  ctx.subscriptions.push(diagnosticCollection);

  logger.info('Registering diagnostic collection');
}
