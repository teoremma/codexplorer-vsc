// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as lib from './lib';

// Store information about the completion lines
interface CompletionLineInfo {
    range: vscode.Range;
    text: string;
    lineNumber: number;
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
                        decorationRangeArrays[i % decorationTypes.length].push(range);
                        
                        // Store completion line info for hover
                        completionLines.push({
                            range: range,
                            text: lines[i],
                            lineNumber: lineStartPosition.line
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

    // Register commands for the hover options
    context.subscriptions.push(
        vscode.commands.registerCommand('clonepilot.acceptLine', (lineNumber: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                vscode.window.showInformationMessage(`Line ${lineNumber + 1} accepted`);
                // You can add additional logic here for accepting a line
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('clonepilot.rejectLine', (lineNumber: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                // Delete the line
                editor.edit(editBuilder => {
                    const line = editor.document.lineAt(lineNumber);
                    editBuilder.delete(line.rangeIncludingLineBreak);
                });
                vscode.window.showInformationMessage(`Line ${lineNumber + 1} removed`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('clonepilot.modifyLine', (lineNumber: number) => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const line = editor.document.lineAt(lineNumber);
                // Select the line to allow immediate modification
                editor.selection = new vscode.Selection(
                    lineNumber, 0,
                    lineNumber, line.range.end.character
                );
                vscode.window.showInformationMessage(`Edit line ${lineNumber + 1}`);
            }
        })
    );

    // Register hover provider
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
            
            // Create markdown with command links
            const contents = new vscode.MarkdownString();
            contents.isTrusted = true;
            contents.supportHtml = true;
            
            contents.appendMarkdown('### Line Options\n\n');
            contents.appendMarkdown(`- [Accept](command:clonepilot.acceptLine?${encodeURIComponent(JSON.stringify(position.line))})\n`);
            contents.appendMarkdown(`- [Reject](command:clonepilot.rejectLine?${encodeURIComponent(JSON.stringify(position.line))})\n`);
            contents.appendMarkdown(`- [Modify](command:clonepilot.modifyLine?${encodeURIComponent(JSON.stringify(position.line))})\n`);

            // contents.appendMarkdown("`def get_existing_ports():`\n");
            // contents.appendMarkdown("---\n")
            // contents.appendMarkdown("`def get_current_ports():`\n");
            
            return new vscode.Hover(contents, line.range);
        }
    });
    
    context.subscriptions.push(hoverProvider);
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