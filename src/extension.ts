// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as lib from './lib';

// Store information about the completion lines and their alternatives
interface CompletionLineInfo {
    range: vscode.Range;
    text: string;
    lineNumber: number;
    alternatives: string[]; // Array of alternative code suggestions
}

// Global variable to track completion lines
let completionLines: CompletionLineInfo[] = [];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
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
                console.log('Current document content:');
                console.log(JSON.stringify(text));

                // Call FireworksAI API
                const completion = await lib.getCompletion(
                    text,
                    modelName,
                    maxTokens,
                    apiKey
                );

                console.log('Completion received:');
                console.log(JSON.stringify(completion));
                
                if (token.isCancellationRequested) {
                    return;
                }
                
                // Clear previous completion lines
                completionLines = [];
                
                // Insert the completion at the cursor position
                if (completion.trim()) {
                    // Insert the completion at the end of the document
                    var lineStartPosition = document.positionAt(text.length);

                    // Split completion into lines
                    const lines = completion.split('\n');

                    const opacities = [0.2, 0.3, 0.4];
                    
                    // Create decoration types once
                    const decorationTypes = opacities.map(opacity => 
                        vscode.window.createTextEditorDecorationType({
                            backgroundColor: `rgba(255, 0, 0, ${opacity})`
                        })
                    );

                    var decorationRangeArrays: vscode.Range[][] = [[], [], []];

                    // Insert each line with a different shade of red
                    for (let i = 0; i < lines.length; i++) {
                        console.log(JSON.stringify(lines[i]));
                        
                        await editor.edit(editBuilder => {
                            editBuilder.insert(lineStartPosition, i === 0 ? lines[i] : '\n' + lines[i]);
                        });
                        
                        // The range should be from the cursor position to the end of the line
                        const lineRange = document.lineAt(lineStartPosition).range;
                        const range = new vscode.Range(lineStartPosition, lineRange.end);
                        const altsProb = Math.random();
                        let alternatives: string[];
                        if (altsProb < 0.2) {
                            // Get a random decoration type
                            const randomIndex = Math.floor(Math.random() * decorationTypes.length);
                            decorationRangeArrays[randomIndex].push(range);
                            const numAlternatives = Math.floor(Math.random() * 6) + 1;
                            alternatives = generateAlternatives(lines[i], numAlternatives);
                        }
                        else {
                            // decorationRangeArrays[i % decorationTypes.length].push(range);
                            alternatives = [];
                        }
                        
                        // Store completion line info for hover
                        completionLines.push({
                            range: range,
                            text: lines[i],
                            lineNumber: lineStartPosition.line,
                            alternatives: alternatives
                        });
                        
                        // Update the lineStartPosition to the beginning of the next line
                        lineStartPosition = new vscode.Position(lineStartPosition.line + 1, 0);
                    }

                    // Apply the decorations
                    for (let i = 0; i < decorationTypes.length; i++) {
                        editor.setDecorations(decorationTypes[i], decorationRangeArrays[i]);
                    }

                    console.log(completionLines);
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
                editBuilder.insert(insertPosition, alt + '\n');
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
            
            const alternative = completionLine.alternatives[alternativeIndex];
            const line = editor.document.lineAt(lineNumber);
            
            editor.edit(editBuilder => {
                editBuilder.replace(line.range, alternative);
            });
            
            vscode.window.showInformationMessage(`Alternative code applied`);
        })
    );

    // // Register completion provider for intellisense dropdown
    // const completionProvider = vscode.languages.registerCompletionItemProvider('*', {
    //     provideCompletionItems(document, position, token, context) {
    //         // Find if this is one of our completion lines
    //         const completionLine = completionLines.find(cl => cl.lineNumber === position.line);
    //         if (!completionLine) {
    //             return undefined;
    //         }
            
    //         const line = document.lineAt(position.line);
            
    //         // Create completion items for each alternative
    //         const completionItems: vscode.CompletionItem[] = completionLine.alternatives.map((alternative, index) => {
    //             const item = new vscode.CompletionItem(
    //                 // `Alternative ${index + 1}`,
    //                 // line.text + ` # Alternative ${index + 1}`,
    //                 alternative,
    //                 vscode.CompletionItemKind.Snippet
    //             );
                
    //             // Set the text to be inserted
    //             item.insertText = alternative;
                
    //             // Replace the entire line
    //             item.range = line.range;
                
    //             // Add documentation with syntax highlighting
    //             const documentation = new vscode.MarkdownString();
    //             documentation.isTrusted = true;
    //             documentation.appendCodeblock(alternative, document.languageId);
                
    //             item.documentation = documentation;
    //             item.detail = `Alternative code suggestion ${index + 1}`;
                
    //             // Sort order (to ensure our items appear at the top)
    //             item.sortText = `0${index}`;
                
    //             return item;
    //         });
            
    //         return completionItems;
    //     }
    // }, ' ', '\t', '\n'); // Trigger on space, tab, or new line
    
    // context.subscriptions.push(completionProvider);
    
    // // Register command to show alternatives explicitly
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('clonepilot.showAlternatives', () => {
    //         const editor = vscode.window.activeTextEditor;
    //         if (!editor) return;
            
    //         // Trigger intellisense at current position
    //         vscode.commands.executeCommand('editor.action.triggerSuggest');
    //     })
    // );
}

// Function to generate alternative code lines
// In a real implementation, you would likely call your AI service again
function generateAlternatives(originalLine: string, count: number): string[] {
    const alternatives: string[] = [];
    
    // Simple placeholder alternatives - in a real implementation, 
    // these would come from your AI model
    for (let i = 0; i < count; i++) {
        // Here we're creating simple variations, but you would replace this
        // with actual alternative completions
        // switch(i) {
        //     case 0:
        //         alternatives.push(originalLine.replace(/var /g, 'const ').replace(/let /g, 'const '));
        //         break;
        //     case 1:
        //         alternatives.push(originalLine.includes('//') ? originalLine : `${originalLine} // Alternative implementation`);
        //         break;
        //     case 2:
        //         // Add some whitespace differences or other minor variations
        //         alternatives.push(originalLine.replace(/\s+/g, ' ').trim());
        //         break;
        //     default:
        //         alternatives.push(`// Alternative ${i+1}: ${originalLine}`);
        // }
        alternatives.push(originalLine + ` # Alternative ${i + 1}`);
    }
    
    return alternatives;
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