import * as vscode from 'vscode';
import * as lib from '../lib';
import { ConfigurationService } from '../configuration';
import { CompletionStateManager } from '../state/completionState';
import { StageManager, Stage } from '../state/stageManager';
import { CompletionTokenInfo } from '../extension';

export async function getCompletions(
    config: ReturnType<typeof ConfigurationService.getConfig>, 
    completionState: CompletionStateManager, 
    stageManager: StageManager
) {
    if (!stageManager.canExecuteInCurrentStage([Stage.IDLE])) {
        vscode.window.showErrorMessage('Cannot request completions at this time.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    const editorUri = editor.document.uri.toString();
    
    try {
        // Show loading indicator
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching completion...',
            cancellable: false
        }, async (progress, token) => {
            // Get current document content
            const document = editor.document;
            const originalContent = document.getText();

            // Set the alternatives status to not ready and not in progress
            completionState.setAlternativesReady(editorUri, false);
            completionState.setAlternativesInProgress(editorUri, false);
            
            // Get the initial completion data from FireworksAI without alternatives
            const completionData = await lib.getCompletionsFull(
                originalContent,
                config.modelName,
                config.maxTokens,
                config.apiKey
            );

            completionState.setCurrentCompletion(editorUri, completionData);
            
            if (token.isCancellationRequested) {
                return;
            }
            
            // Get the completion text and lines data
            const completionText = completionData.completions[0].text;

            if (!completionText.trim()) {
                vscode.window.showInformationMessage('No completion received.');
                return;
            }

            // Insert the completion at the end of the document
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

            // After inserting the completion text
            if (completionData.completions[0].steps) {
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
            }

            // Add this after applying token decorations in getCompletions

            // Store decoration types for later use
            completionState.setTokenDecorationTypes(editor.document.uri.toString(), tokenDecorationTypes);
        });
    } catch (error) {
        if (error instanceof Error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        }
        else {
            vscode.window.showErrorMessage('An unknown error occurred.');
        }
    }
}
