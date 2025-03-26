import * as vscode from 'vscode';
import { CompletionStateManager } from '../state/completionState';
import { StageManager } from '../state/stageManager';
import { ConfigurationService } from '../configuration';
import * as lib from '../lib';
import { updateCurrentCompletion } from './common';

export async function useAlternative(
    config: ReturnType<typeof ConfigurationService.getConfig>,
    completionState: CompletionStateManager, 
    stageManager: StageManager
) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    const documentUri = editor.document.uri.toString();
    const currentPosition = editor.selection.active;
    const currentLine = currentPosition.line;
    
    // Get the original token index and range
    // const originalTokens = completionState.getCompletionTokens(documentUri);
    const originalTokenRanges = completionState.getCurrentTokenRanges(documentUri);
    const currentCompletions = completionState.getCurrentCompletion(documentUri);
    
    // Get the original token index from the current cursor position
    const originalCursorPosition = editor.selection.active;
    // const tokenIndex = completionState.getTokenIndexAtPosition(documentUri, originalCursorPosition);
    const tokenIndex = completionState.getCurrentAltsTokenIndex(documentUri);
    
    if (tokenIndex < 0) {
        vscode.window.showErrorMessage('No token found at cursor position.');
        return;
    }
    
    // Find the original token line (where alternatives were generated from)
    const originalTokenLine = originalTokenRanges[tokenIndex].start.line;
    
    // If cursor is on original token line, we're not selecting an alternative
    if (currentLine === originalTokenLine) {
        vscode.window.showInformationMessage('Please select an alternative below the original line.');
        return;
    }
    
    // Calculate alternative index based on line difference
    const alternativeIndex = currentLine - originalTokenLine;
    
    if (alternativeIndex <= 0 || alternativeIndex >= currentCompletions.completions[0].steps[tokenIndex].top_logprobs.length) {
        vscode.window.showErrorMessage('Invalid alternative selection.');
        return;
    }
    
    // Get the selected alternative token
    const alternativeToken = currentCompletions.completions[0].steps[tokenIndex].top_logprobs[alternativeIndex].token;
    
    // Show that we're processing
    vscode.window.showInformationMessage(`Applying alternative token "${alternativeToken}"...`);
    
    try {
        // First, clean up the alternatives display by deleting all alternative lines
        const startLine = originalTokenLine + 1;
        const endLine = startLine + (currentCompletions.completions[0].steps[tokenIndex].top_logprobs.length - 1) - 1;
        
        await editor.edit(editBuilder => {
            const deleteRange = new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine + 1, 0)
            );
            editBuilder.delete(deleteRange);
        });
        
        // Clear all decorations
        completionState.clearTokenDecorations(documentUri);
        
        // Resample the completion with the new token
        const resampledCompletion = await lib.resampleAtToken(
            currentCompletions,
            alternativeToken,
            tokenIndex,
            config.maxTokens,
            config.apiKey
        );
        
        // Update the completion with the new resampled result
        await updateCurrentCompletion(resampledCompletion, completionState);
        
        vscode.window.showInformationMessage(`Alternative token "${alternativeToken}" applied successfully!`);
    } catch (error) {
        console.error('Error applying alternative:', error);
        if (error instanceof Error) {
            vscode.window.showErrorMessage(`Failed to apply alternative: ${error.message}`);
        }
        
        // // Restore the original token decorations as fallback
        // completionState.restoreTokenDecorationState(documentUri);
    }
}
