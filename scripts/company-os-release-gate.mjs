#!/usr/bin/env node

/**
 * Company OS release gate
 *
 * This gate exists to prevent a professional-looking dashboard from being
 * mistaken for an operational AI company. It runs the repository's own
 * verification chain and then checks that the executable source contains the
 * minimum company, Oracle, factory, governance, revenue-truth and owner-gate
 * capabilities required by the product contract.
 *
 * It intentionally does not contact customers, spend money, publish, deploy,
 * push Git branches or use live provider credentials.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const reportDir = join(root, "reports", "release-gate");
mkdirSync(reportDir, { recursive: true });

const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md",
  ".sql", ".yml", ".yaml", ".ps1", ".sh", ".css",
]);
const ignoredDirectories = new Set([
  ".git", "node_modules", "dist", "build", "coverage", ".next", ".vite",
  ".foundry", "reports",
]);

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(absolute));
    else if (entry.isFile() && textExtensions.has(extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

function run(command, args, label) {
  const startedAt = Date.now();
  try {
    const output = execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "test" },
      maxBuffer: 20 * 1024 * 1024,
    });
    return { label, ok: true, durationMs: Date.now() - startedAt, output: output.slice(-12000) };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return {
      label,
      ok: false,
      durationMs: Date.now() - startedAt,
      output: `${stdout}\n${stderr}`.slice(-20000),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const packagePath = join(root, "package.json");
if (!existsSync(packagePath)) {
  console.error("Release gate failed: root package.json is missing.");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const scripts = packageJson.scripts || {};
const commandResults = [];

if (scripts.verify) {
  commandResults.push(run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "verify"], "npm run verify"));
} else {
  for (const scriptName of ["typecheck", "test", "build"]) {
    if (scripts[scriptName]) {
      commandResults.push(run(
        process.platform === "win32" ? "npm.cmd" : "npm",
        scriptName === "test" ? ["test"] : ["run", scriptName],
        scriptName === "test" ? "npm test" : `npm run ${scriptName}`,
      ));
      if (!commandResults.at(-1).ok) break;
    }
  }
}

if (commandResults.length === 0) {
  commandResults.push({
    label: "repository verification",
    ok: false,
    durationMs: 0,
    output: "No verify, typecheck, test or build script exists at the repository root.",
  });
}

const files = listSourceFiles(root);
const documents = files.map((absolute) => ({
  absolute,
  path: relative(root, absolute).replaceAll("\\", "/"),
  text: readFileSync(absolute, "utf8"),
}));
const corpus = documents.map(({ path, text }) => `\n/* FILE:${path} */\n${text}`).join("\n");

const capabilityContract = [
  {
    id: "company-model",
    name: "Persistent company, goals, missions and dependencies",
    all: [/compan(?:y|ies)/i, /mission/i, /goal/i],
    any: [/dependenc/i, /blocked[_ -]?by/i, /parent[_ -]?(?:task|mission)/i],
  },
  {
    id: "agent-runtime",
    name: "Durable agent runs with lifecycle state",
    all: [/agent/i, /run/i],
    any: [/heartbeat/i, /queued/i, /running/i, /cancel(?:led|ation)?/i, /retry/i],
  },
  {
    id: "oracle",
    name: "Evidence-preserving Oracle decisions",
    all: [/oracle/i, /evidence/i, /source/i],
    any: [/VALIDATE[_ ]?FIRST/i, /BUILD/i, /HOLD/i, /KILL/i],
  },
  {
    id: "owner-gates",
    name: "Owner approval gates for consequential actions",
    all: [/owner/i, /approv/i],
    any: [/pending/i, /reject/i, /gate/i, /consequential/i],
  },
  {
    id: "factory-isolation",
    name: "Isolated coding factory and bounded repair loop",
    all: [/factory/i],
    any: [/worktree/i, /single.?writer/i, /repair.?cycle/i, /verification.?command/i],
  },
  {
    id: "completion-evidence",
    name: "Test and completion evidence rather than self-reported done",
    all: [/test/i],
    any: [/sha256/i, /createHash/i, /proof/i, /verification/i, /artifact/i],
  },
  {
    id: "council",
    name: "Council governance with dissent and final recommendation",
    all: [/council/i],
    any: [/dissent/i, /vote/i, /recommendation/i, /verdict/i],
  },
  {
    id: "revenue-truth",
    name: "Actual and simulated revenue kept separate",
    all: [/revenue/i],
    any: [/simulat/i, /actual/i, /gross/i, /net.?payout/i, /ledger/i],
  },
  {
    id: "cost-controls",
    name: "Provider cost, token or budget controls",
    all: [/cost|budget|token/i],
    any: [/provider/i, /limit/i, /spent/i, /usage/i],
  },
  {
    id: "audit-security",
    name: "Audit trail and bounded execution",
    all: [/audit/i],
    any: [/allowlist/i, /path.?contain/i, /loopback/i, /127\.0\.0\.1/i, /shell\s*:\s*false/i],
  },
  {
    id: "control-rooms",
    name: "Operational control rooms share one source of truth",
    all: [/Command Deck/i, /Company/i, /Oracle/i, /Factory/i],
    any: [/Council/i, /Revenue/i, /Systems/i],
  },
];

function matchingFiles(pattern) {
  return documents.filter(({ text }) => pattern.test(text)).map(({ path }) => path).slice(0, 12);
}

const capabilityResults = capabilityContract.map((capability) => {
  const missingAll = capability.all.filter((pattern) => !pattern.test(corpus)).map(String);
  const anyMatched = capability.any.some((pattern) => pattern.test(corpus));
  const evidencePatterns = [...capability.all, ...capability.any].filter((pattern) => pattern.test(corpus));
  const evidenceFiles = [...new Set(evidencePatterns.flatMap(matchingFiles))].slice(0, 20);
  return {
    id: capability.id,
    name: capability.name,
    ok: missingAll.length === 0 && anyMatched,
    missingAll,
    anyMatched,
    evidenceFiles,
  };
});

const safetyChecks = [
  {
    id: "no-live-secret-commit",
    name: "No obvious live secret is committed",
    ok: !/(?:sk|pk)_(?:live|prod)_[A-Za-z0-9_-]{12,}|OPENAI_API_KEY\s*=\s*[^\s"'<>{}]+/i.test(corpus),
  },
  {
    id: "no-automatic-external-action-contract",
    name: "Owner boundary for push/deploy/spend/contact is documented",
    ok: /(?:do not|never|must not|cannot).{0,100}(?:push|deploy|spend|contact)|owner.{0,100}(?:push|deploy|spend|contact)/is.test(corpus),
  },
  {
    id: "gitignore-env",
    name: ".env is ignored",
    ok: existsSync(join(root, ".gitignore")) && /^\.env(?:\*|$)|^\.env$/m.test(readFileSync(join(root, ".gitignore"), "utf8")),
  },
];

const oldProductTerms = [
  "Guldtand", "JMGToneLab", "Periphery Omega", "Thallbyssal", "Creator Release Tool",
];
const defaultUiDocuments = documents.filter(({ path }) =>
  /client\/src\/(?:App|main|components\/(?:Sidebar|MissionControl|Command|Company|Oracle|Factory))/i.test(path),
);
const defaultUiCorpus = defaultUiDocuments.map(({ text }) => text).join("\n");
const residueResults = oldProductTerms.map((term) => ({
  term,
  ok: !defaultUiCorpus.toLowerCase().includes(term.toLowerCase()),
}));

const commandOk = commandResults.every(({ ok }) => ok);
const capabilitiesOk = capabilityResults.every(({ ok }) => ok);
const safetyOk = safetyChecks.every(({ ok }) => ok);
const neutralOk = residueResults.every(({ ok }) => ok);
const passed = commandOk && capabilitiesOk && safetyOk && neutralOk;

const sourceDigest = createHash("sha256")
  .update(documents.map(({ path, text }) => `${path}\0${text}`).join("\0"))
  .digest("hex");

const report = {
  generatedAt: new Date().toISOString(),
  repository: packageJson.name || "Agent-OS",
  sourceDigest,
  passed,
  commandOk,
  capabilitiesOk,
  safetyOk,
  neutralOk,
  commandResults,
  capabilityResults,
  safetyChecks,
  residueResults,
};

writeFileSync(join(reportDir, "company-os-release-gate.json"), `${JSON.stringify(report, null, 2)}\n`);

const markdown = [
  "# Company OS release gate",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  `Verdict: **${passed ? "PASS" : "FAIL"}**`,
  "",
  `Source SHA-256: \`${sourceDigest}\``,
  "",
  "## Repository commands",
  "",
  ...commandResults.map((item) => `- ${item.ok ? "PASS" : "FAIL"} — \`${item.label}\` (${item.durationMs} ms)`),
  "",
  "## Operational capability contract",
  "",
  ...capabilityResults.map((item) =>
    `- ${item.ok ? "PASS" : "FAIL"} — **${item.name}**${item.evidenceFiles.length ? ` — ${item.evidenceFiles.map((file) => `\`${file}\``).join(", ")}` : ""}`,
  ),
  "",
  "## Safety invariants",
  "",
  ...safetyChecks.map((item) => `- ${item.ok ? "PASS" : "FAIL"} — ${item.name}`),
  "",
  "## Neutral default UI",
  "",
  ...residueResults.map((item) => `- ${item.ok ? "PASS" : "FAIL"} — old project term \`${item.term}\` is absent from the default control rooms`),
  "",
  "## Boundary",
  "",
  "Passing this gate proves the checked source and test/build chain satisfy the repository contract. A first real local provider-adapter run still requires the owner's machine and credentials; it must be recorded separately as runtime evidence.",
  "",
].join("\n");

writeFileSync(join(reportDir, "company-os-release-gate.md"), markdown);

if (!passed) {
  console.error(markdown);
  for (const item of commandResults.filter(({ ok }) => !ok)) {
    console.error(`\n--- ${item.label} output ---\n${item.output}`);
  }
  process.exit(1);
}

console.log(markdown);
