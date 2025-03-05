// __src/extension.ts__

import * as vscode from 'vscode';
import * as lib from './lib';

// Store information about the inserted completion lines
interface CompletionLineInfo {
    range: vscode.Range;
    text: string;
    lineNumber: number;
    alternatives: string[];
}

// Mapping for alternative suggestions inserted in Stage 2
interface AlternativeMapping {
    lineNumber: number;           // the line number where the alternative was inserted
    originalLineNumber: number;   // the original completion line that spawned these alternatives
    alternativeIndex: number;     // which alternative it is (0-indexed)
}

let completionLines: CompletionLineInfo[] = [];
let alternativeMappings: AlternativeMapping[] = [];
let originalDocumentText: string | null = null;
let currentStage: 'idle' | 'stage1' | 'stage2' = 'idle';

// Decoration types
const completionDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(100, 149, 237, 0.3)' // light blue hint for completion lines
});
const alternativeDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(173, 216, 230, 0.4)', // a slightly different light blue for alternatives
    fontStyle: 'italic'
});
const fadedDecorationType = vscode.window.createTextEditorDecorationType({
    opacity: '0.5'
});

export function activate(context: vscode.ExtensionContext) {
    console.log('Clonepilot extension is now active');

    // Register our CodeLens provider (active in all documents for simplicity)
    const codeLensProvider = new AlternativeCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: '*', language: '*' }, codeLensProvider)
    );

    // Command to fetch and insert completions (Stage 1)
    const getCompletionCommand = vscode.commands.registerCommand('clonepilot.getCompletion', async () => {
        if (currentStage !== 'idle') {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const config = vscode.workspace.getConfiguration('clonepilot');
        const apiKey = config.get<string>('apiKey');
        const modelName = config.get<string>('modelID') as string;
        const maxTokens = config.get<number>('maxTokens') as number;
        if (!apiKey || !modelName || !maxTokens) return;

        try {
            originalDocumentText = editor.document.getText();
            completionLines = [];
            alternativeMappings = [];

            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Fetching completion...' }, async () => {
                const text = editor.document.getText();
                const completion = await lib.getCompletion(text, modelName, maxTokens, apiKey);
                if (!completion.trim()) return;

                await editor.edit(editBuilder => {
                    const position = editor.selection.active;
                    const lines = completion.split('\n');
                    lines.forEach((line, i) => {
                        const insertPos = position.translate(i, 0);
                        editBuilder.insert(insertPos, `\n${line}`);
                        // Record the inserted completion line
                        completionLines.push({
                            range: new vscode.Range(insertPos, insertPos.translate(0, line.length)),
                            text: line,
                            lineNumber: insertPos.line,
                            alternatives: generateAlternatives(line, 3)
                        });
                    });
                });

                // Decorate inserted completion lines
                const ranges = completionLines.map(cl => cl.range);
                editor.setDecorations(completionDecorationType, ranges);
                currentStage = 'stage1';
            });
        } catch (error) {
            vscode.window.showErrorMessage('Error fetching completion.');
        }
    });

    // Command to request alternatives (moves from Stage 1 to Stage 2)
    const requestAlternativesCommand = vscode.commands.registerCommand('clonepilot.requestAlternatives', async () => {
        if (currentStage !== 'stage1') return;
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const currentLine = editor.selection.active.line;
        const completionLine = completionLines.find(cl => cl.lineNumber === currentLine);
        if (!completionLine) return;

        currentStage = 'stage2';

        // Insert alternative lines below the selected completion line.
        await editor.edit(editBuilder => {
            const basePosition = new vscode.Position(completionLine.lineNumber + 1, 0);
            completionLine.alternatives.forEach((altText, i) => {
                // Prepend a marker (e.g. "ALT:") if needed for clarity.
                const textToInsert = `\n${altText}`;
                editBuilder.insert(basePosition.translate(i, 0), textToInsert);

                // Record mapping for the CodeLens provider.
                // The inserted alternative will be at line: (original line + 1 + i)
                alternativeMappings.push({
                    lineNumber: completionLine.lineNumber + 1 + i,
                    originalLineNumber: completionLine.lineNumber,
                    alternativeIndex: i
                });
            });
        });

        // Decorate the alternative lines.
        const altRanges = alternativeMappings.map(map => {
            return editor.document.lineAt(map.lineNumber).range;
        });
        editor.setDecorations(alternativeDecorationType, altRanges);

        // Fade out the rest of the document (all lines after the alternatives)
        const fadeStartLine = alternativeMappings[alternativeMappings.length - 1].lineNumber + 1;
        const fadeRange = new vscode.Range(new vscode.Position(fadeStartLine, 0),
                                           new vscode.Position(editor.document.lineCount, 0));
        editor.setDecorations(fadedDecorationType, [fadeRange]);

        // Signal CodeLens provider to update (if necessary)
        codeLensProvider.refresh();
    });

    // Command to accept an alternative suggestion (via CodeLens)
    const useAlternativeCommand = vscode.commands.registerCommand('clonepilot.useAlternative', async (params: { lineNumber: number, alternativeIndex: number }) => {
        if (currentStage !== 'stage2') return;
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const { lineNumber: originalLineNumber, alternativeIndex } = params;
        const completionLine = completionLines.find(cl => cl.lineNumber === originalLineNumber);
        if (!completionLine || alternativeIndex >= completionLine.alternatives.length) return;

        // Replace the original completion line with the accepted alternative text.
        await editor.edit(editBuilder => {
            const lineRange = editor.document.lineAt(originalLineNumber).range;
            editBuilder.replace(lineRange, completionLine.alternatives[alternativeIndex]);
        });

        // Exit Stage 2: remove alternative suggestions and fade effect,
        // and return to Stage 1 (with only the accepted completions visible).
        exitStage2(editor);
        currentStage = 'stage1';
    });

    // Command to cancel the current stage (Esc key binding)
    const escHandler = vscode.commands.registerCommand('clonepilot.cancel', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        if (currentStage === 'stage2') {
            // Exit Stage 2 but keep the Stage 1 completions intact.
            exitStage2(editor);
            currentStage = 'stage1';
        } else if (currentStage === 'stage1' && originalDocumentText) {
            // Remove completions and decorations; revert document to original.
            await editor.edit(editBuilder => {
                const fullRange = new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(editor.document.lineCount, 0)
                );
                editBuilder.replace(fullRange, originalDocumentText!);
            });
            // Clear any decorations
            editor.setDecorations(completionDecorationType, []);
            editor.setDecorations(alternativeDecorationType, []);
            editor.setDecorations(fadedDecorationType, []);
            completionLines = [];
            alternativeMappings = [];
            currentStage = 'idle';
        }
    });

    context.subscriptions.push(getCompletionCommand, requestAlternativesCommand, useAlternativeCommand, escHandler);
}

