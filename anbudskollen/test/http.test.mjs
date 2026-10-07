import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makePdf } from "./helpers/pdf.mjs";
import { createApp } from "../src/server.mjs";
import { loadConfig } from "../src/config.mjs";
import { createDemoProvider } from "../src/llm.mjs";
import { Store } from "../src/store.mjs";
import { purgeExpired, recoverInterrupted } from "../src/pipeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pdf = makePdf(fs.readFileSync(path.join(here, "fixtures/upphandling-lokalvard.txt"), "utf8"));
const ADMIN = "admin-secret-for-tests";

let server;
let base;
let dataDir;
const stripeCalls = [];

async function stripeFetch(url, init) {
  stripeCalls.push({ url, init });
  if (init.method === "POST") {
    const body = new URLSearchParams(init.body);
    return new Response(JSON.stringify({ id: "cs_test_paid", url: `https://checkout.stripe.test/${body.get("metadata[access_token]")}` }));
  }
  const token = stripeCalls.find((c) => c.init.method === "POST")?.init.body && new URLSearchParams(stripeCalls.find((c) => c.init.method === "POST").init.body).get("metadata[access_token]");
  return new Response(JSON.stringify({ id: "cs_test_paid", payment_status: "paid", amount_total: 99500, currency: "sek", metadata: { access_token: token }, customer_details: { email: "kopare@foretag.se", name: "Köpare" } }));
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "anbudskollen-"));
  const defaults = loadConfig();
  const { app, ready } = createApp({
    config: {
      dataDir,
      adminToken: ADMIN,
      trustProxy: false,
      stripe: { secretKey: "sk_test_123", apiBase: "https://api.stripe.test" },
      limits: { ...defaults.limits, freeAnalysesPerIpPerDay: 1 },
    },
    provider: createDemoProvider(),
    fetchImpl: stripeFetch,
    log: { info() {}, error() {} },
  });
  await ready;
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const json = async (res) => ({ status: res.status, body: await res.json() });
const adminHeaders = { "X-Admin-Token": ADMIN };

function uploadForm(extra = {}) {
  const form = new FormData();
  form.append("files", new Blob([pdf], { type: "application/pdf" }), "Upphandlingsdokument lokalvård.pdf");
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}

