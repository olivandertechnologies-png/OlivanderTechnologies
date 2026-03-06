const GROQ_MODEL = "llama-3.1-8b-instant";
const SYSTEM_PROMPT =
  'You are an AI business agent for a NZ sole trader. The user will describe a business situation. Respond with ONLY a JSON object — no preamble, no markdown, no backticks. The JSON must have exactly three fields:\n- "reasoning": one sentence explaining why this action is needed, written as if the agent observed it (e.g. "You haven\'t replied to James\'s quote request in 4 days.")\n- "action": a short label for the proposed action (e.g. "Send follow-up email — James McKenzie")\n- "draft": the full text of the email or message the agent has prepared, written in a natural professional tone, signed off with "Cheers, [Name]"\nThe user\'s plain-language input is the user message.';

function parseGeneratedAction(rawText) {
  const trimmed = rawText.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const parsed = JSON.parse(withoutFence);

  if (
    typeof parsed.reasoning !== "string" ||
    typeof parsed.action !== "string" ||
    typeof parsed.draft !== "string"
  ) {
    throw new Error("Malformed JSON fields");
  }

  return {
    reasoning: parsed.reasoning.trim(),
    title: parsed.action.trim(),
    draft: parsed.draft.trim(),
  };
}

export async function requestGeneratedAction(prompt) {
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;

  if (!groqApiKey) {
    const error = new Error("Missing Groq API key");
    error.code = "missing-api-key";
    throw error;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Groq request failed with ${response.status}`);
  }

  const rawText = data?.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") {
    throw new Error("Missing choice content");
  }

  return parseGeneratedAction(rawText);
}