function generateAlternatives(originalLine: string, count: number): string[] {
    return Array.from({ length: count }, (_, i) => `${originalLine} // Alternative ${i + 1}`);
}

// Helper function to exit Stage 2 (remove alternative suggestions and faded decoration)
function exitStage2(editor: vscode.TextEditor) {
    // Remove alternative lines that were inserted.
    // Note: In a real implementation, you might want to remove only the alternative lines rather than all text after the completion.
    // For simplicity, here we remove the inserted alternative lines by replacing their ranges with empty strings.
    editor.edit(editBuilder => {
        alternativeMappings.sort((a, b) => b.lineNumber - a.lineNumber);
        for (const mapping of alternativeMappings) {
            const lineRange = editor.document.lineAt(mapping.lineNumber).rangeIncludingLineBreak;
            editBuilder.delete(lineRange);
        }
    });
    alternativeMappings = [];

    // Remove faded decoration.
    editor.setDecorations(fadedDecorationType, []);
    // Also clear alternative decorations.
    editor.setDecorations(alternativeDecorationType, []);
}

export function deactivate() {}

// --- CodeLens Provider for Alternative Suggestions ---
class AlternativeCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    public refresh() {
        this._onDidChangeCodeLenses.fire();
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        // Create a CodeLens for each alternative mapping that is in the current document.
        for (const mapping of alternativeMappings) {
            if (mapping.lineNumber < document.lineCount) {
                const line = document.lineAt(mapping.lineNumber);
                const range = new vscode.Range(line.range.start, line.range.end);
                lenses.push(new vscode.CodeLens(range, {
                    title: `Accept Alternative ${mapping.alternativeIndex + 1}`,
                    command: 'clonepilot.useAlternative',
                    arguments: [{ lineNumber: mapping.originalLineNumber, alternativeIndex: mapping.alternativeIndex }]
                }));
            }
        }
        return lenses;
    }
}
