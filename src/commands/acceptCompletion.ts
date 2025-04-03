import * as vscode from 'vscode';
import { CompletionStateManager, Stage } from '../state/completionState';

export async function acceptCompletion(
    completionState: CompletionStateManager
) {
    const allowedStages = [Stage.ENTROPY_VIEW];
    if (!completionState.canExecuteInCurrentStage(allowedStages)) {
        vscode.window.showErrorMessage('Cannot accept completion at this time.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    const editorUri = editor.document.uri.toString();

    completionState.setCurrentCompletion(editorUri, { prompt: "", modelID: "", completions: [] });

    completionState.setCurrentStage(Stage.IDLE);

    completionState.clearStage1Decorations();

    vscode.window.showInformationMessage('Completion accepted successfully!');
}