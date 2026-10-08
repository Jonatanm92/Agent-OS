import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRelevant, readSeen, toSignal } from './signals.mjs';

const hit = (headline, text = '') => ({
  id: 42, headline, publication_date: '2026-10-01T08:00:00', employer: { name: 'Bolag AB' },
  webpage_url: 'https://arbetsformedlingen.se/platsbanken/annonser/42', description: { text },
});

test('extracts systems from headline and description', () => {
  const s = toSignal(hit('M3 Specialist', 'Erfarenhet av Infor M3 och WMS'), 'Infor M3');
  assert.equal(s.id, '42');
  assert.equal(s.date, '2026-10-01');
  assert.match(s.systems, /M3/);
  assert.match(s.systems, /WMS/);
  assert.ok(isRelevant(s));
});

test('drops ads without a named system and hands-on warehouse roles', () => {
  assert.equal(isRelevant(toSignal(hit('Projektledare e-handel', 'Vi växer'), 'q')), false);
  assert.equal(isRelevant(toSignal(hit('Lagermedarbetare', 'Du plockar i vårt WMS'), 'q')), false);
});

test('does not treat words containing "sap" as SAP', () => {
  assert.equal(toSignal(hit('Inköpare', 'Vi söker en saputvecklare? nej, en sapper'), 'q').systems, '');
});

test('readSeen returns logged ids and handles a missing file', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sig-')), 'signals.csv');
  assert.equal(readSeen(file).size, 0);
  fs.writeFileSync(file, 'id,datum\n"42",2026-10-01\n7,2026-10-02\n');
  const seen = readSeen(file);
  assert.ok(seen.has('42'));
  assert.ok(seen.has('7'));
});

test('profile track keeps office logistics roles without a named system', () => {
  assert.equal(isRelevant(toSignal(hit('Product & Supply Coordinator', 'Inget systemnamn'), 'q'), 'profil'), true);
  assert.equal(isRelevant(toSignal(hit('Orderadministratör', ''), 'q'), 'profil'), true);
  assert.equal(isRelevant(toSignal(hit('Processoperatör', 'logistik'), 'q'), 'profil'), false);
  assert.equal(isRelevant(toSignal(hit('Konstruktör', 'M3'), 'q'), 'profil'), false);
  assert.equal(isRelevant(toSignal(hit('Product & Supply Coordinator', ''), 'q')), false);
});
