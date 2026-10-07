// Minimal durable store: one JSON file per record, written atomically.
// Deliberately dependency-free so the app runs anywhere with a writable disk.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function newId(bytes = 16) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function isValidId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}

async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tmp, file);
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

class Collection {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    // Serialise read-modify-write per record so concurrent updates (job
    // progress + payment confirmation) never lose each other's fields.
    this.locks = new Map();
  }

  file(id) {
    if (!isValidId(id)) throw new Error("Ogiltigt id");
    return path.join(this.dir, `${id}.json`);
  }

  async get(id) {
    if (!isValidId(id)) return null;
    return readJson(this.file(id));
  }

  async put(record) {
    await writeJsonAtomic(this.file(record.id), record);
    return record;
  }

  async update(id, mutate) {
    const previous = this.locks.get(id) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => (release = resolve));
    this.locks.set(id, previous.then(() => current));
    await previous;
    try {
      const record = await this.get(id);
      if (!record) return null;
      const next = (await mutate(record)) ?? record;
      next.updatedAt = new Date().toISOString();
      await this.put(next);
      return next;
    } finally {
      release();
      if (this.locks.get(id) === current) this.locks.delete(id);
    }
  }

  async remove(id) {
    if (!isValidId(id)) return false;
    try {
      await fsp.unlink(this.file(id));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async list() {
    const names = await fsp.readdir(this.dir).catch(() => []);
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map((name) => readJson(path.join(this.dir, name)).catch(() => null)),
    );
    return records
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.analyses = new Collection(path.join(dataDir, "analyses"));
    this.access = new Collection(path.join(dataDir, "access"));
    this.leadsFile = path.join(dataDir, "leads.jsonl");
    this.usageFile = path.join(dataDir, "usage.json");
  }

  async addLead(lead) {
    const record = { id: newId(9), createdAt: new Date().toISOString(), ...lead };
    await fsp.appendFile(this.leadsFile, `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async listLeads() {
    const raw = await fsp.readFile(this.leadsFile, "utf8").catch(() => "");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  }
}
