import axios from "axios";
const fs = require('fs');
const path = require('path');

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

// // New function to get alternatives in the background
// export async function getAlternativesInBackground(
//     completions: ProviderCompletions,
//     maxTokens: number,
//     apiKey: string,
//     onComplete: (result: ProviderCompletions) => void
// ): Promise<void> {
//     try {
//         const result = await fillAlternatives(completions, maxTokens, apiKey);
//         onComplete(result);
//     } catch (error) {
//         console.error("Error generating alternatives:", error);
//     }
// }

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
    // Bias for meta-llama/Llama-3.3-70B-Instruct
    const logit_bias = {2: -100, 674: -100, 3270: -100, 4304: -100, 7275: -100, 7860: -100, 12713: -100, 12885: -100};
    const payload = {
        model: modelID,
        prompt: prompt,
        max_tokens: maxTokens,
        top_k: 1,
        stop: stop,
        temperature: temprerature,
        logprobs: 5,
        logit_bias: logit_bias,
    };

    let response;

    // Find the path to the cached prompt and response
    const cachedPromptPath = path.join(__dirname, '../src/resources', 'pilot.py');;
    const cachedPrompt = fs.readFileSync(cachedPromptPath, 'utf8');
    if (prompt === cachedPrompt) {
        console.log("Using cached response for prompt");
        const cachedResponsePath = path.join(__dirname, '../src/resources', 'fireworks-response-2025-04-01T19-29-42-977Z.json');
        const cachedResponse = fs.readFileSync(cachedResponsePath, 'utf8');
        response = {data: JSON.parse(cachedResponse)};
    } else {
        console.log("Requesting response from FireworksAI");
        try {
            response = await axios.post(endpoint, payload, { headers });
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error("Error response:", error.response.data);
            }
            throw error;
        }
    }


    // // Log the response for debugging
    // console.log("Response received:", response.data);

    // // Save the response to a JSON file
    // const responseData = response.data;
    // const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // const filename = path.join(`${__dirname}/fireworks-response-${timestamp}.json`);

    // try {
    //     fs.writeFileSync(filename, JSON.stringify(responseData, null, 2));
    //     console.log(`Response saved to ${filename}`);
    // } catch (error) {
    //     console.error("Error saving response to file:", error);
    // }
    

    // Iterate over each of the choices and transform to our format
    const completions = response.data.choices.map((choice: any) => {
        const completionText = choice.text;
        const steps = choice.logprobs.tokens.map((token: string, index: number) => {
            const text_offset = choice.logprobs.text_offset[index];
            let logprob = choice.logprobs.token_logprobs[index];

            let top_logprobs = Object.entries(choice.logprobs.top_logprobs[index] || {}).map(([token, logprob]) => 
                ({token,logprob: logprob as number})
            ).sort((a, b) => b.logprob - a.logprob);

            // Merge tokens and their probabilities that only differ by whitespace and/or quotes
            top_logprobs = whiteSpaceElim(top_logprobs.map(({ token, logprob }) => [token, logprob] as [string, number]))
                .map(([token, logprob]) => ({ token, logprob }));

            // Normalize token logprobs to reflect the distribution before calculating entropy
            const totalProb = top_logprobs.reduce((acc, { logprob }) => acc + Math.exp(logprob), 0);
            top_logprobs = top_logprobs.map(({ token, logprob }) => ({ token, logprob: Math.log(Math.exp(logprob) / totalProb) }));

            logprob = top_logprobs[0].logprob;

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

// Merge tokens and their probabilities that only differ by whitespace
function whiteSpaceElim(topLogprobs: Array<[string, number]>): Array<[string, number]> {
    const normalizeToken = (token: string) => token.replaceAll(/\s+/g, '');
    const tokenMap = new Map();
    topLogprobs.forEach(([token, prob]) => {
      const normalizedToken = normalizeToken(token);
      const p = Math.exp(prob);
      if (tokenMap.has(normalizedToken)) {
        tokenMap.get(normalizedToken)[1] += p;
      } else {
        tokenMap.set(normalizedToken, [token, p] );
      }
    });
    // Sort by probability and convert back to logprobs
    const normalizedProbs = Array.from(tokenMap.values()).map(([token, prob]): [string, number] => {
        return [token, Math.log(prob)];
    }).sort((a, b) => b[1] - a[1]);
    return normalizedProbs;
} 

async function fillNthAlternative(
    completions: ProviderCompletions,
    tokenIndex: number,
    alternativeIndex: number,
    maxTokens: number,
    apiKey: string,
): Promise<void> {
    if (tokenIndex < 0 || tokenIndex >= completions.completions[0].steps.length) {
        console.error("Invalid token index:", tokenIndex);
        return;
    }

    const step = completions.completions[0].steps[tokenIndex];
    if (alternativeIndex < 1 || alternativeIndex >= step.top_logprobs.length) {
        console.error("Invalid alternative index:", alternativeIndex);
        return;
    }

    const alternativeToken = step.top_logprobs[alternativeIndex];
    if (!alternativeToken) {
        console.error("No alternative token found for index:", alternativeIndex);
        return;
    }
    const originalTokenText = step.token;
    const originalTokenOffset = step.text_offset;
    const originalPrompt = completions.prompt;
    const originalCompletionText = completions.completions[0].text;
    let altText;

    // If alternativeToken contains any newline, it is not suitable for alternative generation
    if (alternativeToken.token.includes("\n")) {
        // Update the completion preview with the explanation
        step.top_logprobs[alternativeIndex].completionPreview = {
            text: alternativeToken.token,
            explanation: ""
        };
        console.error("Alternative token contains newline, skipping:", alternativeToken.token);
        altText = alternativeToken.token;
    } else {
        const completionPrefix = originalCompletionText.substring(0, step.text_offset);
        const prompt = originalPrompt + completionPrefix + alternativeToken.token;

        console.log(`Generating alternative for token "${originalTokenText}" at index ${tokenIndex} with alternative token "${alternativeToken.token}"`);

        const altCompletion = await getFireworksAICompletion(
            prompt,
            completions.modelID,
            maxTokens,
            apiKey,
            ["\n"], // Stop at newline
        );

        altText = altCompletion.completions[0].text;
        const newlinePos = altText.indexOf('\n');
        if (newlinePos !== -1) {
            altText = altText.substring(0, newlinePos);
        }
        altText = alternativeToken.token + altText; 
    }

    // step.top_logprobs[alternativeIndex].completionPreview = {
    //     text: altText, 
    //     // explanation: alternativeToken.token
    //     explanation: "to be filled..."
    // };
    
    // Fill the AI explanation for the alternative
    const prevNewline = originalCompletionText.lastIndexOf('\n', originalTokenOffset);
    const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
    const nextNewline = originalCompletionText.indexOf('\n', originalTokenOffset);
    const lineEnd = nextNewline === -1 ? originalCompletionText.length : nextNewline;

    const codeToNextLine = originalPrompt + originalCompletionText.substring(0, lineEnd);
    // const lineText = originalCompletionText.substring(lineStart, lineEnd);
    const linePrefix = originalCompletionText.substring(lineStart, originalTokenOffset);
    const altLineText = linePrefix + altText;

    // Get the explanation for the change
    const explanation = await getExplanation(
        codeToNextLine, 
        altLineText,
        apiKey
    );

    // Update the completion preview with the explanation
    step.top_logprobs[alternativeIndex].completionPreview = {
        text: altText,
        explanation: explanation
    };

    console.log(`Filled alternative for token "${originalTokenText}" at index ${tokenIndex} with alternative token "${alternativeToken.token}"`);
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
    const perplexity = Math.pow(2, step.entropy);
    // const n_alternatives = Math.round(perplexity);
    const n_alternatives = 4;

    console.log(`Generating ${n_alternatives} alternatives for token "${tokenStr}" with entropy ${step.entropy}`);
    console.log(`Top logprobs: ${step.top_logprobs.map(lp => `${JSON.stringify(lp.token)}: ${lp.logprob}`).join(", ")}`);
    console.log(`Top probs: ${step.top_logprobs.map(lp => `${lp.token}: ${Math.exp(lp.logprob)}`).join(", ")}`);
    console.log(`Perplexity: ${perplexity}`);
    
    // Create an array of promises for parallel execution
    const alternativePromises = [];
    
    for (let alt_token_idx = 0; alt_token_idx < n_alternatives; alt_token_idx++) {
        // Skip if there aren't enough alternatives
        if (alt_token_idx + 1 >= step.top_logprobs.length) continue;
        
        // Create a promise for each alternative token using fillNthAlternative
        alternativePromises.push(
            fillNthAlternative(
                completions,
                tokenIndex,
                alt_token_idx + 1, // The alternative index (0 is the chosen token)
                maxTokens,
                apiKey
            )
        );
    }
    
    // Wait for all promises to complete in parallel
    await Promise.allSettled(alternativePromises);
}

async function getExplanation(
    existingCode: string,
    change: string,
    apiKey: string,
): Promise<string> {
    const prompt = `I have the following partial snippet of code generated by a model:
\`\`\`
${existingCode}
\`\`\`
I want to change the last line to:
\`\`\`
${change}
\`\`\`
And then allow the model to keep generating from there.

Provide a 1-2 sentence explanation for the change.
Explain the potential difference in the generated code if the change is made.
Also explain if the change would significantly the behavior of the code, or if it would be a minor change, like a comment or a variable name.
`;

    // console.log("Prompt for explanation:", prompt);

    return await getChatCompletion(prompt, apiKey);
}

async function getChatCompletion(
    prompt: string,
    apiKey: string,
): Promise<string> {
    const endpoint = "https://api.fireworks.ai/inference/v1/chat/completions";
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
    };
    // const logit_bias =
    const payload = {
        model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
        // prompt: prompt,
        messages: [
            {role: "user", content: prompt}
        ],
        max_tokens: 128,
        stop: ["\n\n"],
        temperature: 1.0,
        logprobs: 5,
        // logit_bias: {674: -100, 2: -100},
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

    const completionText = response.data.choices[0].message.content;
    // console.log("Chat completion:", completionText);
    return completionText;
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
