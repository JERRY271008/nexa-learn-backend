async function callOpenAI({ system, messages, maxTokens = 1024, temperature = 0.5 }) {
  const inputMessages = [
    {
      role: "system",
      content: system,
    },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const response = await fetch(
    `${process.env.OLLAMA_BASE_URL || "http://localhost:11434"}/api/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.2:3b",
        messages: inputMessages,
        stream: false,
        options: {
          num_predict: maxTokens,
          temperature,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Ollama API ERROR]", response.status, errorText);
    throw new Error("Ollama API request failed.");
  }

  const data = await response.json();

  return data.message?.content?.trim() || "Sorry, I could not generate a response.";
}

module.exports = {
  callOpenAI,
};
