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
                        if (i % 4 === 0) {
                            decorationRangeArrays[i % decorationTypes.length].push(range);
                        }
                        
                        // Generate alternatives for this line
                        // In a real implementation, you might call your AI service again
                        // to get alternatives or generate them differently
                        const alternatives = generateAlternatives(lines[i], 3);
                        
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

    context.subscriptions.push(getCompletionCommand);

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

    // Register hover provider with syntax highlighting
    const hoverProvider = vscode.languages.registerHoverProvider('*', {
        provideHover(document, position, token) {
            // Check if the position is at the beginning of a line (first 3 characters)
            const line = document.lineAt(position.line);
            const isAtLineStart = position.character <= 3;
            
            if (!isAtLineStart) {
                return undefined;
            }
            
            // Find if this is one of our completion lines
            const completionLine = completionLines.find(cl => cl.lineNumber === position.line);
            if (!completionLine) {
                return undefined;
            }
            
            // Create hover content with syntax-highlighted alternatives
            const contents = new vscode.MarkdownString();
            contents.isTrusted = true; // Necessary for command links
            
            // contents.appendMarkdown('### Alternative Code Options\n\n');
            
            // Get the language ID for syntax highlighting
            const languageId = document.languageId;
            
            // Add each alternative with syntax highlighting and a command link
            completionLine.alternatives.forEach((alternative, index) => {
                // Add a divider between alternatives
                if (index > 0) {
                    contents.appendMarkdown('\n---\n\n');
                }
                
                // Show the alternative with proper syntax highlighting
                contents.appendCodeblock(alternative, languageId);
                
                // // Add a command link to use this alternative
                // contents.appendMarkdown(
                //     `[Use this alternative](command:clonepilot.useAlternative?${encodeURIComponent(JSON.stringify({
                //         lineNumber: position.line,
                //         alternativeIndex: index
                //     }))})\n\n`
                // );
            });
            
            return new vscode.Hover(contents, line.range);
        }
    });
    
    context.subscriptions.push(hoverProvider);
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