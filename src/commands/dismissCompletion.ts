import * as vscode from 'vscode';
import { CompletionStateManager, Stage } from '../state/completionState';

export async function dismissCompletion(
    completionState: CompletionStateManager
) {
    const allowedStages = [Stage.ENTROPY_VIEW];
    if (!completionState.canExecuteInCurrentStage(allowedStages)) {
        vscode.window.showErrorMessage('Cannot dismiss completion at this time.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    const editorUri = editor.document.uri.toString();

    // Clear the current completion
    completionState.setCurrentCompletion(editorUri, { prompt: "", modelID: "", completions: [] });

    completionState.setCurrentStage(Stage.IDLE);

    // Clear any existing decorations
    completionState.clearStage1Decorations();

    // Clear the editor content and reinsert the original content
    const originalContent = completionState.getOriginalContent();
    await editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(editor.document.getText().length)
        ));
        editBuilder.insert(editor.document.positionAt(0), originalContent);
    });


    // Show a message to the user
    vscode.window.showInformationMessage('Completion dismissed successfully!');
}