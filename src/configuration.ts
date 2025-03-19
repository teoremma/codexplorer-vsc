import * as vscode from 'vscode';

export class ConfigurationService {
    public static getConfig() {
        const config = vscode.workspace.getConfiguration('clonepilot');
        const apiKey = config.get<string>('apiKey');
        if (!apiKey) {
            throw new Error('Please set your FireworksAI API key in the settings.');
        }
        
        const modelName = config.get<string>('modelID');
        if (!modelName) {
            throw new Error('Please set the model name in the settings.');
        }
        
        const maxTokens = config.get<number>('maxTokens');
        if (!maxTokens) {
            throw new Error('Please set the max tokens in the settings.');
        }
        
        return { apiKey, modelName, maxTokens };
    }
}
