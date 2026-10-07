// Model providers. "anthropic" calls Claude with structured JSON output;
// "demo" is a deterministic keyword engine so the whole product can be tried,
// tested and demonstrated without an API key.
import Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACTION_SCHEMA,
  EXTRACTION_SYSTEM,
  SYNTHESIS_SCHEMA,
  SYNTHESIS_SYSTEM,
  buildExtractionUserMessage,
  buildSynthesisUserMessage,
} from "./prompts.mjs";
import { demoExtract, demoSynthesize } from "./demo.mjs";

export class LlmError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// USD per million tokens (input, output). Used for the owner's cost overview.
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-1": [10, 50],
};

export function estimateCostUsd(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return null;
  const input =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * price[0] + (usage.output_tokens ?? 0) * price[1]) / 1_000_000;
}

export function parseJsonLoose(text) {
  const trimmed = String(text ?? "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new LlmError("invalid_json", "Modellen returnerade inte giltig JSON.");
  }
}

export function createAnthropicProvider(llm, client = new Anthropic({ maxRetries: 3, timeout: 20 * 60 * 1000 })) {

  async function callJson({ system, user, schema, effort }) {
    const params = {
      model: llm.model,
      max_tokens: llm.maxOutputTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort, format: { type: "json_schema", schema } },
    };
    let message;
    try {
      const stream =
        llm.fallbacks === "default"
          ? client.beta.messages.stream({
              ...params,
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            })
          : client.messages.stream(params);
      message = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new LlmError("auth", "AI-nyckeln är ogiltig. Kontrollera ANTHROPIC_API_KEY.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmError("rate_limit", "AI-tjänsten är tillfälligt överbelastad. Försök igen om en stund.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new LlmError("api", `AI-tjänsten svarade med fel ${error.status ?? ""}: ${error.message}`);
      }
      throw error;
    }
    if (message.stop_reason === "refusal") {
      throw new LlmError("refusal", "AI-modellen avböjde att analysera underlaget.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new LlmError("max_tokens", "Svaret blev för långt för ett anrop.");
    }
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      data: parseJsonLoose(text),
      usage: message.usage,
      model: message.model ?? llm.model,
    };
  }

  return {
    name: "anthropic",
    model: llm.model,
    async extract(chunk, index, count) {
      return callJson({
        system: EXTRACTION_SYSTEM,
        user: buildExtractionUserMessage(chunk.text, index, count),
        schema: EXTRACTION_SCHEMA,
        effort: llm.extractEffort,
      });
    },
    async synthesize({ digest, profile, today, daysLeft }) {
      return callJson({
        system: SYNTHESIS_SYSTEM,
        user: buildSynthesisUserMessage(digest, profile, today, daysLeft),
        schema: SYNTHESIS_SCHEMA,
        effort: llm.synthesisEffort,
      });
    },
  };
}

export function createDemoProvider() {
  return {
    name: "demo",
    model: "demo-nyckelordsmotor",
    async extract(chunk) {
      return { data: demoExtract(chunk.text), usage: null, model: "demo" };
    },
    async synthesize(input) {
      return { data: demoSynthesize(input), usage: null, model: "demo" };
    },
  };
}

export function createProvider(llm) {
  return llm.provider === "anthropic" ? createAnthropicProvider(llm) : createDemoProvider();
}
