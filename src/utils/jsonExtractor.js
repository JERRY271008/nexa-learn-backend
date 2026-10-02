/**
 * The AI model is instructed to reply with raw JSON, but models occasionally wrap
 * it in a markdown code fence or add a stray sentence. This pulls the JSON
 * object/array out of whatever text came back and parses it.
 *
 * Throws if no valid JSON can be found — callers decide how to handle that
 * (retry, fallback, or surface an error) rather than this silently guessing.
 */
function extractJSON(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('No text to parse as JSON.');
  }

  let cleaned = text.trim();

  // Strip a leading/trailing ```json ... ``` or ``` ... ``` fence, if present.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // If the model added any prose around the object/array, slice from the
  // first brace/bracket to the last matching one.
  const firstIdx = cleaned.search(/[{[]/);
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const lastIdx = Math.max(lastBrace, lastBracket);

  if (firstIdx !== -1 && lastIdx !== -1 && lastIdx > firstIdx) {
    cleaned = cleaned.slice(firstIdx, lastIdx + 1);
  }

  return JSON.parse(cleaned);
}

module.exports = { extractJSON };
