import * as vscode from 'vscode';
import { CompletionStateManager } from '../state/completionState';
import { updateCurrentCompletion } from './common';

export async function gotoPreviousCompletion(
    completionState: CompletionStateManager
) {
    const historyLength = completionState.getCompletionHistoryLength();
    const currentPosition = completionState.getCurrentHistoryPosition();
    console.log(`Current position: ${currentPosition}, History length: ${historyLength}`);
    
    if (historyLength <= 1 || currentPosition <= 0) {
        vscode.window.showInformationMessage('No previous completions available.');
        return;
    }
    
    // Move to previous position in history
    const newPosition = currentPosition - 1;
    const previousCompletion = completionState.getCompletionHistoryAt(newPosition);
    
    if (previousCompletion) {
        // Set current position in history
        completionState.setCurrentHistoryPosition(newPosition);
        
        // Update UI with the previous completion
        await updateCurrentCompletion(previousCompletion, completionState);
        vscode.window.showInformationMessage(`Navigated to completion ${newPosition + 1} of ${historyLength}`);
    }
}

export async function gotoNextCompletion(
    completionState: CompletionStateManager
) {
    const historyLength = completionState.getCompletionHistoryLength();
    const currentPosition = completionState.getCurrentHistoryPosition();
    console.log(`Current position: ${currentPosition}, History length: ${historyLength}`);
    
    if (historyLength <= 1 || currentPosition >= historyLength - 1) {
        vscode.window.showInformationMessage('No next completions available.');
        return;
    }
    
    // Move to next position in history
    const newPosition = currentPosition + 1;
    const nextCompletion = completionState.getCompletionHistoryAt(newPosition);
    
    if (nextCompletion) {
        // Set current position in history
        completionState.setCurrentHistoryPosition(newPosition);
        
        // Update UI with the next completion
        await updateCurrentCompletion(nextCompletion, completionState);
        vscode.window.showInformationMessage(`Navigated to completion ${newPosition + 1} of ${historyLength}`);
    }
}