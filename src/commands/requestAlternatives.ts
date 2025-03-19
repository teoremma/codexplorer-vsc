import * as vscode from 'vscode';
import { DecorationFactory } from '../ui/decorations';
import { CompletionStateManager } from '../state/completionState';
import { StageManager, Stage } from '../state/stageManager';

export async function requestAlternatives(completionState, stageManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    const cursorPosition = editor.selection.active;
    const currentLineNumber = cursorPosition.line;

    // Find if the current line has alternatives
    const currentLine = completionState.getCompletionLines(editor.document.uri.toString()).find(cl => cl.lineNumber === currentLineNumber);

    if (!currentLine || currentLine.alternatives.length === 0) {
        vscode.window.showInformationMessage('No alternatives available for this line.');
        return;
    }

    // Create decoration types
    const alternativeDecorationType = DecorationFactory.createAlternativeDecoration();
    const dimmedDecorationType = vscode.window.createTextEditorDecorationType({
        opacity: '0.5' // Reduced opacity for non-focused lines
    });

    // Create a decoration type for the current cursor position
    const currentLineDecorationType = vscode.window.createTextEditorDecorationType({
        border: '2px solid rgb(181, 181, 181)',
        borderRadius: '3px'
    });

    // Insert alternatives below the current line
    let insertPosition = new vscode.Position(currentLineNumber + 1, 0);

    await editor.edit(editBuilder => {
        currentLine.alternatives.forEach(alt => {
            editBuilder.insert(insertPosition, alt.text + '\n');
        });
    });

    // Calculate the range of inserted alternatives
    const startLine = currentLineNumber + 1;
    const endLine = startLine + currentLine.alternatives.length - 1;

    // Apply decorations
    const alternativeRanges: vscode.Range[] = [];
    const dimmedRanges: vscode.Range[] = [];

    // Collect ranges for all lines in the document
    for (let i = 0; i < editor.document.lineCount; i++) {
        const lineRange = editor.document.lineAt(i).range;
        
        if (i >= startLine && i <= endLine) {
            // This is an alternative line - highlight it
            alternativeRanges.push(lineRange);
        } else if (i !== currentLineNumber) {
            // This is not the current line or an alternative - dim it
            dimmedRanges.push(lineRange);
        }
    }

    // Apply decorations
    editor.setDecorations(alternativeDecorationType, alternativeRanges);
    editor.setDecorations(dimmedDecorationType, dimmedRanges);

    // Show information message
    vscode.window.showInformationMessage(`Displaying ${currentLine.alternatives.length} alternatives.`);

    // Set up cleanup when selection changes
    const cleanupDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
        // Check if cursor moved away from alternatives area
        const newPosition = editor.selection.active;
        const newLine = newPosition.line;
        const isInAlternativesArea = (newLine >= startLine && newLine <= endLine) || 
                                     newLine === currentLineNumber;
        
        // If cursor is in alternatives area, add border to the current line
        if (isInAlternativesArea && newLine >= startLine && newLine <= endLine) {
            const currentLineRange = editor.document.lineAt(newLine).range;
            editor.setDecorations(currentLineDecorationType, [currentLineRange]);
        } else {
            // Clear the current line decoration
            editor.setDecorations(currentLineDecorationType, []);
        }
        
        if (!isInAlternativesArea) {
            // Clean up alternatives and decorations
            editor.edit(editBuilder => {
                const deleteRange = new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(endLine + 1, 0)
                );
                editBuilder.delete(deleteRange);
            });
            
            // Dispose decorations
            alternativeDecorationType.dispose();
            dimmedDecorationType.dispose();
            currentLineDecorationType.dispose();
            
            // Dispose this event listener
            cleanupDisposable.dispose();
        }
    });
}
