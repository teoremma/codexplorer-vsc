// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';

import * as lib from './lib';

// Update the interface to match the structure coming from lib
interface CompletionLineInfo {
    range: vscode.Range;
    text: string;
    lineNumber: number;
    alternatives: {
        text: string;
        explanation: string;
    }[]; 
}

// Global variable to track completion lines
let completionLines: CompletionLineInfo[] = [];

export function activate(context: vscode.ExtensionContext) {
    console.log('Clonepilot extension is now active');

    // Command that trigers the code completion
    const getCompletionCommand = vscode.commands.registerCommand('clonepilot.getCompletion', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor found.');
            return;
        }

        const config = vscode.workspace.getConfiguration('clonepilot');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey) {
            vscode.window.showErrorMessage('Please set your FireworksAI API key in the settings.');
            return;
        }
        const modelName = config.get<string>('modelID') as string;
        if (!modelName) {
            vscode.window.showErrorMessage('Please set the model name in the settings.');
            return;
        }
        const maxTokens = config.get<number>('maxTokens') as number;
        if (!maxTokens) {
            vscode.window.showErrorMessage('Please set the max tokens in the settings.');
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
                // const completionData = await lib.getFireworksAICompletion(
                const completionData = await lib.getCompletionsFull(
                    text,
                    modelName,
                    maxTokens,
                    apiKey
                );
                
                if (token.isCancellationRequested) {
                    return;
                }
                
                // Get the completion text and lines data
                const completion = completionData.completions[0].text;
                const completionLines0 = completionData.completions[0].lines || [];
                
                // Clear previous completion lines
                completionLines = [];
                
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
                        completionLines.push({
                            range: range,
                            text: lines[i],
                            lineNumber: lineStartPosition.line,
                            alternatives: lineAlternatives
                        });
                        
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
            });
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
            else {
                vscode.window.showErrorMessage('An unknown error occurred.');
            }
        }
    });

    const requestAlternativesCommand = vscode.commands.registerCommand('clonepilot.requestAlternatives', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active text editor found.');
            return;
        }

        const cursorPosition = editor.selection.active;
        const currentLineNumber = cursorPosition.line;

        // Find if the current line has alternatives
        const currentLine = completionLines.find(cl => cl.lineNumber === currentLineNumber);

        if (!currentLine || currentLine.alternatives.length === 0) {
            vscode.window.showInformationMessage('No alternatives available for this line.');
            return;
        }

        // Create decoration types
        const alternativeDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)' // Yellow highlighting
        });

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
    });

    context.subscriptions.push(getCompletionCommand, requestAlternativesCommand);

    // Register the config command
    context.subscriptions.push(
        vscode.commands.registerCommand('clonepilot.configureSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'Clonepilot');
        })
    );

    // Register command to replace the current line with an alternative
    context.subscriptions.push(
        vscode.commands.registerCommand('clonepilot.useAlternative', (params: { lineNumber: number, alternativeIndex: number }) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return;

            const { lineNumber, alternativeIndex } = params;
            const completionLine = completionLines.find(cl => cl.lineNumber === lineNumber);
            
            if (!completionLine || alternativeIndex >= completionLine.alternatives.length) return;
            
            const alternative = completionLine.alternatives[alternativeIndex].text;
            const line = editor.document.lineAt(lineNumber);
            
            editor.edit(editBuilder => {
                editBuilder.replace(line.range, alternative);
            });
            
            vscode.window.showInformationMessage(`Alternative code applied`);
        })
    );
}

async function insertCompletion(
    editor: vscode.TextEditor,
    position: vscode.Position,
    completion: string
): Promise<void> {
    // Format and insert the completion
    await editor.edit(editBuilder => {
        editBuilder.insert(position, completion);
    });

    // Show a subtle notification that the completion was inserted
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = "$(light-bulb) Completion inserted";
    statusBarItem.show();

    // Hide the notification after 2 seconds
    setTimeout(() => {
        statusBarItem.hide();
    }, 2000);
}

// This method is called when your extension is deactivated
export function deactivate() {}
