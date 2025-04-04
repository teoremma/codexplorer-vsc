import * as vscode from 'vscode';
import { ConfigurationService } from './configuration';
import { CompletionStateManager, Stage } from './state/completionState';
// import { DecorationFactory } from './ui/decorations';
import { getCompletions } from './commands/getCompletions';
import { acceptCompletion } from './commands/acceptCompletion';
import { dismissCompletion } from './commands/dismissCompletion';
import { requestAlternatives } from './commands/requestAlternatives';
import { useAlternative } from './commands/useAlternative';
import { CompletionCodeLensProvider } from './ui/codeLensProvider';
import { updateSelectionDecoration } from './commands/common';

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
    const codeLensProvider = new CompletionCodeLensProvider(completionState);
    // const stageManager = StageManager.getInstance();

    // Toggle Hover Above setting off
    vscode.workspace.getConfiguration('editor').update('hover.above', false, vscode.ConfigurationTarget.Global);
    vscode.workspace.getConfiguration('editor').update('occurrencesHighlight', "off", vscode.ConfigurationTarget.Global);

    context.subscriptions.push(
        vscode.commands.registerCommand('codexplorer.getCompletion', () => getCompletions(config, completionState)),
        vscode.commands.registerCommand('codexplorer.acceptCompletion', () => acceptCompletion(completionState, codeLensProvider)),
        vscode.commands.registerCommand('codexplorer.dismissCompletion', () => dismissCompletion(completionState)),
        vscode.commands.registerCommand('codexplorer.requestAlternatives', () => requestAlternatives(config, completionState)),
        vscode.commands.registerCommand('codexplorer.useAlternative', () => useAlternative(config, completionState))
    );

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { pattern: '**/*'},
            codeLensProvider,
        )
    );

    // Listen for selection changes to update token selection
    const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
        if (completionState.canExecuteInCurrentStage([Stage.ENTROPY_VIEW])) { // Ensure entropy view is active
            updateSelectionDecoration(completionState);
        }
    });

    context.subscriptions.push(selectionChangeDisposable);
}

export function deactivate() {}
