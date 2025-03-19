import axios from "axios";
import { error } from "console";

export { 
    ProviderCompletions,
    SingleCompletion,
    getCompletion,
    getCompletionsFull,
    getFireworksAICompletion,
    fillLineAlternatives
 };

interface SingleCompletion {
    text: string;
    steps: {
        text_offset: number;
        token: string;
        logprob: number;
        top_logprobs: {
            token: string;
            logprob: number;
        }[];
    }[] | null;
    lines: {
        text: string;
        alternatives: {
            text: string;
            explanation: string;
        }[];
    }[] | null;
}
 
interface ProviderCompletions {
    prompt: string;
    modelID: string;
    completions: SingleCompletion[];
}



async function getCompletion(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
): Promise<string> {
    const provider = "fireworksAI";
    if (provider === "fireworksAI") {
        const completions = await getFireworksAICompletion(prompt, modelID, maxTokens, apiKey);
        const completionsWithAlternatives = await fillLineAlternatives(completions, maxTokens, apiKey);
        return completionsWithAlternatives.completions[0].text;
    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }

}

async function getCompletionsFull(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
): Promise<ProviderCompletions> {
    const provider = "fireworksAI";
    if (provider === "fireworksAI") {
        const completions = await getFireworksAICompletion(prompt, modelID, maxTokens, apiKey);
        // return completions;
        const completionsWithAlternatives = await fillLineAlternatives(completions, maxTokens, apiKey);
        return completionsWithAlternatives;
    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }
}

async function getFireworksAICompletion(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
    // stop: string[] = ["\n\n\n", "```"],
    stop: string[] = ["\n\n", "```"],
): Promise<ProviderCompletions> {
    const endpoint = "https://api.fireworks.ai/inference/v1/completions";
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };
    // const logit_bias =
    const payload = {
        model: modelID,
        prompt: prompt,
        max_tokens: maxTokens,
        // stop: ["\n\n\n", "```"],
        stop: stop,
        temperature: 0.0,
        logprobs: 5,
        logit_bias: {674: -100, 2: -100},
    };

    try {
        const response = await axios.post(endpoint, payload, { headers });
        
        // Extract text from the response
        const completionText: string = response.data.choices[0].text;
        
        // Extract logprobs if available
        const logprobs = response.data.choices[0].logprobs;
        
        // Create steps array from logprobs data
        const steps = logprobs ? logprobs.tokens.map((token: string, index: number) => {
            return {
                text_offset: logprobs.text_offset[index],
                token: token,
                logprob: logprobs.token_logprobs[index],
                top_logprobs: Object.entries(logprobs.top_logprobs[index] || {}).map(([token, logprob]) => ({
                    token,
                    logprob: logprob as number
                })).sort((a, b) => b.logprob - a.logprob)
            };
        }) : null;
        
        // Create lines from text
        const linesOfText = completionText.split('\n');
        const lines = linesOfText.map(line => ({
            text: line,
            alternatives: [] // Placeholder for alternatives that would need domain-specific logic
        }));

        const result = {
            prompt,
            modelID,
            completions: [{
                text: completionText,
                steps,
                lines: lines.length > 0 ? lines : null
            }]
        };
        // console.log("Result:", result);
        return result;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("Error response:", error.response.data);
        }
        throw error;
    }
}

async function fillLineAlternatives(
    completions: ProviderCompletions,
    max_tokens: number,
    apiKey: string,
): Promise<ProviderCompletions> {
    // Clone the completions object to avoid modifying the original
    const result = JSON.parse(JSON.stringify(completions));
    
    // Process only if we have steps with logprobs
    if (!result.completions[0].steps || result.completions[0].steps.length === 0) {
        return result;
    }
    
    // Calculate entropy for each step based on top logprobs
    const stepsWithEntropy = result.completions[0].steps.map((step:any, index: number) => {
        // Skip steps without top logprobs
        if (!step.top_logprobs || step.top_logprobs.length === 0) {
            return { ...step, entropy: 0, index };
        }
        
        // Calculate entropy: -sum(p * log(p))
        const entropy = step.top_logprobs.reduce((sum:number, lp:any) => {
            const prob = Math.exp(lp.logprob);
            return sum - (prob * Math.log(prob));
        }, 0);
        
        return { ...step, entropy, index };
    });

    
    // Sort by entropy and take top 5
    const topEntropySteps = stepsWithEntropy
        .filter((step: any) => step.top_logprobs && step.top_logprobs.length > 1)
        .sort((a: any, b: any) => b.entropy - a.entropy)
        .slice(0, 5);

    console.log("Steps with entropy:", topEntropySteps);

    // return result;
    
    // For each high entropy token, generate alternatives
    for (const step of topEntropySteps) {
        // Find which line this token belongs to
        const tokenPosition = step.text_offset;
        const prompt = result.prompt;
        const completionText = result.completions[0].text;
        const completionPrefix = result.completions[0].text.substring(0, tokenPosition);
        
        // Find the line number for this token
        let lineStart = completionText.lastIndexOf('\n', tokenPosition) + 1;
        const linePrefix = completionText.substring(lineStart, tokenPosition);
        // let lineEnd = completionText.indexOf('\n', tokenPosition);
        // if (lineEnd === -1) lineEnd = completionText.length;
        
        const lineIndex = completionText.substring(0, tokenPosition).split('\n').length - 1;
        // const currentLine = completionText.substring(lineStart, lineEnd);
        
        // Ensure we have a lines array and the line exists
        if (!result.completions[0].lines) {
            // result.completions[0].lines = [];
            error("No lines found in completion");
            return result; 
        }
        
        if (!result.completions[0].lines[lineIndex]) {
            // result.completions[0].lines[lineIndex] = {
            //     text: currentLine,
            //     alternatives: []
            // };
            error("Line not found in completion");
            return result;
        }
        
        // Generate alternative for one of the top logprobs (not the top one)
        if (step.top_logprobs.length > 1) {
            const n_alternatives = Math.round(Math.exp(step.entropy));
            console.log(`Generating ${n_alternatives} alternatives for token "${step.token}" with entropy ${step.entropy}`);
            // console.log("Generating alternatives for token:", step.token, "with entropy:", step.entropy, "and n_alternatives:", n_alternatives);
            for (let i = 0; i < n_alternatives; i++) {
                const alternativeToken = step.top_logprobs[i + 1]; // Take the i+1-th best token
            
                // Create a new prompt that uses this alternative token
                const alternativePrompt = prompt + completionPrefix + alternativeToken.token;
            
                try {
                    // Request a new completion with the alternative token
                    const altCompletion = await getFireworksAICompletion(
                        alternativePrompt,
                        result.modelID,
                        max_tokens,
                        apiKey,
                        ["\n"]
                    );

                    // Extract just the first line from the alternative completion
                    let altText = altCompletion.completions[0].text;
                    const newlinePos = altText.indexOf('\n');
                    if (newlinePos !== -1) {
                        altText = altText.substring(0, newlinePos);
                    }

                    const altLine = linePrefix + alternativeToken.token + altText;
                    console.log("Alternative line:", altLine);
                    // Add this as an alternative for the line
                    result.completions[0].lines[lineIndex].alternatives.push({
                        text: altLine,
                        explanation: `Alternative using token "${alternativeToken.token}" (logprob: ${alternativeToken.logprob.toFixed(2)})`
                    });
                } catch (error) {
                    console.error(`Error generating alternative for token ${alternativeToken.token}:`, error);
                }
            };
        }
    }
    
    console.log("Result with alternatives:");
    console.log(result);
    return result;
}