import * as vscode from 'vscode';
import * as lib from '../lib';
import { ConfigurationService } from '../configuration';
import { CompletionStateManager } from '../state/completionState';
import { StageManager, Stage } from '../state/stageManager';
import { CompletionTokenInfo } from '../extension';
import { updateCurrentCompletion } from './common';

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
            completionState.setOriginalContent(originalContent);
            
            // Get the initial completion data from FireworksAI without alternatives
            const completionData = await lib.getCompletionsFull(
                originalContent,
                config.modelName,
                config.maxTokens,
                config.apiKey
            );

            updateCurrentCompletion(completionData, completionState);
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
