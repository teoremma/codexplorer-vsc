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

    const documentUri = editor.document.uri.toString();
    
    // Check if alternatives are being computed
    if (completionState.areAlternativesInProgress(documentUri)) {
        vscode.window.showInformationMessage('Alternatives are still being generated. Please try again in a moment.');
        return;
    }
    
    // Check if alternatives are ready
    if (!completionState.areAlternativesReady(documentUri)) {
        vscode.window.showInformationMessage('No alternatives available for this completion.');
        return;
    }

    const cursorPosition = editor.selection.active;
    
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

    // New decoration type for alternative tokens with yellow background
    const alternativeTokenDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.15)', // Dim yellow background
    });

    // New decoration type for selected alternative token
    const selectedAlternativeDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 255, 0, 0.15)', // Dim yellow background
        border: '1px solid rgba(188, 188, 188, 0.8)', // Darker border for selected alternative
        borderRadius: '3px'
    });

    // Insert alternatives below the token's line
    const lineNumber = currentToken.range.start.line;
    let insertPosition = new vscode.Position(lineNumber + 1, 0);
    
    // Get the current line text
    const currentLineText = editor.document.lineAt(lineNumber).text;
    
    // Create a preview of what each alternative would generate
    await editor.edit(editBuilder => {
        alternatives.slice(1).forEach((alt, index) => {
            // Create the alternative line by replacing the current token with the alternative
            const alternativeLineText = currentLineText.substring(0, currentToken.range.start.character) +
                alt.token +
                currentLineText.substring(currentToken.range.end.character);
                
            // Insert the alternative line
            editBuilder.insert(insertPosition, alternativeLineText + '\n');
        });
    });

    // Calculate the range of inserted alternatives
    const startLine = lineNumber + 1;
    const endLine = startLine + (alternatives.length - 1) - 1;
    
    // Create a decoration type for the common prefix
    const grayedPrefixDecorationType = vscode.window.createTextEditorDecorationType({
        opacity: '0.5',
        color: '#888888'
    });
    
    // Apply grayed out decoration to common prefixes in alternative lines
    const commonPrefixDecorations = [];
    // New: Create arrays for the alternative tokens with yellow background
    const alternativeTokenDecorations = [];

    for (let i = startLine; i <= endLine; i++) {
        // For common prefix (unchanged)
        const prefixRange = new vscode.Range(
            new vscode.Position(i, 0),
            new vscode.Position(i, currentToken.range.start.character)
        );
        commonPrefixDecorations.push(prefixRange);
        
        // For alternative tokens (with yellow background)
        const tokenRange = new vscode.Range(
            new vscode.Position(i, currentToken.range.start.character),
            new vscode.Position(i, editor.document.lineAt(i).text.length)
        );
        alternativeTokenDecorations.push(tokenRange);
    }

    editor.setDecorations(grayedPrefixDecorationType, commonPrefixDecorations);
    editor.setDecorations(alternativeTokenDecorationType, alternativeTokenDecorations);
    
    // Highlight the current token
    editor.setDecorations(alternativeDecorationType, [currentToken.range]);
    
    // Apply dim decoration to everything except the current line and alternatives section
    const dimmedRanges = [];
    for (let i = 0; i < editor.document.lineCount; i++) {
        if (i !== lineNumber && (i < startLine || i > endLine)) {
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
            grayedPrefixDecorationType.dispose();
            alternativeTokenDecorationType.dispose();
            selectedAlternativeDecorationType.dispose();
            
            // Dispose this event listener
            cleanupDisposable.dispose();
        } else {
            // Update the selected alternative highlight
            const selectedLine = newPosition.line;
            const selectedRange = new vscode.Range(
                new vscode.Position(selectedLine, currentToken.range.start.character),
                new vscode.Position(selectedLine, editor.document.lineAt(selectedLine).text.length)
            );
            
            // Apply the selected decoration
            editor.setDecorations(selectedAlternativeDecorationType, [selectedRange]);
        }
    });
}
