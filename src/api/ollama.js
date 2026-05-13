// src/api/ollama.js
// ─────────────────────────────────────────────────────────────
// All LLM calls go through this file.
// Switched from Ollama to Google Gemini API.
// Same interface — no other files need to change.
//   RIVAL       → gemini-1.5-pro   (strong argumentative reasoning)
//   FACILITATOR → gemini-1.5-flash (fast, empathetic)
//   ROUTER      → gemini-1.5-flash (lightweight decision-making)
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY = "";
const GEMINI_BASE = "https://api.groq.com/openai/v1";

export const MODELS = {
  rival: "llama-3.3-70b-versatile",
  facilitator: "llama-3.1-8b-instant",
  router: "llama-3.1-8b-instant",
};

export async function callOllama(model, systemPrompt, messages) {
  const response = await fetch(`${GEMINI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export function parseJSON(raw, fallback) {
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return fallback;
  }
}
