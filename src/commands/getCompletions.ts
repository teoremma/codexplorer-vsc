import * as vscode from 'vscode';
import * as lib from '../lib';
import { ConfigurationService } from '../configuration';
import { CompletionStateManager } from '../state/completionState';
import { StageManager, Stage } from '../state/stageManager';
import { CompletionLineInfo, CompletionTokenInfo } from '../extension';

export async function getCompletions(config, completionState, stageManager) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

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

            // Get the full completion data including alternatives from FireworksAI
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
            const completionLines0 = completionData.completions[0].lines || [];
            
            // Clear previous completion lines
            completionState.setCompletionLines(editor.document.uri.toString(), []);
            
            // Insert the completion at the cursor position
            if (completion.trim()) {
                // Insert the completion at the end of the document
                var lineStartPosition = document.positionAt(text.length);

                // Split completion into lines
                const lines = completion.split('\n');

                // Function to create SVG data URIs for digits
                function createDigitSvg(digit: number): vscode.Uri {
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                        <text x="8" y="12" font-family="Fira Code" font-size="10" fill="#db0019" 
                            text-anchor="middle">${digit}</text>
                    </svg>`;
                    
                    return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
                }

                // Cache SVG URIs for digits 1-9
                const digitIcons: vscode.Uri[] = [];
                for (let i = 1; i <= 9; i++) {
                    digitIcons[i] = createDigitSvg(i);
                }

                // Store for lines with alternatives
                const linesWithAltDecorations: {[key: number]: vscode.Range[]} = {};

                // Insert each line
                for (let i = 0; i < lines.length; i++) {
                    await editor.edit(editBuilder => {
                        editBuilder.insert(lineStartPosition, i === 0 ? lines[i] : '\n' + lines[i]);
                    });
                    
                    // The range should be from the cursor position to the end of the line
                    const lineRange = document.lineAt(lineStartPosition).range;
                    const range = new vscode.Range(lineStartPosition, lineRange.end);
                    
                    // Get alternatives for this line
                    const lineAlternatives = (i < completionLines0.length) ? 
                        completionLines0[i].alternatives : [];
                    
                    // Add gutter icon for alternatives count
                    const numAlternatives = lineAlternatives.length;
                    if (numAlternatives > 0 && numAlternatives <= 9) {
                        if (!linesWithAltDecorations[numAlternatives]) {
                            linesWithAltDecorations[numAlternatives] = [];
                        }
                        linesWithAltDecorations[numAlternatives].push(range);
                    }
                    
                    // Store completion line info for hover
                    completionState.setCompletionLines(editor.document.uri.toString(), [
                        ...completionState.getCompletionLines(editor.document.uri.toString()),
                        {
                            range: range,
                            text: lines[i],
                            lineNumber: lineStartPosition.line,
                            alternatives: lineAlternatives
                        }
                    ]);
                    
                    // Update the lineStartPosition to the beginning of the next line
                    lineStartPosition = new vscode.Position(lineStartPosition.line + 1, 0);
                }
                
                // Apply gutter decorations for alternatives count
                for (let numAlts = 1; numAlts <= 9; numAlts++) {
                    if (linesWithAltDecorations[numAlts] && linesWithAltDecorations[numAlts].length > 0) {
                        const gutterDecorationType = vscode.window.createTextEditorDecorationType({
                            gutterIconPath: digitIcons[numAlts],
                            gutterIconSize: 'contain'
                        });
                        editor.setDecorations(gutterDecorationType, linesWithAltDecorations[numAlts]);
                    }
                }

                vscode.window.showInformationMessage('Completion inserted successfully!');
            }
            else {
                vscode.window.showInformationMessage('No completion received.');
            }

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
