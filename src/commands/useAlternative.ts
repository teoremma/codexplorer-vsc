import * as vscode from 'vscode';
import { CompletionStateManager } from '../state/completionState';

export async function useAlternative(params: { lineNumber: number, alternativeIndex: number }, completionState) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const { lineNumber, alternativeIndex } = params;
    const completionLine = completionState.getCompletionLines(editor.document.uri.toString()).find(cl => cl.lineNumber === lineNumber);
    
    if (!completionLine || alternativeIndex >= completionLine.alternatives.length) return;
    
    const alternative = completionLine.alternatives[alternativeIndex].text;
    const line = editor.document.lineAt(lineNumber);
    
    editor.edit(editBuilder => {
        editBuilder.replace(line.range, alternative);
    });
    
    vscode.window.showInformationMessage(`Alternative code applied`);
}
