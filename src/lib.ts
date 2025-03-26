import axios from "axios";

export interface CompletionPreview {
    text: string;
    explanation: string;
}

export interface AlternativeTokenInfo {
    token: string;
    logprob: number;
    completionPreview: CompletionPreview | undefined;
}

export interface StepInfo {
    text_offset: number;
    token: string;
    logprob: number;
    entropy: number;
    top_logprobs: AlternativeTokenInfo[];
}

export interface SingleCompletion {
    text: string;
    steps: StepInfo[];
}
 
export interface ProviderCompletions {
    prompt: string;
    modelID: string;
    completions: SingleCompletion[];
}

export async function getCompletionsFull(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
): Promise<ProviderCompletions> {
    const provider = "fireworksAI";
    if (provider === "fireworksAI") {
        // Just return the initial completion without waiting for alternatives
        return await getFireworksAICompletion(prompt, modelID, maxTokens, apiKey);
    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }
}

// New function to get alternatives in the background
export async function getAlternativesInBackground(
    completions: ProviderCompletions,
    maxTokens: number,
    apiKey: string,
    onComplete: (result: ProviderCompletions) => void
): Promise<void> {
    try {
        const result = await fillAlternatives(completions, maxTokens, apiKey);
        onComplete(result);
    } catch (error) {
        console.error("Error generating alternatives:", error);
    }
}

async function getFireworksAICompletion(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
    stop: string[] = ["\n\n", "```"],
    temprerature: number = 0.0,
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
        stop: stop,
        temperature: temprerature,
        logprobs: 5,
        logit_bias: {674: -100, 2: -100},
    };

    let response;

    try {
        response = await axios.post(endpoint, payload, { headers });
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("Error response:", error.response.data);
        }
        throw error;
    }

    // Iterate over each of the choices and transform to our format
    const completions = response.data.choices.map((choice: any) => {
        const completionText = choice.text;
        const steps = choice.logprobs.tokens.map((token: string, index: number) => {
            const text_offset = choice.logprobs.text_offset[index];
            const logprob = choice.logprobs.token_logprobs[index];

            const top_logprobs = Object.entries(choice.logprobs.top_logprobs[index] || {}).map(([token, logprob]) => 
                ({token,logprob: logprob as number})
            ).sort((a, b) => b.logprob - a.logprob);

            const entropy = top_logprobs.reduce((sum:number, lp:any) => {
                const prob = Math.exp(lp.logprob);
                return sum - (prob * Math.log(prob));
            }
            , 0);

            return {
                text_offset: text_offset,
                token: token,
                logprob: logprob,
                entropy: entropy,
                top_logprobs: top_logprobs
            };
        });

        return {
            text: completionText,
            steps,
        };
    });

    return {
        prompt,
        modelID,
        completions,
    };
}

export async function fillAlternativesAtToken(
    completions: ProviderCompletions,
    tokenIndex: number,
    maxTokens: number,
    apiKey: string,
): Promise<void> {
    // Check that the token index is valid
    if (tokenIndex < 0 || tokenIndex >= completions.completions[0].steps.length) {
        console.error("Invalid token index:", tokenIndex);
        return;
    }

    const step = completions.completions[0].steps[tokenIndex];

    // Check if all the alternatives are already filled
    if (step.top_logprobs.length > 1 && step.top_logprobs[1].completionPreview) {
        console.log("Alternatives already filled for token:", step.token);
        return;
    }

    const tokenStr = step.token;
    const tokenPosition = step.text_offset;
    const prompt = completions.prompt;
    const completionText = completions.completions[0].text;
    const completionPrefix = completionText.substring(0, tokenPosition);

    const perplexity = Math.pow(2, step.entropy);
    const n_alternatives = 4;

    console.log(`Generating ${n_alternatives} alternatives for token "${tokenStr}" with entropy ${step.entropy}`);
    console.log(`Top logprobs: ${step.top_logprobs.map(lp => `${lp.token}: ${lp.logprob}`).join(", ")}`);
    
    // Create an array of promises for parallel execution
    const alternativePromises = [];
    
    for (let alt_token_idx = 0; alt_token_idx < n_alternatives; alt_token_idx++) {
        const alternativeToken = step.top_logprobs[alt_token_idx + 1]; // Take the i+1-th best token
        
        // Skip if there aren't enough alternatives
        if (!alternativeToken) continue;
        
        const alternativePrompt = prompt + completionPrefix + alternativeToken.token;
        
        // Store the token index and the promise in a tuple
        alternativePromises.push({
            alt_token_idx,
            alternativeToken,
            promise: getFireworksAICompletion(
                alternativePrompt,
                completions.modelID,
                maxTokens,
                apiKey,
                ["\n"]
            )
        });
    }
    
    // Wait for all promises to complete in parallel
    const results = await Promise.allSettled(alternativePromises.map(item => item.promise));
    
    // Process the results and update the step
    results.forEach((result, index) => {
        const { alt_token_idx, alternativeToken } = alternativePromises[index];
        
        if (result.status === 'fulfilled') {
            const altCompletion = result.value;
            let altText = altCompletion.completions[0].text;
            const newlinePos = altText.indexOf('\n');
            if (newlinePos !== -1) {
                altText = altText.substring(0, newlinePos);
            }
            
            step.top_logprobs[alt_token_idx + 1].completionPreview = {
                text: alternativeToken.token + altText,
                explanation: alternativeToken.token
            };
        } else {
            console.error(`Error generating alternative for token ${alternativeToken.token}:`, result.reason);
        }
    });
}

