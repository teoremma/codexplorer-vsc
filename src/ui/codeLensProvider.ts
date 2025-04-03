import * as vscode from 'vscode';
import { CompletionStateManager, Stage } from '../state/completionState';

export class CompletionCodeLensProvider implements vscode.CodeLensProvider {
    private completionState: CompletionStateManager;

    private _onDidChangeCodeLensesEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLensesEmitter.event;

    constructor(completionState: CompletionStateManager) {
        this.completionState = completionState;
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        // Only provide CodeLenses when we're in the ENTROPY_VIEW stage
        if (this.completionState.getCurrentStage() !== Stage.ENTROPY_VIEW) {
            return [];
        }

        // Get the position where the completion starts
        const originalContentLength = this.completionState.getOriginalContent().length;
        const completionStartPosition = document.positionAt(originalContentLength);
        
        // Create a range for the first line of the completion
        const line = completionStartPosition.line;
        const range = new vscode.Range(line, 0, line, 0);
        
        // Create CodeLens actions for accept and dismiss
        const acceptCommand = {
            title: "✓ Accept completion",
            command: "codexplorer.acceptCompletion",
            tooltip: "Accept this completion"
        };
        
        const dismissCommand = {
            title: "✗ Dismiss completion",
            command: "codexplorer.dismissCompletion",
            tooltip: "Dismiss this completion"
        };
        
        return [
            new vscode.CodeLens(range, acceptCommand),
            new vscode.CodeLens(range, dismissCommand)
        ];
    }

    public refresh(): void {
        this._onDidChangeCodeLensesEmitter.fire();
    }
}