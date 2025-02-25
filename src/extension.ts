// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as lib from './lib';

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
				// Insert the completion at the cursor position
				if (completion.trim()) {
					// Insert the completion at the end of the document
					// var lineStartPosition = new vscode.Position(document.lineCount + 1, 0);
					var lineStartPosition = document.positionAt(text.length);

					// Split completion into lines
					const lines = completion.split('\n');

					const opacities = [0.1, 0.15, 0.2];
					
					// Insert each line with a different shade of red
					for (let i = 0; i < lines.length; i++) {
						console.log(JSON.stringify(lines[i]));
						const opacity = opacities[i % opacities.length];
						console.log(`Opacity: ${opacity}`);
						const decoration = vscode.window.createTextEditorDecorationType({
							backgroundColor: `rgba(255, 0, 0, ${opacity})`
						});
						
						await editor.edit(editBuilder => {
							// const pos = lineStartPosition.translate(i, 0);
							editBuilder.insert(lineStartPosition, i === 0 ? lines[i] : '\n' + lines[i]);
						});
						
						// The range should be from the cursor position to the end of the line
						const lineOffset = document.lineAt(lineStartPosition).range.end;
						const range = new vscode.Range(lineStartPosition, lineOffset);
						editor.setDecorations(decoration, [range]);
						
						// Update the lineStartPosition to the beginning of the next line
						lineStartPosition = new vscode.Position(lineStartPosition.line + 1, 0);
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
		}
	));
}

async function insertCompletion(
	editor: vscode.TextEditor,
	position: vscode.Position,
	completion: string
): Promise<void> {
	// const edit = new vscode.WorkspaceEdit();
	// edit.insert(editor.document.uri, position, completion);
	// await vscode.workspace.applyEdit(edit);

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
