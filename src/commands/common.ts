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
    completionState.clearTokenDecorations(editorUri);

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

function createTokenEntropyDecoration(perplexityLevel: number): vscode.TextEditorDecorationType {
    const opacity = perplexityLevel / 5; // Scale from 0 to 1 based on level
    return vscode.window.createTextEditorDecorationType({
        backgroundColor: `rgba(255, 0, 0, ${opacity})`, // Red color with varying opacity
        border: '1px solid rgba(255, 0, 0, 0.3)', // Optional border for visibility
        borderRadius: '3px' // Optional rounded corners
    });
}

export function setCompletionDecorations(
    completionData: lib.ProviderCompletions,
    completionState: CompletionStateManager,
): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }
    const editorUri = editor.document.uri.toString();

    const steps: lib.StepInfo[] = completionState.getCurrentCompletion(editorUri).completions[0].steps;
    const stepRanges: vscode.Range[] = completionState.getCurrentTokenRanges(editorUri);
    const tokenEntropyDecorations: vscode.TextEditorDecorationType[] = [];
    
    // TODO: clear previous decorations before setting new ones
    // Iterate steps and ranges at the same time to create decorations

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const range = stepRanges[i];

        if (!range) {
            console.log(`No range found for step ${i}`);
            continue;
        }

        // Calculate the entropy level (0-5)
        const perplexity = Math.exp(step.entropy); // Convert entropy to perplexity
        const perplexityLevel = Math.round(perplexity); // Round to nearest integer

        // Create a decoration type for this entropy level
        const decorationType = createTokenEntropyDecoration(perplexityLevel);
        
        // Set the decoration for the current token range
        editor.setDecorations(decorationType, [range]);
        
        // Store the decoration type for later use
        tokenEntropyDecorations.push(decorationType);
    }
}