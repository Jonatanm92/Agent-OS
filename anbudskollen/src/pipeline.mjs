// Orchestrates an analysis: chunk -> parallel extraction -> merge -> synthesis.
// Raw document text only lives in memory for the duration of the job.
import { buildChunks, splitChunk } from "./chunk.mjs";
import { LlmError, estimateCostUsd } from "./llm.mjs";
import {
  buildDigest,
  daysBetween,
  deriveTitle,
  finalizeSynthesis,
  findDeadline,
  mergeExtractions,
  todayInSweden,
} from "./report.mjs";

function hasProfileContent(profile) {
  return Boolean(profile && Object.values(profile).some((v) => String(v ?? "").trim()));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function addUsage(total, usage) {
  if (!usage) return total;
  for (const key of ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]) {
    total[key] = (total[key] ?? 0) + (usage[key] ?? 0);
  }
  return total;
}

function friendlyError(error) {
  if (error instanceof LlmError) return error.message;
  if (error?.status && error.message) return error.message;
  return "Något gick fel under analysen. Försök igen eller kontakta oss.";
}

export function createAnalyzer({ store, provider, config, log = console }) {
  const queue = [];
  let running = 0;

  function enqueue(task) {
    return new Promise((resolve) => {
      queue.push({ task, resolve });
      pump();
    });
  }

  function pump() {
    while (running < config.limits.maxConcurrentJobs && queue.length) {
      const { task, resolve } = queue.shift();
      running += 1;
      task()
        .catch((error) => log.error?.("[jobb]", error))
        .finally(() => {
          running -= 1;
          resolve();
          pump();
        });
    }
  }

  async function extractWithSplit(chunk, index, count, depth = 0) {
    try {
      return [await provider.extract(chunk, index, count)];
    } catch (error) {
      if (error instanceof LlmError && error.code === "max_tokens" && depth < 3) {
        const halves = splitChunk(chunk);
        if (halves) {
          const results = [];
          for (const half of halves) results.push(...(await extractWithSplit(half, index, count, depth + 1)));
          return results;
        }
      }
      throw error;
    }
  }

  async function synthesize({ extraction, documents, profile }) {
    const today = todayInSweden();
    const deadline = findDeadline(extraction.dates);
    const daysLeft = deadline ? daysBetween(today, deadline.date) : null;
    const withProfile = hasProfileContent(profile);
    const { data, usage, model } = await provider.synthesize({
      digest: buildDigest(extraction, documents),
      profile: withProfile ? profile : null,
      today,
      daysLeft,
    });
    const synthesis = finalizeSynthesis(data, {
      requirements: extraction.requirements,
      daysLeft,
      hasProfile: withProfile,
    });
    synthesis.profileUsed = withProfile;
    synthesis.generatedAt = new Date().toISOString();
    synthesis.daysLeft = daysLeft;
    return { synthesis, usage, model };
  }

  async function run(analysisId, documents) {
    const started = Date.now();
    const usage = {};
    try {
      const chunks = buildChunks(documents, config.llm.chunkChars);
      if (!chunks.length) throw Object.assign(new Error("Dokumenten innehåller ingen läsbar text."), { status: 422 });
      await store.analyses.update(analysisId, (a) => {
        a.status = "analyserar";
        a.progress = { step: "Läser och extraherar krav", done: 0, total: chunks.length };
      });

      let done = 0;
      const parts = await mapLimit(chunks, config.llm.concurrency, async (chunk, index) => {
        const results = await extractWithSplit(chunk, index, chunks.length);
        for (const r of results) addUsage(usage, r.usage);
        done += 1;
        await store.analyses.update(analysisId, (a) => {
          a.progress = { step: "Läser och extraherar krav", done, total: chunks.length };
        });
        return results.map((r) => r.data);
      });

      const extraction = mergeExtractions(parts.flat(), documents.map((d) => d.name));
      await store.analyses.update(analysisId, (a) => {
        a.status = "sammanstaller";
        a.progress = { step: "Bedömer go/avstå och sammanställer rapport", done: chunks.length, total: chunks.length };
      });

      const analysis = await store.analyses.get(analysisId);
      const docMeta = documents.map((d) => ({ name: d.name, pages: d.pages.length }));
      const { synthesis, usage: synthUsage } = await synthesize({ extraction, documents: docMeta, profile: analysis?.profile });
      addUsage(usage, synthUsage);

      await store.analyses.update(analysisId, (a) => {
        a.status = "klar";
        a.progress = null;
        a.extraction = extraction;
        a.synthesis = synthesis;
        a.title = deriveTitle(extraction, documents[0]?.name ?? "");
        a.usage = usage;
        a.costUsd = estimateCostUsd(provider.model, usage);
        a.durationMs = Date.now() - started;
        a.completedAt = new Date().toISOString();
      });
      log.info?.(`[analys] ${analysisId} klar på ${Math.round((Date.now() - started) / 1000)} s, ${extraction.requirements.length} krav`);
    } catch (error) {
      log.error?.(`[analys] ${analysisId} misslyckades:`, error);
      await store.analyses.update(analysisId, (a) => {
        a.status = "fel";
        a.progress = null;
        a.error = friendlyError(error);
        a.usage = usage;
      });
    }
  }

  async function personalize(token, profile) {
    const access = await store.access.get(token);
    if (!access) return;
    try {
      const analysis = await store.analyses.get(access.analysisId);
      const docMeta = (analysis.documents ?? []).map((d) => ({ name: d.name, pages: d.pages }));
      const { synthesis, usage } = await synthesize({ extraction: analysis.extraction, documents: docMeta, profile });
      await store.access.update(token, (a) => {
        a.synthesis = synthesis;
        a.profile = profile;
        a.personalizing = false;
        a.personalizeError = null;
      });
      await store.analyses.update(access.analysisId, (a) => {
        a.usage = addUsage(a.usage ?? {}, usage);
        a.costUsd = estimateCostUsd(provider.model, a.usage);
      });
    } catch (error) {
      log.error?.(`[profil] ${token} misslyckades:`, error);
      await store.access.update(token, (a) => {
        a.personalizing = false;
        a.personalizeError = friendlyError(error);
      });
    }
  }

  return {
    start(analysisId, documents) {
      return enqueue(() => run(analysisId, documents));
    },
    personalize(token, profile) {
      return enqueue(() => personalize(token, profile));
    },
    get pending() {
      return queue.length + running;
    },
  };
}

