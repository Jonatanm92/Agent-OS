// Central configuration. Everything is driven by environment variables so the
// same build runs locally, in Docker and on a PaaS without code changes.
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, "..");

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name, fallback) {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "ja", "on"].includes(raw);
}

function str(name, fallback = "") {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw.trim();
}

export function loadConfig(overrides = {}) {
  const hasAnthropicCredentials = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
  const provider = str("LLM_PROVIDER", hasAnthropicCredentials ? "anthropic" : "demo");

  const config = {
    host: str("HOST", "0.0.0.0"),
    port: int("PORT", 3020),
    publicUrl: str("PUBLIC_URL", "").replace(/\/+$/, ""),
    dataDir: path.resolve(str("DATA_DIR", path.join(APP_ROOT, "data"))),

    // Owner console
    adminToken: str("ADMIN_TOKEN", ""),

    // Analysis engine
    llm: {
      provider, // "anthropic" | "demo"
      model: str("ANALYS_MODELL", "claude-opus-5-5"),
      extractEffort: str("ANALYS_EFFORT_EXTRAKTION", "medium"),
      synthesisEffort: str("ANALYS_EFFORT_SYNTES", "high"),
      // Server-side refusal fallback (Claude API only). Set to "off" when the
      // traffic goes through a proxy that does not understand the beta.
      fallbacks: str("ANALYS_FALLBACKS", "default"),
      maxOutputTokens: int("ANALYS_MAX_OUTPUT_TOKENS", 48000),
      chunkChars: int("ANALYS_CHUNK_TECKEN", 60000),
      concurrency: int("ANALYS_PARALLELLA_ANROP", 4),
    },
    limits: {
      maxFiles: int("MAX_FILER", 15),
      maxFileMb: int("MAX_FILSTORLEK_MB", 30),
      maxTotalChars: int("MAX_TECKEN_PER_ANALYS", 1_500_000),
      freeAnalysesPerIpPerDay: int("GRATIS_ANALYSER_PER_IP_OCH_DYGN", 2),
      maxAnalysesPerDay: int("MAX_ANALYSER_PER_DYGN", 40),
      maxConcurrentJobs: int("MAX_SAMTIDIGA_JOBB", 2),
      previewRequirements: int("FORHANDSVISNING_ANTAL_KRAV", 6),
    },

    // Commerce
    pricing: {
      amountSek: int("PRIS_SEK", 995),
      label: str("PRIS_TEXT", "995 kr exkl. moms"),
      vatNote: str("MOMS_TEXT", "Priset är exklusive moms."),
    },
    stripe: {
      secretKey: str("STRIPE_SECRET_KEY", ""),
      apiBase: str("STRIPE_API_BASE", "https://api.stripe.com"),
    },
    invoiceEnabled: bool("FAKTURA_AKTIVERAD", true),
    // When true, every report is fully unlocked without payment (useful for
    // the owner's own pilots or before a payment route exists).
    freeMode: bool("GRATISLAGE", false),

    // Seller identity shown on legal pages and receipts.
    company: {
      brand: str("VARUMARKE", "Anbudskollen"),
      legalName: str("FORETAGSNAMN", "[Ditt företagsnamn]"),
      orgNumber: str("ORGANISATIONSNUMMER", "[Org.nr]"),
      email: str("KONTAKT_EPOST", "hej@anbudskollen.se"),
      address: str("FORETAGSADRESS", "[Adress]"),
    },
    retentionDays: int("LAGRINGSTID_DAGAR", 365),
    trustProxy: bool("TRUST_PROXY", true),
    ...overrides,
  };
  return config;
}
