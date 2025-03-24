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
    const documentUri = editor.document.uri.toString();
    
    // Find the token at the current cursor position
    const currentToken = completionState.getTokenAtPosition(documentUri, cursorPosition);
    
    if (!currentToken || currentToken.alternatives.length <= 1) {
        vscode.window.showInformationMessage('No alternatives available for this token.');
        return;
    }

    // Get alternatives for the token
    const alternatives = currentToken.alternatives;
    
    // Create decoration types
    const alternativeDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.3)', // Yellow highlighting
        border: '1px solid rgba(0, 0, 0, 0.3)',
        borderRadius: '3px'
    });
    
    const dimmedDecorationType = vscode.window.createTextEditorDecorationType({
        opacity: '0.5' // Reduced opacity for non-focused lines
    });

    // Insert alternatives below the token's line
    const lineNumber = currentToken.range.start.line;
    let insertPosition = new vscode.Position(lineNumber + 1, 0);
    
    // Create a preview of what each alternative would generate
    await editor.edit(editBuilder => {
        alternatives.slice(1).forEach((alt, index) => {
            const previewText = `Alternative ${index+1}: "${alt.token}" (log probability: ${alt.logprob.toFixed(2)})`;
            editBuilder.insert(insertPosition, previewText + '\n');
            
            // If we have a preview of the completion, add it
            if (alt.completionPreview) {
                editBuilder.insert(
                    new vscode.Position(insertPosition.line + 1, 0),
                    '  ' + alt.completionPreview + '\n'
                );
            }
        });
    });

    // Calculate the range of inserted alternatives
    const startLine = lineNumber + 1;
    const endLine = startLine + (alternatives.length - 1) * 2 - 1;
    
    // Highlight the current token
    editor.setDecorations(alternativeDecorationType, [currentToken.range]);
    
    // Apply dim decoration to everything except the alternatives section
    const dimmedRanges = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
        if (i < startLine || i > endLine) {
            dimmedRanges.push(editor.document.lineAt(i).range);
        }
    }
    editor.setDecorations(dimmedDecorationType, dimmedRanges);
    
    // Show information message
    vscode.window.showInformationMessage(`Displaying ${alternatives.length-1} alternative tokens.`);
    
    // Set up cleanup when selection changes
    const cleanupDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
        // Check if cursor moved away from alternatives area
        const newPosition = editor.selection.active;
        const newLine = newPosition.line;
        const isInAlternativesArea = (newLine >= startLine && newLine <= endLine);
        
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
            
            // Dispose this event listener
            cleanupDisposable.dispose();
        }
    });
}
