import * as vscode from 'vscode';
import { ConfigurationService } from './configuration';
import { CompletionStateManager, Stage } from './state/completionState';
// import { DecorationFactory } from './ui/decorations';
import { getCompletions } from './commands/getCompletions';
import { acceptCompletion } from './commands/acceptCompletion';
import { dismissCompletion } from './commands/dismissCompletion';
import { requestAlternatives } from './commands/requestAlternatives';
import { useAlternative } from './commands/useAlternative';
import { gotoPreviousCompletion, gotoNextCompletion } from './commands/history';
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

    // Set up click logic for detecting double clicks
    const CLICK_DELAY = 300;
    let lastClickTime = 0;
    let lastClickPosition: number | null = null;
    // const stageManager = StageManager.getInstance();

    // Toggle Hover Above setting off
    vscode.workspace.getConfiguration('editor').update('hover.above', false, vscode.ConfigurationTarget.Global);
    vscode.workspace.getConfiguration('editor').update('occurrencesHighlight', "off", vscode.ConfigurationTarget.Global);

    context.subscriptions.push(
        vscode.commands.registerCommand('codexplorer.getCompletion', () => getCompletions(config, completionState)),
        vscode.commands.registerCommand('codexplorer.acceptCompletion', () => acceptCompletion(completionState, codeLensProvider)),
        vscode.commands.registerCommand('codexplorer.dismissCompletion', () => dismissCompletion(completionState)),
        vscode.commands.registerCommand('codexplorer.requestAlternatives', () => requestAlternatives(config, completionState)),
        vscode.commands.registerCommand('codexplorer.useAlternative', () => useAlternative(config, completionState)),
        vscode.commands.registerCommand('codexplorer.gotoPreviousCompletion', () => gotoPreviousCompletion(completionState)),
        vscode.commands.registerCommand('codexplorer.gotoNextCompletion', () => gotoNextCompletion(completionState))
    );

    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { pattern: '**/*'},
            codeLensProvider,
        )
    );

    // Listen for selection changes to update token selection, open the alternatives view 'on click', and use an alternative 'on double click'
    const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        if (completionState.canExecuteInCurrentStage([Stage.ENTROPY_VIEW])) { // Ensure entropy view is active
            const tokenRanges = completionState.getCurrentTokenRanges(editor.document.uri.toString());
            const position = editor.selection.active;
            // Check if a token was clicked
            if (tokenRanges.some(range => range.contains(position)) && event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                requestAlternatives(config, completionState);
            }
            updateSelectionDecoration(completionState);
        }
        else if (completionState.canExecuteInCurrentStage([Stage.ALTERNATIVES_VIEW])) {
            const currentTime = Date.now();

            const position = editor.selection.active;
            const currentLine = position.line;
            const tokenRanges = completionState.getCurrentTokenRanges(editor.document.uri.toString());
            const currentCompletions = completionState.getCurrentCompletion(editor.document.uri.toString());

            const tokenIndex = completionState.getCurrentAltsTokenIndex(editor.document.uri.toString());
            const alternativeCount = currentCompletions.completions[0].steps[tokenIndex].top_logprobs.length;
            const originalTokenLine = tokenRanges[tokenIndex].start.line;

            // Check if an alternative line was clicked
            if ((currentLine > originalTokenLine) && (currentLine < originalTokenLine + alternativeCount) && event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
                // Check if the line was double-clicked
                if (currentTime - lastClickTime < CLICK_DELAY && lastClickPosition !== null && lastClickPosition === currentLine) {
                    useAlternative(config, completionState);
                }
                lastClickTime = currentTime;
                lastClickPosition = currentLine;
            }
        }
    });

    context.subscriptions.push(selectionChangeDisposable);
}

export function deactivate() {}
