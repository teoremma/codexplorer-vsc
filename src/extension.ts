// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';
import { errorMonitor } from 'events';

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
				const cursorPosition = editor.selection.active;
				const offset = document.offsetAt(cursorPosition);

				// Split text at the cursor position
				const textBeforeCursor = text.substring(0, offset);

				// Call FireworksAI API
				const completion = await getFireworksCompletion(
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

// Function to call FireworksAI API
async function getFireworksCompletion(
	codePrompt: string,
	modelName: string,
	maxTokens: number,
	apiKey: string
): Promise<string> {
	const endpoint = 'https://api.fireworks.ai/inference/v1/completions';	
	const headers = {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${apiKey}`
	};
	const payload = {
		model: modelName,
		prompt: codePrompt,
		max_tokens: maxTokens,
		stop: ['\n\n', "```"]
	};
	try {
		const response = await axios.post(endpoint, payload, { headers });
		return response.data.choices[0].text;
	} catch (error) {
		// console.error('Error fetching completion:', error);
		// throw new Error('Failed to fetch completion');
		if (axios.isAxiosError(error) && error.response) {
			console.error('Error response:', error.response.data);
		}
		throw error;
	}
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
