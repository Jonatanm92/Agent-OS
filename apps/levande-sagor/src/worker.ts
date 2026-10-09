/**
 * Levande sagor – server.
 *
 * Serves the app (static files in ./public) and one API route, POST /api/claude,
 * which forwards a story or illustration request to Claude. The Anthropic API key
 * stays on the server; the phone only knows a short family code (APP_CODE).
 * Nothing that passes through here is stored or logged.
 */
import Anthropic from "@anthropic-ai/sdk";

interface Env {
  ANTHROPIC_API_KEY: string;
  APP_CODE: string;
  /** Only for local testing against a mock; leave unset in production. */
  ANTHROPIC_BASE_URL?: string;
  ASSETS: Fetcher;
}

interface ClaudeRequest {
  prompt?: unknown;
  image?: { media_type?: unknown; data?: unknown } | null;
}

const MODEL = "claude-opus-5-5";
const MAX_PROMPT_CHARS = 60_000;
const MAX_IMAGE_BASE64 = 7_000_000; // about 5 MB of JPEG
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** Compares the family code without leaking timing. */
function sameCode(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function handleClaude(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json(405, { code: "invalid_request", message: "POST only" });
  if (!env.ANTHROPIC_API_KEY || !env.APP_CODE) return json(500, { code: "not_configured", message: "Server secrets are missing" });
  if (!sameCode(request.headers.get("x-app-code") ?? "", env.APP_CODE)) {
    return json(401, { code: "not_granted", message: "Wrong or missing family code" });
  }

  let body: ClaudeRequest;
  try {
    body = (await request.json()) as ClaudeRequest;
  } catch {
    return json(400, { code: "invalid_request", message: "Body must be JSON" });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > MAX_PROMPT_CHARS) {
    return json(400, { code: "invalid_request", message: "prompt must be a non-empty string" });
  }

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (body.image) {
    const { media_type, data } = body.image;
    if (typeof data !== "string" || data.length > MAX_IMAGE_BASE64 || !IMAGE_TYPES.includes(media_type as ImageType)) {
      return json(400, { code: "image_rejected", message: "Unsupported or too large image" });
    }
    content.push({ type: "image", source: { type: "base64", media_type: media_type as ImageType, data } });
  }
  content.push({ type: "text", text: body.prompt });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: env.ANTHROPIC_BASE_URL || undefined });
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: "medium" },
      // On a policy decline, let the API retry on a suitable model instead of failing the story.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") return json(422, { code: "refused", message: "Claude declined this request" });
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text.trim()) return json(502, { code: "empty_completion", message: "No text in the reply" });
    return json(200, { text, truncated: message.stop_reason === "max_tokens" });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json(429, { code: "rate_limited", message: "Too many requests" });
    if (error instanceof Anthropic.BadRequestError) return json(400, { code: "invalid_request", message: error.message });
    if (error instanceof Anthropic.AuthenticationError) return json(500, { code: "not_configured", message: "The server's API key was rejected" });
    if (error instanceof Anthropic.APIError) return json(502, { code: "upstream_error", message: `Claude API error ${error.status}` });
    return json(502, { code: "upstream_error", message: "Could not reach Claude" });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/claude") return handleClaude(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
