// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as lib from './lib';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Clonepilot extension is now active');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let helloWorldCommand = vscode.commands.registerCommand('clonepilot.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from clonepilot!');
	});

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

				// Get the current cursor position
				const cursorPosition = editor.selection.active;
				var offset = document.offsetAt(cursorPosition);
				// Move offset to the next new line, or the end of the document if no new line is found
				const nextNewLine = text.indexOf('\n', offset);
				if (nextNewLine !== -1) {
					offset = nextNewLine + 1;
				}
				else {
					offset = text.length;
				}

				// Split text at the cursor position
				const textBeforeCursor = text.substring(0, offset);
				// console.log('Text up to this line', textBeforeCursor);

				// Call FireworksAI API
				const completion = await lib.getCompletion(
					textBeforeCursor,
					modelName,
					maxTokens,
					apiKey
				);
				
				if (token.isCancellationRequested) {
					return;
				}
				// Insert the completion at the cursor position
				if (completion.trim()) {
					// Get position of offset
					const cursorPosition = document.positionAt(offset);
					// Insert the completion
					await insertCompletion(editor, cursorPosition, completion);
					// vscode.window.showInformationMessage('Completion inserted successfully!');
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

	context.subscriptions.push(helloWorldCommand);
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
		// editBuilder.replace(position, completion);
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
