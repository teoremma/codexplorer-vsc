export class CompletionStateManager {
    private static instance: CompletionStateManager;
    private completionLinesByEditor: Map<string, CompletionLineInfo[]> = new Map();
    
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
    
    // More methods as needed
}
