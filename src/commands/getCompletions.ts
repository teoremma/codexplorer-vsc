import * as vscode from 'vscode';
import * as lib from '../lib';
import { ConfigurationService } from '../configuration';
import { CompletionStateManager } from '../state/completionState';
import { StageManager, Stage } from '../state/stageManager';
import { CompletionTokenInfo } from '../extension';

export async function getCompletions(
    config, 
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
            const text = document.getText();

            // Set the alternatives status to not ready and not in progress
            completionState.setAlternativesReady(editorUri, false);
            completionState.setAlternativesInProgress(editorUri, false);
            
            // Get the initial completion data from FireworksAI without alternatives
            const completionData = await lib.getCompletionsFull(
                text,
                config.modelName,
                config.maxTokens,
                config.apiKey
            );
            
            if (token.isCancellationRequested) {
                return;
            }
            
            // Get the completion text and lines data
            const completion = completionData.completions[0].text;

            if (!completion.trim()) {
                vscode.window.showInformationMessage('No completion received.');
                return;
            }

            // Insert the completion at the end of the document
            let lineStartPosition = document.positionAt(text.length);

            // Insert the completion at the cursor position
            await editor.edit(editBuilder => {
                editBuilder.insert(lineStartPosition, completion);
            });

            // // Insert each line
            // for (let i = 0; i < lines.length; i++) {
            //     await editor.edit(editBuilder => {
            //         editBuilder.insert(lineStartPosition, i === 0 ? lines[i] : '\n' + lines[i]);
            //     });
                
            //     // The range should be from the cursor position to the end of the line
            //     const lineRange = document.lineAt(lineStartPosition).range;
            //     const range = new vscode.Range(lineStartPosition, lineRange.end);
                
            //     // Update the lineStartPosition to the beginning of the next line
            //     lineStartPosition = new vscode.Position(lineStartPosition.line + 1, 0);
            // }

            vscode.window.showInformationMessage('Completion inserted successfully!');

            // Start loading alternatives in the background
            completionState.setAlternativesInProgress(editorUri, true);
                
            lib.getAlternativesInBackground(
                completionData,
                config.maxTokens,
                config.apiKey,
                (result) => {
                    // Update tokens with alternatives
                    if (result.completions[0].steps) {
                        const tokens = completionState.getCompletionTokens(editorUri);
                        for (let i = 0; i < tokens.length && i < result.completions[0].steps.length; i++) {
                            if (result.completions[0].steps[i].top_logprobs) {
                                tokens[i].alternatives = result.completions[0].steps[i].top_logprobs.map(lp => ({
                                    token: lp.token,
                                    logprob: lp.logprob
                                }));
                            }
                        }
                        completionState.setCompletionTokens(editorUri, tokens);
                    }
                    
                    // Mark alternatives as ready
                    completionState.setAlternativesInProgress(editorUri, false);
                    completionState.setAlternativesReady(editorUri, true);
                    
                    // Optionally notify the user that alternatives are ready
                    vscode.window.showInformationMessage('Alternatives are now ready for this completion.');
                }
            );
            
            // Add this to the getCompletions function
            const tokenDecorationTypes: vscode.TextEditorDecorationType[] = [];
            const tokenDecorations: Map<number, vscode.Range[]> = new Map();
            const completionTokens: CompletionTokenInfo[] = [];

            // After inserting the completion text
            if (completionData.completions[0].steps) {
                const steps = completionData.completions[0].steps;
                let currentPos = document.positionAt(text.length);
                
                for (const step of steps) {
                    // Calculate token position
                    const tokenLength = step.token.length;
                    const tokenRange = new vscode.Range(
                        currentPos,
                        new vscode.Position(currentPos.line, currentPos.character + tokenLength)
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
                    
                    // Create decoration based on entropy level (0-5 scale)
                    if (step.entropy > 0) {
                        const entropyLevel = Math.min(Math.floor(step.entropy * 5), 5);
                        if (!tokenDecorations.has(entropyLevel)) {
                            tokenDecorations.set(entropyLevel, []);
                        }
                        tokenDecorations.get(entropyLevel)?.push(tokenRange);
                    }
                    
                    // Update position for next token
                    currentPos = document.positionAt(document.offsetAt(currentPos) + tokenLength);
                }
                
                // Store token information in the state
                completionState.setCompletionTokens(editor.document.uri.toString(), completionTokens);
                
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
