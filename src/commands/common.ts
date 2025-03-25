import * as vscode from 'vscode';
import * as lib from '../lib';
import { CompletionStateManager } from '../state/completionState';
import { CompletionTokenInfo } from '../extension';

export async function updateCurrentCompletion(
    completionData: lib.ProviderCompletions,
    completionState: CompletionStateManager,
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }
    const editorUri = editor.document.uri.toString();

    const document = editor.document;

    completionState.setCurrentCompletion(editorUri, completionData);

    const completionText = completionData.completions[0].text;

    if (!completionText.trim()) {
        vscode.window.showInformationMessage('No completion received.');
        return;
    }

    // Insert the completion at the end of the document
    const originalContent = completionState.getOriginalContent();
    
    // Remove previous content and decorations
    const existingTokenDecorationTypes = completionState.getTokenDecorationTypes(editorUri);
    existingTokenDecorationTypes.forEach(decorationType => {
        decorationType.dispose();
    });
    await editor.edit(editBuilder => {
        editBuilder.delete(new vscode.Range(
            document.positionAt(originalContent.length),
            document.positionAt(document.getText().length)
        ));
    });

    let completionStartPosition = document.positionAt(originalContent.length);

    // Insert the completion at the cursor position
    await editor.edit(editBuilder => {
        editBuilder.insert(completionStartPosition, completionText);
    });
    
    vscode.window.showInformationMessage('Completion inserted successfully!');
    
    completionState.setAlternativesReady(editorUri, true);
                
    // Add this to the getCompletions function
    const tokenDecorationTypes: vscode.TextEditorDecorationType[] = [];
    const tokenDecorations: Map<number, vscode.Range[]> = new Map();
    const completionTokens: CompletionTokenInfo[] = [];
    const tokenRanges: vscode.Range[] = [];

    if (!completionData.completions[0].steps) {
        console.log('No steps found in completion data');
        return;
    }
    
    const steps = completionData.completions[0].steps;
    // Start iterating from the end of the original content
    // which is the start of the completion text
    let currentPos = document.positionAt(originalContent.length);
    
    for (const step of steps) {
        // Calculate token position
        const tokenLength = step.token.length;
        const tokenEndPos = document.positionAt(document.offsetAt(currentPos) + tokenLength);
        const tokenRange = new vscode.Range(
            currentPos,
            tokenEndPos
        );
        
        // Store token information
        completionTokens.push({
            text: step.token,
            range: tokenRange,
            entropy: step.entropy || 0,
            alternatives: step.top_logprobs ? step.top_logprobs.map(lp => ({
                token: lp.token,
                logprob: lp.logprob
            })) : []
        });
    
        // Store token range for decoration
        tokenRanges.push(tokenRange);
        
        // Create decoration based on entropy level (0-5 scale)
        if (step.entropy > 0) {
            const entropyLevel = Math.min(Math.floor(step.entropy * 5), 5);
            if (!tokenDecorations.has(entropyLevel)) {
                tokenDecorations.set(entropyLevel, []);
            }
            tokenDecorations.get(entropyLevel)?.push(tokenRange);
        }
        
        // Update position for next token
        currentPos = tokenEndPos;
    }
    
    // Store token information in the state
    completionState.setCompletionTokens(editor.document.uri.toString(), completionTokens);
    completionState.setCurrentTokenRanges(editor.document.uri.toString(), tokenRanges);
    
    // Apply decorations
    for (let level = 1; level <= 5; level++) {
        const opacity = level / 5;
        const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: `rgba(255, 0, 0, ${opacity})`,
            border: '1px solid rgba(255, 0, 0, 0.3)',
            borderRadius: '3px'
        });
        
        editor.setDecorations(decorationType, tokenDecorations.get(level) || []);
        tokenDecorationTypes.push(decorationType);
    }
    
    // Add this after applying token decorations in getCompletions
    
    // Store decoration types for later use
    completionState.setTokenDecorationTypes(editor.document.uri.toString(), tokenDecorationTypes);
}