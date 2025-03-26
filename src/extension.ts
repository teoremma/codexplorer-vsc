import * as vscode from 'vscode';
import { ConfigurationService } from './configuration';
import { CompletionStateManager } from './state/completionState';
import { DecorationFactory } from './ui/decorations';
import { StageManager, Stage } from './state/stageManager';
import { getCompletions } from './commands/getCompletions';
import { requestAlternatives } from './commands/requestAlternatives';
import { useAlternative } from './commands/useAlternative';

export interface CompletionTokenInfo {
    text: string;
    range: vscode.Range;
    entropy: number;
    alternatives: {
        token: string;
        logprob: number;
        completionPreview?: string; // The resulting completion if this token was selected
    }[];
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Codexplorer extension is now active');

    const config = ConfigurationService.getConfig();
    const completionState = CompletionStateManager.getInstance();
    const stageManager = StageManager.getInstance();

    context.subscriptions.push(
        vscode.commands.registerCommand('codexplorer.getCompletion', () => getCompletions(config, completionState, stageManager)),
        vscode.commands.registerCommand('codexplorer.requestAlternatives', () => requestAlternatives(config, completionState, stageManager)),
        vscode.commands.registerCommand('codexplorer.useAlternative', () => useAlternative(config, completionState, stageManager))
    );
}

export function deactivate() {}
