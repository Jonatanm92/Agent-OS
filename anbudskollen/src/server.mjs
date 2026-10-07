import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { APP_ROOT, loadConfig } from "./config.mjs";
import { Store, isValidId, newId } from "./store.mjs";
import { extractDocument, SUPPORTED_EXTENSIONS } from "./extract.mjs";
import { createProvider } from "./llm.mjs";
import { createAnalyzer, purgeExpired, recoverInterrupted } from "./pipeline.mjs";
import { buildReportView } from "./report.mjs";
import { buildIcs, buildWorkbook } from "./export.mjs";
import { createPayments } from "./payments.mjs";
import { DailyLimiter, burstLimiter, hashIp, isAdmin, requireAdmin, securityHeaders } from "./security.mjs";
import { PROFILE_LABELS } from "./prompts.mjs";
import { buildExampleView } from "./example.mjs";

const PROFILE_FIELDS = Object.keys(PROFILE_LABELS);

function readProfile(body) {
  const profile = {};
  for (const key of PROFILE_FIELDS) {
    const value = typeof body?.[key] === "string" ? body[key].trim().slice(0, 2000) : "";
    if (value) profile[key] = value;
  }
  return profile;
}

function clean(value, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function createApp(overrides = {}) {
  const config = loadConfig(overrides.config);
  const store = overrides.store ?? new Store(config.dataDir);
  const provider = overrides.provider ?? createProvider(config.llm);
  const log = overrides.log ?? console;
  const analyzer = createAnalyzer({ store, provider, config, log });
  const payments = createPayments({ stripe: config.stripe, pricing: config.pricing, company: config.company, fetchImpl: overrides.fetchImpl });
  const limiter = new DailyLimiter();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy ? 1 : false);
  app.use(securityHeaders);
  app.use(express.json({ limit: "200kb" }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.limits.maxFileMb * 1024 * 1024, files: config.limits.maxFiles, fields: 40 },
  });

  const baseUrl = (req) => config.publicUrl || `${req.protocol}://${req.get("host")}`;
  const isUnlocked = (access, req) => config.freeMode || Boolean(access?.paid) || isAdmin(req, config.adminToken);

  // ---------- Public configuration ----------
  app.get("/api/config", (req, res) => {
    res.json({
      brand: config.company.brand,
      company: config.company,
      priceLabel: config.pricing.label,
      priceSek: config.pricing.amountSek,
      vatNote: config.pricing.vatNote,
      paymentsEnabled: payments.enabled,
      invoiceEnabled: config.invoiceEnabled,
      freeMode: config.freeMode,
      engine: provider.name,
      limits: { maxFiles: config.limits.maxFiles, maxFileMb: config.limits.maxFileMb },
      extensions: SUPPORTED_EXTENSIONS,
    });
  });

  app.get("/api/exempel", (req, res) => {
    const example = buildExampleView();
    example.offer = { ...example.offer, priceLabel: config.pricing.label, vatNote: config.pricing.vatNote };
    res.setHeader("Cache-Control", "public, max-age=600");
    res.json(example);
  });

  app.get("/api/health", (req, res) => res.json({ ok: true, engine: provider.name, jobs: analyzer.pending }));

  // ---------- Create analysis ----------
  async function createAnalysis(req, { source, label }) {
    const files = req.files ?? [];
    if (!files.length) throw Object.assign(new Error("Ladda upp minst ett upphandlingsdokument."), { status: 400 });

    const documents = [];
    for (const file of files) documents.push(await extractDocument(file));
    const totalChars = documents.reduce((sum, d) => sum + d.chars, 0);
    if (totalChars < 200) {
      throw Object.assign(new Error("Vi hittade nästan ingen text i dokumenten. Är de inskannade bilder? Ladda upp textbaserade PDF- eller Word-filer."), { status: 422 });
    }
    if (totalChars > config.limits.maxTotalChars) {
      const pages = documents.reduce((sum, d) => sum + d.pages.length, 0);
      throw Object.assign(
        new Error(`Underlaget är för stort för en analys (${pages} sidor). Välj de dokument som innehåller krav och villkor – oftast upphandlingsdokument, kravspecifikation, avtalsvillkor och frågor & svar.`),
        { status: 413 },
      );
    }

    const now = new Date().toISOString();
    const analysis = {
      id: newId(),
      createdAt: now,
      status: "i_ko",
      source,
      engine: provider.name,
      model: provider.model,
      profile: readProfile(req.body),
      ipHash: hashIp(req.ip),
      documents: documents.map((d) => ({
        name: d.name,
        kind: d.kind,
        pages: d.pages.length,
        unit: d.pages[0]?.unit ?? "sida",
        chars: d.chars,
        warning: d.warning ?? null,
      })),
      progress: { step: "I kö", done: 0, total: 0 },
    };
    await store.analyses.put(analysis);
    const token = newId(18);
    const email = clean(req.body?.email, 200);
    await store.access.put({
      id: token,
      token,
      analysisId: analysis.id,
      createdAt: now,
      label: label ?? "",
      source,
      email: isEmail(email) ? email : "",
      paid: false,
    });
    analyzer.start(analysis.id, documents);
    return { token, analysisId: analysis.id };
  }

  function handleUpload(req, res, next) {
    upload.array("files", config.limits.maxFiles)(req, res, (error) => {
      if (!error) return next();
      if (error instanceof multer.MulterError) {
        const message =
          error.code === "LIMIT_FILE_SIZE"
            ? `En fil är större än ${config.limits.maxFileMb} MB.`
            : error.code === "LIMIT_FILE_COUNT"
              ? `Max ${config.limits.maxFiles} filer per analys.`
              : "Uppladdningen kunde inte tas emot.";
        return res.status(413).json({ error: message });
      }
      next(error);
    });
  }

  app.post("/api/analyses", handleUpload, async (req, res, next) => {
    try {
      if (!["on", "true", "1"].includes(String(req.body?.accept ?? ""))) {
        return res.status(400).json({ error: "Godkänn villkoren för att starta analysen." });
      }
      const admin = isAdmin(req, config.adminToken);
      const key = hashIp(req.ip);
      if (!admin) {
        const blocked = limiter.check(key, config.limits.freeAnalysesPerIpPerDay, config.limits.maxAnalysesPerDay);
        if (blocked === "total") return res.status(429).json({ error: "Tjänsten har nått dagens maxkapacitet. Försök igen i morgon eller kontakta oss." });
        if (blocked === "key") return res.status(429).json({ error: "Du har gjort maximalt antal gratisanalyser i dag. Kontakta oss om du behöver fler." });
      }
      const result = await createAnalysis(req, { source: admin ? "admin" : "publik" });
      if (!admin) limiter.hit(key);
      res.status(201).json({ token: result.token, url: `/rapport.html?t=${result.token}` });
    } catch (error) {
      next(error);
    }
  });

  // ---------- Report access ----------
  async function loadAccess(req, res) {
    const token = req.params.token;
    if (!isValidId(token)) {
      res.status(404).json({ error: "Rapporten finns inte." });
      return null;
    }
    const access = await store.access.get(token);
    if (!access) {
      res.status(404).json({ error: "Rapporten finns inte eller har raderats." });
      return null;
    }
    const analysis = await store.analyses.get(access.analysisId);
    if (!analysis) {
      res.status(404).json({ error: "Rapporten finns inte eller har raderats." });
      return null;
    }
    return { access, analysis };
  }

  async function maybeConfirmPayment(req, access) {
    if (access.paid || !payments.enabled) return access;
    const sessionId = clean(req.query.session_id, 200) || access.pendingSessionId;
    if (!sessionId) return access;
    const recentlyChecked = Date.now() - (access.lastPaymentCheck ?? 0) < 15_000;
    if (!req.query.session_id && recentlyChecked) return access;
    try {
      const paid = await payments.verifySession(sessionId, access.token);
      return (
        (await store.access.update(access.token, (a) => {
          a.lastPaymentCheck = Date.now();
          if (paid && !a.paid) {
            a.paid = true;
            a.paidAt = new Date().toISOString();
            a.paidVia = "kort";
            a.amountSek = Math.round((paid.amountTotal ?? config.pricing.amountSek * 100) / 100);
            a.stripeSessionId = paid.sessionId;
            a.buyerEmail = paid.email;
            a.buyerName = paid.name;
          }
        })) ?? access
      );
    } catch (error) {
      log.error?.("[betalning] verifiering misslyckades:", error.message);
      return access;
    }
  }

  function view(analysis, access, req) {
    return buildReportView({
      analysis,
      access,
      unlocked: isUnlocked(access, req),
      previewRequirements: config.limits.previewRequirements,
      pricing: config.pricing,
      invoiceEnabled: config.invoiceEnabled,
      paymentsEnabled: payments.enabled,
    });
  }

  app.get("/api/r/:token", async (req, res, next) => {
    try {
      const loaded = await loadAccess(req, res);
      if (!loaded) return;
      const access = await maybeConfirmPayment(req, loaded.access);
      res.setHeader("Cache-Control", "no-store");
      res.json(view(loaded.analysis, access, req));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/r/:token/checkout", burstLimiter({ windowMs: 60_000, max: 10 }), async (req, res, next) => {
    try {
      const loaded = await loadAccess(req, res);
      if (!loaded) return;
      if (loaded.access.paid) return res.json({ alreadyPaid: true });
      if (loaded.analysis.status !== "klar") return res.status(409).json({ error: "Rapporten är inte klar än." });
      const session = await payments.createCheckout({
        token: loaded.access.token,
        title: loaded.analysis.title,
        baseUrl: baseUrl(req),
      });
      await store.access.update(loaded.access.token, (a) => {
        a.pendingSessionId = session.id;
      });
      res.json({ url: session.url });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/r/:token/invoice", burstLimiter({ windowMs: 60_000, max: 5 }), async (req, res, next) => {
    try {
      if (!config.invoiceEnabled) return res.status(400).json({ error: "Fakturabetalning är inte aktiverad." });
      const loaded = await loadAccess(req, res);
      if (!loaded) return;
      const request = {
        company: clean(req.body?.company, 160),
        orgNumber: clean(req.body?.orgNumber, 20),
        name: clean(req.body?.name, 120),
        email: clean(req.body?.email, 200),
        reference: clean(req.body?.reference, 120),
        invoiceAddress: clean(req.body?.invoiceAddress, 400),
      };
      if (!request.company || !request.orgNumber || !isEmail(request.email)) {
        return res.status(400).json({ error: "Fyll i företag, organisationsnummer och en giltig e-postadress." });
      }
      await store.access.update(loaded.access.token, (a) => {
        a.invoiceRequest = { ...request, requestedAt: new Date().toISOString() };
      });
      await store.addLead({ kind: "faktura", token: loaded.access.token, title: loaded.analysis.title ?? "", ...request });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/r/:token/profile", async (req, res, next) => {
    try {
      const loaded = await loadAccess(req, res);
      if (!loaded) return;
      if (loaded.analysis.status !== "klar") return res.status(409).json({ error: "Rapporten är inte klar än." });
      if (loaded.access.personalizing) return res.status(409).json({ error: "Anpassningen pågår redan." });
      const profile = readProfile(req.body);
      if (!Object.keys(profile).length) return res.status(400).json({ error: "Beskriv ert företag i minst ett fält." });
      const admin = isAdmin(req, config.adminToken);
      const key = hashIp(req.ip);
      if (!admin) {
        const blocked = limiter.check(key, config.limits.freeAnalysesPerIpPerDay * 2, config.limits.maxAnalysesPerDay * 2);
        if (blocked) return res.status(429).json({ error: "För många anpassningar i dag. Försök igen i morgon." });
        limiter.hit(key);
      }
      await store.access.update(loaded.access.token, (a) => {
        a.personalizing = true;
        a.personalizeError = null;
      });
      analyzer.personalize(loaded.access.token, profile);
      res.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  async function exportGuard(req, res) {
    const loaded = await loadAccess(req, res);
    if (!loaded) return null;
    if (loaded.analysis.status !== "klar") {
      res.status(409).json({ error: "Rapporten är inte klar än." });
      return null;
    }
    if (!isUnlocked(loaded.access, req)) {
      res.status(402).json({ error: "Lås upp rapporten för att ladda ner den." });
      return null;
    }
    return loaded;
  }

  const fileSlug = (title) =>
    (title || "upphandling")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "upphandling";

  app.get("/api/r/:token/export.xlsx", async (req, res, next) => {
    try {
      const loaded = await exportGuard(req, res);
      if (!loaded) return;
      const buffer = await buildWorkbook(view(loaded.analysis, loaded.access, req), config.company.brand);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="kravmatris-${fileSlug(loaded.analysis.title)}.xlsx"`);
      res.send(Buffer.from(buffer));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/r/:token/export.ics", async (req, res, next) => {
    try {
      const loaded = await exportGuard(req, res);
      if (!loaded) return;
      const host = (config.publicUrl || `https://${req.get("host")}`).replace(/^https?:\/\//, "");
      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="datum-${fileSlug(loaded.analysis.title)}.ics"`);
      res.send(buildIcs(view(loaded.analysis, loaded.access, req), config.company.brand, host));
    } catch (error) {
      next(error);
    }
  });

  // ---------- Contact / leads ----------
  app.post("/api/contact", burstLimiter({ windowMs: 60_000, max: 5 }), async (req, res, next) => {
    try {
      const lead = {
        kind: "kontakt",
        name: clean(req.body?.name, 120),
        company: clean(req.body?.company, 160),
        email: clean(req.body?.email, 200),
        phone: clean(req.body?.phone, 40),
        message: clean(req.body?.message, 2000),
      };
      if (!isEmail(lead.email)) return res.status(400).json({ error: "Ange en giltig e-postadress." });
      await store.addLead(lead);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  // ---------- Owner console ----------
  const admin = express.Router();
  admin.use(requireAdmin(config.adminToken));

  admin.get("/overview", async (req, res, next) => {
    try {
      const [analyses, accesses, leads] = await Promise.all([store.analyses.list(), store.access.list(), store.listLeads()]);
      const byAnalysis = new Map();
      for (const a of accesses) {
        if (!byAnalysis.has(a.analysisId)) byAnalysis.set(a.analysisId, []);
        byAnalysis.get(a.analysisId).push({
          token: a.token,
          label: a.label,
          createdAt: a.createdAt,
          paid: Boolean(a.paid),
          paidVia: a.paidVia ?? null,
          paidAt: a.paidAt ?? null,
          amountSek: a.amountSek ?? 0,
          email: a.buyerEmail ?? a.email ?? "",
          invoiceRequest: a.invoiceRequest ?? null,
          personalized: Boolean(a.synthesis),
        });
      }
      const paid = accesses.filter((a) => a.paid && a.paidVia !== "gratis");
      const today = new Date().toISOString().slice(0, 10);
      res.json({
        engine: provider.name,
        model: provider.model,
        paymentsEnabled: payments.enabled,
        stats: {
          analyses: analyses.length,
          analysesToday: analyses.filter((a) => String(a.createdAt).startsWith(today)).length,
          paidReports: paid.length,
          revenueSek: paid.reduce((sum, a) => sum + (a.amountSek ?? 0), 0),
          openInvoiceRequests: accesses.filter((a) => a.invoiceRequest && !a.paid).length,
          aiCostUsd: Number(analyses.reduce((sum, a) => sum + (a.costUsd ?? 0), 0).toFixed(2)),
        },
        analyses: analyses.map((a) => ({
          id: a.id,
          title: a.title ?? "",
          status: a.status,
          source: a.source,
          createdAt: a.createdAt,
          documents: a.documents,
          requirements: a.extraction?.requirements?.length ?? 0,
          recommendation: a.synthesis?.recommendation ?? null,
          score: a.synthesis?.score ?? null,
          costUsd: a.costUsd ?? null,
          durationMs: a.durationMs ?? null,
          error: a.error ?? null,
          shares: byAnalysis.get(a.id) ?? [],
        })),
        leads: leads.slice(0, 200),
      });
    } catch (error) {
      next(error);
    }
  });

  admin.post("/analyses", handleUpload, async (req, res, next) => {
    try {
      const result = await createAnalysis(req, { source: "admin", label: clean(req.body?.label, 120) });
      res.status(201).json({ token: result.token, url: `/rapport.html?t=${result.token}` });
    } catch (error) {
      next(error);
    }
  });

  admin.post("/analyses/:id/shares", async (req, res, next) => {
    try {
      const analysis = await store.analyses.get(req.params.id);
      if (!analysis) return res.status(404).json({ error: "Analysen finns inte." });
      const token = newId(18);
      await store.access.put({
        id: token,
        token,
        analysisId: analysis.id,
        createdAt: new Date().toISOString(),
        label: clean(req.body?.label, 120),
        source: "delning",
        paid: false,
      });
      res.status(201).json({ token, url: `${baseUrl(req)}/rapport.html?t=${token}` });
    } catch (error) {
      next(error);
    }
  });

  admin.post("/access/:token/unlock", async (req, res, next) => {
    try {
      const via = ["faktura", "manuell", "gratis"].includes(req.body?.via) ? req.body.via : "manuell";
      const amount = Number.isFinite(Number(req.body?.amountSek)) ? Math.max(0, Math.round(Number(req.body.amountSek))) : config.pricing.amountSek;
      const updated = await store.access.update(req.params.token, (a) => {
        a.paid = true;
        a.paidAt = new Date().toISOString();
        a.paidVia = via;
        a.amountSek = via === "gratis" ? 0 : amount;
      });
      if (!updated) return res.status(404).json({ error: "Länken finns inte." });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  admin.post("/access/:token/lock", async (req, res, next) => {
    try {
      const updated = await store.access.update(req.params.token, (a) => {
        a.paid = false;
        a.paidVia = null;
        a.amountSek = 0;
      });
      if (!updated) return res.status(404).json({ error: "Länken finns inte." });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  admin.delete("/analyses/:id", async (req, res, next) => {
    try {
      const analysis = await store.analyses.get(req.params.id);
      if (!analysis) return res.status(404).json({ error: "Analysen finns inte." });
      const accesses = (await store.access.list()).filter((a) => a.analysisId === analysis.id);
      for (const a of accesses) await store.access.remove(a.token);
      await store.analyses.remove(analysis.id);
      res.json({ ok: true, removedLinks: accesses.length });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/admin", admin);
  app.use("/api", (req, res) => res.status(404).json({ error: "Okänd adress." }));

  // ---------- Static site ----------
  app.use(express.static(path.join(APP_ROOT, "public"), { extensions: ["html"], maxAge: "5m" }));

  // ---------- Errors ----------
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) log.error?.("[fel]", error);
    res.status(status).json({ error: error?.status ? error.message : "Ett oväntat fel inträffade." });
  });

  return { app, config, store, analyzer, provider, payments, ready: recoverInterrupted(store) };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // Load anbudskollen/.env when present (Node 20.12+); real env vars win.
  try {
    process.loadEnvFile?.(path.join(APP_ROOT, ".env"));
  } catch {
    /* no .env file */
  }
  const { app, config, store, provider, payments, ready } = createApp();
  await ready;
  const purge = () => purgeExpired(store, config.retentionDays).then((n) => n && console.log(`[gallring] raderade ${n} analyser äldre än ${config.retentionDays} dagar`)).catch((e) => console.error("[gallring]", e));
  purge();
  setInterval(purge, 12 * 60 * 60 * 1000).unref();
  app.listen(config.port, config.host, () => {
    console.log(`Anbudskollen kör på http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
    console.log(`  Analysmotor: ${provider.name === "anthropic" ? `Claude (${provider.model})` : "DEMOLÄGE – sätt ANTHROPIC_API_KEY för riktig AI-analys"}`);
    console.log(`  Kortbetalning: ${payments.enabled ? "Stripe aktiv" : "av (sätt STRIPE_SECRET_KEY)"}${config.freeMode ? " · GRATISLÄGE: alla rapporter är upplåsta" : ""}`);
    console.log(`  Ägarpanel: ${config.adminToken ? "/admin.html" : "av (sätt ADMIN_TOKEN)"}`);
  });
}