async function waitFor(token, predicate, headers = {}) {
  for (let i = 0; i < 100; i += 1) {
    const { body } = await json(await fetch(`${base}/api/r/${token}`, { headers }));
    if (predicate(body)) return body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timeout");
}

let token;

test("public config and security headers", async () => {
  const res = await fetch(`${base}/api/config`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  const body = await res.json();
  assert.equal(body.engine, "demo");
  assert.equal(body.paymentsEnabled, true);
  assert.equal(body.priceSek, 995);
});

test("upload requires accepted terms and files", async () => {
  const noAccept = await json(await fetch(`${base}/api/analyses`, { method: "POST", body: uploadForm() }));
  assert.equal(noAccept.status, 400);
  const empty = new FormData();
  empty.append("accept", "on");
  const noFiles = await json(await fetch(`${base}/api/analyses`, { method: "POST", body: empty }));
  assert.equal(noFiles.status, 400);
});

test("full flow: upload, preview, pay, unlock, export", async () => {
  const created = await json(await fetch(`${base}/api/analyses`, { method: "POST", body: uploadForm({ accept: "on", certifications: "ISO 9001" }) }));
  assert.equal(created.status, 201);
  token = created.body.token;
  assert.match(created.body.url, /rapport\.html\?t=/);

  const preview = await waitFor(token, (v) => v.status === "klar");
  assert.equal(preview.unlocked, false);
  assert.ok(preview.locked.requirements > 0);
  assert.ok(preview.headline.score >= 0);
  assert.equal(preview.deadline.date, "2026-11-12");
  assert.equal(preview.hasProfile, true);

  const blocked = await fetch(`${base}/api/r/${token}/export.xlsx`);
  assert.equal(blocked.status, 402);

  const checkout = await json(await fetch(`${base}/api/r/${token}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.url, `https://checkout.stripe.test/${token}`);

  const paid = await json(await fetch(`${base}/api/r/${token}?session_id=cs_test_paid`));
  assert.equal(paid.body.unlocked, true);
  assert.equal(paid.body.requirements.length, paid.body.stats.requirements);

  const xlsx = await fetch(`${base}/api/r/${token}/export.xlsx`);
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get("content-type"), /spreadsheetml/);
  assert.match(xlsx.headers.get("content-disposition"), /kravmatris-.*\.xlsx/);
  const ics = await fetch(`${base}/api/r/${token}/export.ics`);
  assert.equal(ics.status, 200);
  assert.match(await ics.text(), /BEGIN:VEVENT/);
});

test("free analyses are rate limited per IP, admin is not", async () => {
  const second = await json(await fetch(`${base}/api/analyses`, { method: "POST", body: uploadForm({ accept: "on" }) }));
  assert.equal(second.status, 429);
  const asAdmin = await json(await fetch(`${base}/api/analyses`, { method: "POST", body: uploadForm({ accept: "on" }), headers: adminHeaders }));
  assert.equal(asAdmin.status, 201);
});

test("owner console: overview, share links, invoice and manual unlock", async () => {
  assert.equal((await fetch(`${base}/api/admin/overview`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/overview`, { headers: { "X-Admin-Token": "wrong" } })).status, 401);

  const overview = await json(await fetch(`${base}/api/admin/overview`, { headers: adminHeaders }));
  assert.equal(overview.status, 200);
  assert.equal(overview.body.stats.paidReports, 1);
  assert.equal(overview.body.stats.revenueSek, 995);
  const analysis = overview.body.analyses.find((a) => a.shares.some((s) => s.token === token));
  assert.ok(analysis);

  const share = await json(await fetch(`${base}/api/admin/analyses/${analysis.id}/shares`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ label: "Städproffsen AB" }) }));
  assert.equal(share.status, 201);
  const shareToken = share.body.token;
  const shareView = await json(await fetch(`${base}/api/r/${shareToken}`));
  assert.equal(shareView.body.unlocked, false, "a new share link must not inherit another buyer's payment");

  const badInvoice = await json(await fetch(`${base}/api/r/${shareToken}/invoice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: "X" }) }));
  assert.equal(badInvoice.status, 400);
  const invoice = await json(await fetch(`${base}/api/r/${shareToken}/invoice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: "Städproffsen AB", orgNumber: "556000-0000", email: "ekonomi@stadproffsen.se", reference: "Anna" }) }));
  assert.equal(invoice.status, 200);

  const unlock = await json(await fetch(`${base}/api/admin/access/${shareToken}/unlock`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ via: "faktura", amountSek: 995 }) }));
  assert.equal(unlock.status, 200);
  assert.equal((await json(await fetch(`${base}/api/r/${shareToken}`))).body.unlocked, true);

  const after = await json(await fetch(`${base}/api/admin/overview`, { headers: adminHeaders }));
  assert.equal(after.body.stats.revenueSek, 1990);
  assert.ok(after.body.leads.some((l) => l.kind === "faktura" && l.orgNumber === "556000-0000"));
});

test("personalisation re-runs the assessment with a company profile", async () => {
  const res = await json(await fetch(`${base}/api/r/${token}/profile`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ certifications: "ISO 9001, ISO 14001, ansvarsförsäkring 10 mkr", companyName: "Test AB" }) }));
  assert.equal(res.status, 202);
  const view = await waitFor(token, (v) => !v.personalizing);
  assert.equal(view.hasProfile, true);
  assert.ok(view.synthesis.assessments.length > 0);
  const empty = await json(await fetch(`${base}/api/r/${token}/profile`, { method: "POST", headers: { ...adminHeaders, "Content-Type": "application/json" }, body: "{}" }));
  assert.equal(empty.status, 400);
});

test("contact form, unknown tokens and deletion", async () => {
  assert.equal((await fetch(`${base}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "nope" }) })).status, 400);
  assert.equal((await fetch(`${base}/api/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.se", message: "Hej" }) })).status, 200);
  assert.equal((await fetch(`${base}/api/r/../../etc`)).status, 404);
  assert.equal((await fetch(`${base}/api/r/doesnotexist123`)).status, 404);

  const overview = await json(await fetch(`${base}/api/admin/overview`, { headers: adminHeaders }));
  const id = overview.body.analyses.find((a) => a.shares.some((s) => s.token === token)).id;
  const del = await json(await fetch(`${base}/api/admin/analyses/${id}`, { method: "DELETE", headers: adminHeaders }));
  assert.equal(del.body.removedLinks, 2);
  assert.equal((await fetch(`${base}/api/r/${token}`)).status, 404);
});

test("example report and static pages are served", async () => {
  const example = await json(await fetch(`${base}/api/exempel`));
  assert.equal(example.body.unlocked, true);
  for (const page of ["/", "/analys.html", "/rapport.html", "/admin.html", "/villkor.html", "/integritet.html", "/js/rapport.js", "/css/style.css"]) {
    assert.equal((await fetch(`${base}${page}`)).status, 200, page);
  }
});

test("restart recovery and retention purge", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anbudskollen-store-"));
  try {
    const store = new Store(dir);
    await store.analyses.put({ id: "stuckanalysis1", createdAt: new Date().toISOString(), status: "analyserar" });
    await store.analyses.put({ id: "oldanalysis123", createdAt: "2020-01-01T00:00:00.000Z", status: "klar" });
    await store.access.put({ id: "oldaccesstok1", token: "oldaccesstok1", analysisId: "oldanalysis123", createdAt: "2020-01-01T00:00:00.000Z" });
    await recoverInterrupted(store);
    assert.equal((await store.analyses.get("stuckanalysis1")).status, "fel");
    assert.equal(await purgeExpired(store, 365), 1);
    assert.equal(await store.analyses.get("oldanalysis123"), null);
    assert.equal(await store.access.get("oldaccesstok1"), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
