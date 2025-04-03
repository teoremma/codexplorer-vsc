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
    completionState.clearStage1Decorations();

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
    
    const tokenRanges: vscode.Range[] = [];

    if (!completionData.completions[0].steps) {
        console.log('No steps found in completion data');
        return;
    }
    
    const steps = completionData.completions[0].steps;
    completionState.setDismissedTokens(editorUri, new Array(steps.length).fill(false));

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
        
        // Store token range for decoration
        tokenRanges.push(tokenRange);
        
        // Update position for next token
        currentPos = tokenEndPos;
    }
    
    // Store token information in the state
    completionState.setCurrentTokenRanges(editor.document.uri.toString(), tokenRanges);

    setCompletionDecorations(completionState);
}

function createTokenEntropyDecoration(perplexityLevel: number): vscode.TextEditorDecorationType {
    // If perplexityLevel is out of bounds, clamp it to 0-4
    if (perplexityLevel < 0) {
        perplexityLevel = 0; // Clamp to 0
    } else if (perplexityLevel > 4) {
        perplexityLevel = 4; // Clamp to 4
    }
    // If perplexityLevel is close to 0, make round it to 0
    if (perplexityLevel < 0.2) {
        perplexityLevel = 0; // Round to 0 for very low values to avoid too much noise in UI
    }
    if (perplexityLevel === 0) {
        // Return a decoration type with no background color for 0
        // This will effectively make it invisible in the editor
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: 'transparent', // No background for level 0
            border: 'none' // No border for level 0
        });
    }
    let opacity = perplexityLevel / 4; // Scale from 0 to 1 based on level
    return vscode.window.createTextEditorDecorationType({
        backgroundColor: `rgba(255, 0, 0, ${opacity})`, // Red color with varying opacity
        border: '1px solid rgba(255, 0, 0, 0.3)', // Optional border for visibility
        borderRadius: '3px' // Optional rounded corners
    });
}

function createDismissedTokenDecoration(): vscode.TextEditorDecorationType {
    // This function creates a decoration type for dismissed tokens
    return vscode.window.createTextEditorDecorationType({
        // backgroundColor: 'rgba(127, 127, 127, 0.5)', // Grey background for dismissed tokens
        border: '1px solid rgba(255, 255, 255, 0.3)', // Optional border for visibility
        borderRadius: '3px' // Optional rounded corners
    });
}

function createCompletionHighlightDecoration(): vscode.TextEditorDecorationType {
    // This function creates a decoration type for highlighting the completion
    return vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(127, 127, 127, 0.1)', // Yellow background for highlighting
    });
}

function setCompletionHighlightDecoration(
    completionState: CompletionStateManager,
): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }
    // Add a highlight decoration for the entire completion text
    const completionStartPosition = editor.document.positionAt(
        completionState.getOriginalContent().length
    );
    const completionRange = new vscode.Range(
        completionStartPosition,
        editor.document.positionAt(editor.document.getText().length)
    );
    // Create a decoration type for highlighting the completion
    const highlightDecorationType = createCompletionHighlightDecoration();
    // Set the decoration for the completion range
    editor.setDecorations(highlightDecorationType, [completionRange]);
    completionState.setCompletionHighlightDecoration(highlightDecorationType);
}

export function setCompletionDecorations(
    // completionData: lib.ProviderCompletions,
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
    const dismissedSteps: boolean[] = completionState.getDismissedTokens(editorUri);
    console.log(`Dismissed steps: ${dismissedSteps}`);

    const tokenEntropyDecorations: vscode.TextEditorDecorationType[] = [];
    
    completionState.clearStage1Decorations();
    // Iterate steps and ranges at the same time to create decorations

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const range = stepRanges[i];
        const token = step.token;

        if (!range) {
            console.log(`No range found for step ${i}`);
            continue;
        }

        let correctedRange = range;
        const newLineIndex = token.indexOf('\n');
        if (newLineIndex !== -1) {
            // If the token contains a newline, adjust the range to exclude it
            correctedRange = new vscode.Range(
                range.start,
                range.start.translate(0, newLineIndex)
            );
        }

        // Calculate the entropy level (0-5)
        const perplexity = Math.exp(step.entropy); // Convert entropy to perplexity
        const perplexityLevel = Math.round(perplexity); // Round to nearest integer
        // console.log(`Step ${i}: entropy = ${step.entropy}, perplexity = ${perplexity}, level = ${perplexityLevel}`);

        // Create a decoration type for this entropy level
        let decorationType: vscode.TextEditorDecorationType;
        // const decorationType = createTokenEntropyDecoration(perplexity - 1);

        if (dismissedSteps[i]) {
            decorationType = createDismissedTokenDecoration();
        } else {
            decorationType = createTokenEntropyDecoration(perplexityLevel - 1);
        }
        
        // Set the decoration for the current token range
        editor.setDecorations(decorationType, [correctedRange]);
        
        // Store the decoration type for later use
        tokenEntropyDecorations.push(decorationType);
    }

    // Set a highlight decoration for the entire completion
    setCompletionHighlightDecoration(completionState);

    completionState.setTokenEntropyDecorations(tokenEntropyDecorations);
}