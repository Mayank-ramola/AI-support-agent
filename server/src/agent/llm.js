const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Groq's OpenAI-compatible chat API with tool calling. fetchImpl is injectable for tests.
export function createLLM({ apiKey, model, fetchImpl = fetch, retryDelayMs = 800 }) {
  if (!apiKey) return null;

  return {
    async chat({ messages, tools, temperature = 0.2, maxTokens = 1500 }) {
      const body = { model, messages, temperature, max_tokens: maxTokens };
      if (tools?.length) {
        body.tools = tools;
        body.tool_choice = "auto";
        body.parallel_tool_calls = false;
      }
      if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetchImpl("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json();
          const msg = data.choices?.[0]?.message || {};
          const toolCalls = (msg.tool_calls || []).map((tc) => {
            let args = {};
            try {
              args = JSON.parse(tc.function?.arguments || "{}");
            } catch {
              args = {};
            }
            return { id: tc.id, name: tc.function?.name, args };
          });
          return { content: msg.content || "", toolCalls };
        }
        const detail = await res.text().catch(() => "");
        lastError = new Error(`LLM request failed (${res.status}) ${detail.slice(0, 200)}`);
        if (res.status === 429 || res.status >= 500) {
          await sleep(retryDelayMs * 2 ** attempt);
          continue;
        }
        break;
      }
      throw lastError;
    },
  };
}
