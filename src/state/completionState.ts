import * as vscode from 'vscode';
import { CompletionTokenInfo } from '../extension';
import { ProviderCompletions } from '../lib';

export enum Stage {
    IDLE = 0,
    ENTROPY_VIEW = 1,
    ALTERNATIVES_VIEW = 2,
}

// export interface ExtensionTokenInfo {
//     range: vscode.Range; // The range of the token in the document 
// }

export class CompletionStateManager {
    private static instance: CompletionStateManager;
    private originalContent: string = "";
    private currentCompletion: ProviderCompletions = { prompt: "", modelID: "", completions: [] };
    private currentStage: Stage = Stage.IDLE;

    // Stage 1 state
    private currentTokenRanges: vscode.Range[] = [];
    private isDismissedToken: boolean[] = []; // Used for tracking dismissed tokens

    // Stage 1 decorations
    private tokenEntropyDecorations: vscode.TextEditorDecorationType[] = []; // Used for entropy-based decorations
    private completionHighlightDecoration: vscode.TextEditorDecorationType | undefined; // Used for highlighting the completion range
    private currentSelectionDecoration: vscode.TextEditorDecorationType | undefined;

    // Stage 2 state
    private currentAltsTokenIndex: number = -1;

    private constructor() {}
    
    public static getInstance(): CompletionStateManager {
        if (!CompletionStateManager.instance) {
            CompletionStateManager.instance = new CompletionStateManager();
        }
        return CompletionStateManager.instance;
    }

    // Methods for managing the original content
    public setOriginalContent(content: string): void {
        this.originalContent = content;
    }

    public getOriginalContent(): string {
        return this.originalContent;
    }

    // public getOriginalContentLength(): number {
    //     return this.originalContent.length;
    // }

    public setCurrentCompletion(editorId: string, completion: ProviderCompletions): void {
        this.currentCompletion = completion;
    }

    public getCurrentCompletion(editorId: string): ProviderCompletions {
        return this.currentCompletion;
    }

    // Stage management
    public setCurrentStage(stage: Stage): void {
        this.currentStage = stage;
    }

    public getCurrentStage(): Stage {
        return this.currentStage;
    }

    public canExecuteInCurrentStage(allowedStages: Stage[]): boolean {
        return allowedStages.includes(this.currentStage);
    }

    public setCurrentTokenRanges(editorId: string, ranges: vscode.Range[]): void {
        this.currentTokenRanges = ranges;
    }

    public getCurrentTokenRanges(editorId: string): vscode.Range[] {
        return this.currentTokenRanges;
    }

    public setDismissedTokens(editorId: string, dismissedTokens: boolean[]): void {
        this.isDismissedToken = dismissedTokens;
    }

    public getDismissedTokens(editorId: string): boolean[] {
        return this.isDismissedToken;
    }

    public dismissTokenIdx(editorId: string, index: number): void {
        this.isDismissedToken[index] = true;
    }

    public getTokenIndexAtPosition(editorId: string, position: vscode.Position): number {
        return this.getCurrentTokenRanges(editorId).findIndex(range =>
            range.contains(position));
    }

    public setCurrentAltsTokenIndex(editorId: string, index: number): void {
        this.currentAltsTokenIndex = index;
    }

    public getCurrentAltsTokenIndex(editorId: string): number {
        return this.currentAltsTokenIndex;
    }

    public setTokenEntropyDecorations(decorations: vscode.TextEditorDecorationType[]): void {
        this.tokenEntropyDecorations = decorations;
    }

    public setCompletionHighlightDecoration(decoration: vscode.TextEditorDecorationType): void {
        this.completionHighlightDecoration = decoration;
    }

    // Add these methods
    public setSelectionDecoration(decoration: vscode.TextEditorDecorationType): void {
        this.clearSelectionDecoration();
        this.currentSelectionDecoration = decoration;
    }

    public clearSelectionDecoration(): void {
        if (this.currentSelectionDecoration) {
            this.currentSelectionDecoration.dispose();
            this.currentSelectionDecoration = undefined;
        }
    }

    public clearStage1Decorations(): void {
        this.completionHighlightDecoration?.dispose(); // Dispose of the current highlight decoration if it exists
        this.tokenEntropyDecorations.forEach(decoration => {
            decoration.dispose();
        });
        this.tokenEntropyDecorations = [];
    }
}
