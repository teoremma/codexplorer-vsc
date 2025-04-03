import * as vscode from 'vscode';
import { DecorationFactory } from '../ui/decorations';
import { ConfigurationService } from '../configuration';
import { CompletionStateManager, Stage } from '../state/completionState';
import * as lib from '../lib';
import { setCompletionDecorations } from './common';

export async function requestAlternatives(
    config: ReturnType<typeof ConfigurationService.getConfig>,
    completionState: CompletionStateManager, 
) {
    const allowedStages = [Stage.ENTROPY_VIEW];
    if (!completionState.canExecuteInCurrentStage(allowedStages)) {
        vscode.window.showErrorMessage('Cannot request alternatives at this time.');
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active text editor found.');
        return;
    }

    try {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Fetching alternatives...',
            cancellable: false
        }, async (progress, token) => {
            const documentUri = editor.document.uri.toString();
                
            const cursorPosition = editor.selection.active;
                
            // Find the token at the current cursor position
            const currentTokenIdx = completionState.getTokenIndexAtPosition(documentUri, cursorPosition);
            const currentTokenRange = completionState.getCurrentTokenRanges(documentUri)[currentTokenIdx];
            const currentStep = completionState.getCurrentCompletion(documentUri).completions[0].steps[currentTokenIdx];
            const currentToken = currentStep.token;

            console.log('currentTokenIdx:', currentTokenIdx);
            completionState.setCurrentAltsTokenIndex(documentUri, currentTokenIdx);
                
            const currentCompletions = completionState.getCurrentCompletion(documentUri);
                
            // Load the alternatives for the current token
            await lib.fillAlternativesAtToken(
                currentCompletions,
                currentTokenIdx,
                config.maxTokens,
                config.apiKey
            );
        
            // Get alternatives for the token
            const alternatives = currentCompletions.completions[0].steps[currentTokenIdx].top_logprobs
                .map((alt, index) => ({
                    text: alt.completionPreview?.text,
                    explanation: alt.completionPreview?.explanation
                }));
            
            // Create decoration types
            const alternativeDecorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 255, 0, 0.1)', // Yellow highlighting
                border: '1px solid rgba(0, 0, 0, 0.3)',
                borderRadius: '3px'
            });
            
            const dimmedDecorationType = vscode.window.createTextEditorDecorationType({
                opacity: '0.5' // Reduced opacity for non-focused lines
            });
        
            // New decoration type for alternative tokens with yellow background
            const alternativeTokenDecorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 255, 0, 0.1)', // Dim yellow background
            });
        
            // New decoration type for selected alternative token
            const selectedAlternativeDecorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 255, 0, 0.1)', // Dim yellow background
                border: '1px solid rgba(188, 188, 188, 0.8)', // Darker border for selected alternative
                borderRadius: '3px'
            });
        
            // Create a custom red decoration just for the current token
            const currentTokenRedDecorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255, 0, 0, 0.3)',
                border: '1px solid rgba(255, 0, 0, 0.3)',
                borderRadius: '3px'
            });

            let correctedTokenRange = currentTokenRange;
            const newLineInTokenIndex = currentToken.indexOf('\n');
            if (newLineInTokenIndex !== -1) {
                correctedTokenRange = new vscode.Range(
                    currentTokenRange.start,
                    currentTokenRange.start.translate(0, newLineInTokenIndex)
                );
            }
            // Apply the custom red decoration only to the current token
            // editor.setDecorations(currentTokenRedDecorationType, [currentTokenRange]);
            editor.setDecorations(currentTokenRedDecorationType, [correctedTokenRange]);
            
            // Clear all existing red token decorations
            completionState.clearStage1Decorations();
        
            // Insert alternatives below the token's line
            const lineNumber = currentTokenRange.start.line;
            let insertPosition = new vscode.Position(lineNumber + 1, 0);
            
            // Get the current line text
            const currentLineText = editor.document.lineAt(lineNumber).text;

            // Check if the current line is the last line of the file
            const isLastLine = lineNumber === editor.document.lineCount - 1;
            if (isLastLine) {
                // Insert a newline character at the end of the current line to not break alternatives
                const newLineText = currentLineText + '\n';
                await editor.edit(editBuilder => {
                    editBuilder.replace(new vscode.Range(lineNumber, 0, lineNumber, currentLineText.length), newLineText);
                });
                insertPosition = new vscode.Position(lineNumber + 1, 0);
            }

            const linePrefix = currentLineText.substring(0, currentTokenRange.start.character);
            
            // Create a preview of what each alternative would generate
            await editor.edit(editBuilder => {
                alternatives.slice(1).forEach((alt, index) => {
                    // // Get rid of newline characters in the alternative text
                    // const alternativeLine = alt.text?.replace(/\n/g, ' ');
                    // Create the alternative line by replacing the current token with the alternative
                    const alternativeLineText = linePrefix + alt.text;
                    const correctedAltLineText = alternativeLineText.replaceAll('\n', '');
                    // Insert the alternative line
                    editBuilder.insert(insertPosition, correctedAltLineText + '\n');
                });
            });

            // Move the cursor to the first alternative
		    const newCursorPosition = new vscode.Position(lineNumber + 1, linePrefix.length);
		    const newSelection = new vscode.Selection(newCursorPosition, newCursorPosition);
		    editor.selection = newSelection;
        
            // Calculate the range of inserted alternatives
            const startLine = lineNumber + 1;
            const endLine = startLine + (alternatives.length - 1) - 1;
            
            // Create a decoration type for the common prefix
            const grayedPrefixDecorationType = vscode.window.createTextEditorDecorationType({
                opacity: '0.3',
                color: '#888888'
            });
            
            // Apply grayed out decoration to common prefixes in alternative lines
            const commonPrefixDecorations = [];
            // New: Create arrays for the alternative tokens with yellow background
            const alternativeTokenDecorations = [];
        
            for (let i = startLine; i <= endLine; i++) {
                // For common prefix (unchanged)
                const prefixRange = new vscode.Range(
                    new vscode.Position(i, 0),
                    new vscode.Position(i, currentTokenRange.start.character) 
                );
                commonPrefixDecorations.push(prefixRange);
                
                // For alternative tokens (with yellow background)
                const tokenRange = new vscode.Range(
                    new vscode.Position(i, currentTokenRange.start.character), 
                    new vscode.Position(i, editor.document.lineAt(i).text.length)
                );
                alternativeTokenDecorations.push(tokenRange);
            }
        
            editor.setDecorations(grayedPrefixDecorationType, commonPrefixDecorations);
            editor.setDecorations(alternativeTokenDecorationType, alternativeTokenDecorations);
            
            // Apply dimmed decoration to all lines above and below the alternatives
            const dimmedDecorations = [];
            
            // Lines above alternatives (if any)
            if (lineNumber > 0) {
                dimmedDecorations.push(new vscode.Range(
                    new vscode.Position(0, 0),
                    new vscode.Position(lineNumber, 0)
                ));
            }
            
            // Lines below alternatives (if any)
            const lastLine = editor.document.lineCount - 1;
            if (endLine + 1 <= lastLine) {
                dimmedDecorations.push(new vscode.Range(
                    new vscode.Position(endLine + 1, 0),
                    new vscode.Position(lastLine, editor.document.lineAt(lastLine).text.length)
                ));
            }
            
            editor.setDecorations(dimmedDecorationType, dimmedDecorations);
            
            // Register a hover provider for the alternatives area
            const hoverDisposable = vscode.languages.registerHoverProvider({ pattern: editor.document.uri.fsPath }, {
                provideHover(document, position, token) {
                    // Check if hover is in the alternatives area
                    if (position.line >= startLine && position.line <= endLine) {
                        // Calculate which alternative this is (0-indexed)
                        const altIndex = position.line - startLine + 1; // +1 because we skip the first alternative (original)
                        
                        // Get the explanation for this alternative
                        const explanation = alternatives[altIndex]?.explanation;
                        
                        if (explanation) {
                            const hoverRange = new vscode.Range(
                                new vscode.Position(position.line, linePrefix.length),
                                new vscode.Position(position.line, editor.document.lineAt(position.line).text.length)
                            );
                            const hoverMessage = new vscode.MarkdownString(`**Alternative Explanation**: ${explanation}`);
                            return new vscode.Hover(hoverMessage, hoverRange);
                        }
                    }
                    return null;
                }
            });

            const cleanupAlternatives = (discard: boolean) => {
                // Clean up alternatives and decorations
                editor.edit(editBuilder => {
                    const deleteRange = new vscode.Range(
                        new vscode.Position(startLine, 0),
                        new vscode.Position(endLine + 1, 0)
                    );
                    editBuilder.delete(deleteRange);
                });
                                    
                // Dispose decorations
                alternativeDecorationType.dispose();
                dimmedDecorationType.dispose();
                grayedPrefixDecorationType.dispose();
                alternativeTokenDecorationType.dispose();
                selectedAlternativeDecorationType.dispose();
                currentTokenRedDecorationType.dispose();
                                    
                // Dispose the hover provider
                hoverDisposable.dispose();
                
                if (discard) {
                    completionState.dismissTokenIdx(documentUri, currentTokenIdx);
                }
                // Print all indices of dismissed tokens
                // console.log('Dismissed token indices:', completionState.getDismissedTokens(documentUri));
                                    
                // Restore the original token decorations
                // completionState.restoreTokenDecorationState(documentUri);
                setCompletionDecorations(completionState);
                                    
                completionState.setCurrentAltsTokenIndex(documentUri, -1);
                
                completionState.setCurrentStage(Stage.ENTROPY_VIEW);
            };
            
            // Add the hover disposable to cleanup when done
            const cleanupDisposable = vscode.window.onDidChangeTextEditorSelection(() => {
                // Check if cursor moved away from alternatives area
                const newPosition = editor.selection.active;
                const newLine = newPosition.line;
                const isInAlternativesArea = (newLine >= startLine && newLine <= endLine);
                
                if (!isInAlternativesArea) {
                    cleanupAlternatives(true);
                    // Dispose this event listener
                    cleanupDisposable.dispose();
                } else {
                    // Update the selected alternative highlight
                    const selectedLine = newPosition.line;
                    const selectedRange = new vscode.Range(
                        new vscode.Position(selectedLine, currentTokenRange.start.character),
                        new vscode.Position(selectedLine, editor.document.lineAt(selectedLine).text.length)
                    );
                    
                    // Apply the selected decoration
                    editor.setDecorations(selectedAlternativeDecorationType, [selectedRange]);
                }
            });
        
        });
    
        vscode.window.showInformationMessage('Alternatives fetched successfully!');

        // Set the current stage to alternatives view
        completionState.setCurrentStage(Stage.ALTERNATIVES_VIEW);

    } catch (error) {
        if (error instanceof Error) {
            vscode.window.showErrorMessage(`Error: ${error.message}`);
        } else {
            vscode.window.showErrorMessage('An unknown error occurred.');
        }
        return;
    }

}
