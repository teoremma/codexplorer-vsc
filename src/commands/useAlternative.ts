import * as vscode from 'vscode';
import { CompletionStateManager } from '../state/completionState';

export async function useAlternative(params: { tokenIndex: number, alternativeIndex: number }, completionState) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const { tokenIndex, alternativeIndex } = params;
    const tokens = completionState.getCompletionTokens(editor.document.uri.toString());
    
    if (tokenIndex < 0 || tokenIndex >= tokens.length) return;
    
    const token = tokens[tokenIndex];
    if (alternativeIndex >= token.alternatives.length) return;
    
    const alternative = token.alternatives[alternativeIndex].token;
    
    editor.edit(editBuilder => {
        editBuilder.replace(token.range, alternative);
    });
    
    vscode.window.showInformationMessage(`Alternative token applied`);
}