// Jobs do not survive a restart (documents are never written to disk), so any
// analysis left mid-flight is marked as failed with a clear message.
export async function recoverInterrupted(store) {
  const analyses = await store.analyses.list();
  for (const a of analyses) {
    if (["i_ko", "analyserar", "sammanstaller"].includes(a.status)) {
      await store.analyses.update(a.id, (r) => {
        r.status = "fel";
        r.progress = null;
        r.error = "Analysen avbröts eftersom tjänsten startades om. Ladda upp dokumenten igen – det kostar inget extra.";
      });
    }
  }
  const accesses = await store.access.list();
  for (const a of accesses) {
    if (a.personalizing) {
      await store.access.update(a.token ?? a.id, (r) => {
        r.personalizing = false;
      });
    }
  }
}

// Enforces the retention promised in the privacy policy.
export async function purgeExpired(store, retentionDays, now = Date.now()) {
  if (!retentionDays || retentionDays <= 0) return 0;
  const cutoff = now - retentionDays * 86_400_000;
  const analyses = await store.analyses.list();
  const accesses = await store.access.list();
  let removed = 0;
  for (const a of analyses) {
    if (Date.parse(a.createdAt) < cutoff) {
      for (const link of accesses.filter((x) => x.analysisId === a.id)) await store.access.remove(link.token);
      await store.analyses.remove(a.id);
      removed += 1;
    }
  }
  return removed;
}
