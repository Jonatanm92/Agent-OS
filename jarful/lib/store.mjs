// Tiny durable JSON store. One file, atomic writes, serialized saves.
// Good for the first few thousand households; swap for SQLite/Postgres after that.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';

export const newId = (n = 9) => randomBytes(n).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const inviteCode = () => Array.from(randomBytes(6), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { households: {}, members: {}, invites: {}, stripeCustomers: {}, processedEvents: {} };
    this.saving = Promise.resolve();
    this.dirty = false;
  }

  async load() {
    if (existsSync(this.file)) this.data = { ...this.data, ...JSON.parse(await readFile(this.file, 'utf8')) };
    else await mkdir(dirname(this.file), { recursive: true });
    return this;
  }

  save() {
    this.dirty = true;
    this.saving = this.saving.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(this.data));
      await rename(tmp, this.file);
    });
    return this.saving;
  }

  createHousehold(name, memberName) {
    const id = newId();
    let code = inviteCode();
    while (this.data.invites[code]) code = inviteCode();
    this.data.households[id] = {
      id, name: (name || 'Our kitchen').slice(0, 60), createdAt: new Date().toISOString(), inviteCode: code,
      billing: { plan: 'free', interval: null, stripeCustomerId: null, subscriptionId: null, since: null },
      usage: {}, recipes: {}, mealPlan: {}, grocery: { checked: {}, extras: [] },
    };
    this.data.invites[code] = id;
    const token = this.addMember(id, memberName);
    return { household: this.data.households[id], token };
  }

  addMember(householdId, name) {
    const token = randomBytes(24).toString('base64url');
    this.data.members[hashToken(token)] = { householdId, name: (name || 'Cook').slice(0, 40), createdAt: new Date().toISOString() };
    return token;
  }

  join(code, memberName) {
    const id = this.data.invites[String(code || '').trim().toUpperCase()];
    if (!id) return null;
    return { household: this.data.households[id], token: this.addMember(id, memberName) };
  }

  byToken(token) {
    const m = token && this.data.members[hashToken(token)];
    return m ? { member: m, household: this.data.households[m.householdId] } : null;
  }

  membersOf(householdId) {
    return Object.values(this.data.members).filter((m) => m.householdId === householdId).map((m) => ({ name: m.name, since: m.createdAt }));
  }
}

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
