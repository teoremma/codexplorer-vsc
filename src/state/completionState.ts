import * as vscode from 'vscode';
import { CompletionLineInfo, CompletionTokenInfo } from '../extension';

export class CompletionStateManager {
    private static instance: CompletionStateManager;
    private completionLinesByEditor: Map<string, CompletionLineInfo[]> = new Map();
    private completionTokensByEditor: Map<string, CompletionTokenInfo[]> = new Map();
    private alternativesReadyByEditor: Map<string, boolean> = new Map();
    private alternativesInProgressByEditor: Map<string, boolean> = new Map();
    
    // Store decoration state
    private tokenDecorationState = new Map<string, any>();
    private tokenDecorationTypes = new Map<string, vscode.TextEditorDecorationType[]>();

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
    
    public setAlternativesInProgress(editorId: string, inProgress: boolean): void {
        this.alternativesInProgressByEditor.set(editorId, inProgress);
    }
    
    public setAlternativesReady(editorId: string, ready: boolean): void {
        this.alternativesReadyByEditor.set(editorId, ready);
    }
    
    public areAlternativesReady(editorId: string): boolean {
        return this.alternativesReadyByEditor.get(editorId) || false;
    }
    
    public areAlternativesInProgress(editorId: string): boolean {
        return this.alternativesInProgressByEditor.get(editorId) || false;
    }
    
    // Store token decoration types
    public setTokenDecorationTypes(documentUri: string, decorationTypes: vscode.TextEditorDecorationType[]): void {
        this.tokenDecorationTypes.set(documentUri, decorationTypes);
    }

    // Get token decoration types
    public getTokenDecorationTypes(documentUri: string): vscode.TextEditorDecorationType[] {
        return this.tokenDecorationTypes.get(documentUri) || [];
    }

    // Store current token decoration state for later restoration
    public storeTokenDecorationState(documentUri: string): void {
        // Store the current state of token decorations
        const tokens = this.getCompletionTokens(documentUri);
        const decorationTypes = this.getTokenDecorationTypes(documentUri);
        
        this.tokenDecorationState.set(documentUri, {
            tokens: [...tokens],
            decorationTypes: [...decorationTypes]
        });
    }

    // Clear all token decorations (except the current one)
    public clearTokenDecorations(documentUri: string): void {
        const decorationTypes = this.getTokenDecorationTypes(documentUri);
        const editor = vscode.window.activeTextEditor;
        
        if (editor && editor.document.uri.toString() === documentUri) {
            // Clear each decoration type by setting it to an empty array
            decorationTypes.forEach(decorationType => {
                editor.setDecorations(decorationType, []);
            });
        }
    }

    // Restore token decorations to their original state
    public restoreTokenDecorationState(documentUri: string): void {
        const state = this.tokenDecorationState.get(documentUri);
        const editor = vscode.window.activeTextEditor;
        
        if (editor && state && editor.document.uri.toString() === documentUri) {
            // Recreate the entropy-based decorations
            const tokenDecorations: Map<number, vscode.Range[]> = new Map();
            
            // Group tokens by entropy level
            state.tokens.forEach(token => {
                if (token.entropy > 0) {
                    const entropyLevel = Math.min(Math.floor(token.entropy * 5), 5);
                    if (!tokenDecorations.has(entropyLevel)) {
                        tokenDecorations.set(entropyLevel, []);
                    }
                    tokenDecorations.get(entropyLevel)?.push(token.range);
                }
            });
            
            // Apply decorations by level
            for (let level = 1; level <= 5; level++) {
                const opacity = level / 5;
                const decorationType = vscode.window.createTextEditorDecorationType({
                    backgroundColor: `rgba(255, 0, 0, ${opacity})`,
                    border: '1px solid rgba(255, 0, 0, 0.3)',
                    borderRadius: '3px'
                });
                
                editor.setDecorations(decorationType, tokenDecorations.get(level) || []);
                
                // Store the new decoration type
                const currentTypes = this.getTokenDecorationTypes(documentUri);
                currentTypes.push(decorationType);
                this.setTokenDecorationTypes(documentUri, currentTypes);
            }
            
            // Clear stored state
            this.tokenDecorationState.delete(documentUri);
        }
    }

    // More methods as needed
}
