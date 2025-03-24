import * as vscode from 'vscode';
import { CompletionLineInfo, CompletionTokenInfo } from '../extension';

export class CompletionStateManager {
    private static instance: CompletionStateManager;
    private completionLinesByEditor: Map<string, CompletionLineInfo[]> = new Map();
    private completionTokensByEditor: Map<string, CompletionTokenInfo[]> = new Map();
    
    private constructor() {}
    
    public static getInstance(): CompletionStateManager {
        if (!CompletionStateManager.instance) {
            CompletionStateManager.instance = new CompletionStateManager();
        }
        return CompletionStateManager.instance;
    }
    
    public setCompletionLines(editorId: string, lines: CompletionLineInfo[]): void {
        this.completionLinesByEditor.set(editorId, lines);
    }
    
    public getCompletionLines(editorId: string): CompletionLineInfo[] {
        return this.completionLinesByEditor.get(editorId) || [];
    }

    public setCompletionTokens(editorId: string, tokens: CompletionTokenInfo[]): void {
        this.completionTokensByEditor.set(editorId, tokens);
    }
    
    public getCompletionTokens(editorId: string): CompletionTokenInfo[] {
        return this.completionTokensByEditor.get(editorId) || [];
    }

    public getTokenAtPosition(editorId: string, position: vscode.Position): CompletionTokenInfo | undefined {
        return this.getCompletionTokens(editorId).find(token => 
            token.range.contains(position));
    }
    
    // More methods as needed
}
