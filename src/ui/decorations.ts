import * as vscode from 'vscode';

export class DecorationFactory {
    public static createDigitIcon(digit: number): vscode.Uri {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <text x="8" y="12" font-family="Fira Code" font-size="10" fill="#db0019" 
                text-anchor="middle">${digit}</text>
        </svg>`;
        
        return vscode.Uri.parse(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    }
    
    public static createAlternativeDecoration(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 255, 0, 0.3)' // Yellow highlighting
        });
    }
    
    // Additional decoration factories
}