export async function resampleAtToken(
    completions: ProviderCompletions,
    newToken: string,
    newTokenIndex: number,
    maxTokens: number,
    apiKey: string,
): Promise<ProviderCompletions> {
    // Check that the token index is valid
    if (newTokenIndex < 0 || newTokenIndex >= completions.completions[0].steps.length) {
        throw new Error(`Invalid token index: ${newTokenIndex}`);
    }

    const originalCompletion = completions.completions[0];
    const originalSteps = originalCompletion.steps;
    
    // Find the position of the token to be replaced
    const tokenToReplace = originalSteps[newTokenIndex];
    const tokenPosition = tokenToReplace.text_offset;
    
    // Get the text up to the token we're replacing
    const textBeforeToken = originalCompletion.text.substring(0, tokenPosition);
    
    // Create a new prompt that includes everything up to the token position plus our new token
    const newPrompt = completions.prompt + textBeforeToken + newToken;
    
    // Generate a new completion starting from this new prompt
    const newCompletionsResult = await getFireworksAICompletion(
        newPrompt,
        completions.modelID,
        maxTokens,
        apiKey
    );
    
    // Create the merged completion text
    const mergedCompletionText = 
        textBeforeToken + 
        newToken + 
        newCompletionsResult.completions[0].text;
    
    // Create merged steps:
    // 1. Keep steps from the original completion up to the replaced token
    const mergedSteps = [...originalSteps.slice(0, newTokenIndex)];
    
    // 2. Add a step for our new token
    mergedSteps.push({
        // text_offset: tokenPosition,
        // token: newToken,
        // logprob: 0, // We don't have actual log probability for manually inserted token
        // entropy: 0, 
        // top_logprobs: []
        ...tokenToReplace,
        token: newToken,
    });
    
    // 3. Add steps from the new completion with adjusted text offsets
    const baseOffset = tokenPosition + newToken.length;
    for (const step of newCompletionsResult.completions[0].steps) {
        mergedSteps.push({
            ...step,
            text_offset: baseOffset + step.text_offset
        });
    }
    
    // Return the merged result
    return {
        prompt: completions.prompt,
        modelID: completions.modelID,
        completions: [
            {
                text: mergedCompletionText,
                steps: mergedSteps
            }
        ]
    };
}

async function fillAlternatives(
    completions: ProviderCompletions,
    max_tokens: number,
    apiKey: string,
): Promise<ProviderCompletions> {
    // Clone the completions object to avoid modifying the original
    // const result = JSON.parse(JSON.stringify(completions));
    const result = completions;
    
    // Process only if we have steps with logprobs
    if (!result.completions[0].steps || result.completions[0].steps.length === 0) {
        console.log("No steps found in completion");
        return result;
    }
    
    const n_top_steps = 5;

    // Get the indices of the top n steps with the highest entropy
    const topEntropyStepsIndices = result.completions[0].steps
        .map((step: StepInfo, index: number) => ({ step, step_idx: index }))
        .filter(({ step }) => step.top_logprobs && step.top_logprobs.length > 1)
        .sort((a, b) => b.step.entropy - a.step.entropy)
        .slice(0, n_top_steps)
        .map(({ step_idx }) => step_idx); // Keep only the step indices for processing

    console.log("Steps with highest entropy:", topEntropyStepsIndices);

    // return result;
    
    // For each high entropy token, generate alternatives
    for (const step_idx of topEntropyStepsIndices) {
        // Find which line this token belongs to
        const step = result.completions[0].steps[step_idx];
        const tokenPosition = step.text_offset;
        const prompt = result.prompt;
        // const completionText = result.completions[0].text;
        const completionPrefix = result.completions[0].text.substring(0, tokenPosition);
        
        // Generate alternative for one of the top logprobs (not the top one)
        if (step.top_logprobs.length <= 1) {
            console.log("No other tokens found for this token:", step.token);
            continue;
        }
            
        const n_alternatives = Math.min(5, Math.pow(2, step.entropy));

        console.log(`Generating ${n_alternatives} alternatives for token "${step.token}" with entropy ${step.entropy}`);
        // console.log("Generating alternatives for token:", step.token, "with entropy:", step.entropy, "and n_alternatives:", n_alternatives);
        for (let alt_token_idx = 0; alt_token_idx < n_alternatives; alt_token_idx++) {
            const alternativeToken = step.top_logprobs[alt_token_idx + 1]; // Take the i+1-th best token
            
            // Create a new prompt that uses this alternative token
            const alternativePrompt = prompt + completionPrefix + alternativeToken.token;
            
            let altCompletion;
            try {
                // Request a new completion with the alternative token
                altCompletion = await getFireworksAICompletion(
                    alternativePrompt,
                    result.modelID,
                    max_tokens,
                    apiKey,
                    ["\n"]
                );
            } catch (error) {
                console.error(`Error generating alternative for token ${alternativeToken.token}:`, error);
                continue;
            }

            // Extract just the first line from the alternative completion
            let altText = altCompletion.completions[0].text;
            const newlinePos = altText.indexOf('\n');
            if (newlinePos !== -1) {
                altText = altText.substring(0, newlinePos);
            }

            // Store the completion preview in the original completion
            step.top_logprobs[alt_token_idx + 1].completionPreview = {
                text: altText,
                explanation: alternativeToken.token
            };
        };
    }
    
    console.log("Result with alternatives:");
    console.log(result);
    return result;
}