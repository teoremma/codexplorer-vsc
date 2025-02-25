import axios from "axios";

export { getCompletion };

async function getCompletion(
    prompt: string,
    modelID: string,
    maxTokens: number,
    apiKey: string,
): Promise<string> {
	const endpoint = "https://api.fireworks.ai/inference/v1/completions";	
	const headers = {
		"Content-Type": "application/json",
		"Authorization": `Bearer ${apiKey}`
	};
	const payload = {
		model: modelID,
		prompt: prompt,
		max_tokens: maxTokens,
		stop: ["\n\n", "```"],
        temperature: 0.0,
        logprobs: 5,
	};
	try {
		const response = await axios.post(endpoint, payload, { headers });
        console.log(response);
		return response.data.choices[0].text;
	} catch (error) {
		if (axios.isAxiosError(error) && error.response) {
			console.error("Error response:", error.response.data);
		}
		throw error;
	}
}