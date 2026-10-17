import test from 'node:test';
import assert from 'node:assert/strict';

import * as C from '../public/js/core.js';
import { ACTIVITIES, MISSIONS, MONEY_ACTIONS, STARTERS, DAD_TIPS, MISSION_CATEGORIES, MONEY_CATEGORIES } from '../public/js/content.js';

const unique = (list) => new Set(list.map((x) => x.id)).size === list.length;

test('content ids are unique', () => {
  assert.ok(unique(ACTIVITIES), 'activities');
  assert.ok(unique(MISSIONS), 'missions');
  assert.ok(unique(MONEY_ACTIONS), 'money actions');
});

test('activities are well-formed', () => {
  for (const a of ACTIVITIES) {
    assert.ok(a.title && a.desc, a.id);
    assert.ok(a.minAge >= 0 && a.minAge <= a.maxAge && a.maxAge <= 18, a.id);
    assert.ok(['inne', 'ute', 'both'].includes(a.place), a.id);
    assert.ok(a.minutes > 0, a.id);
    assert.ok([0, 1].includes(a.cost), a.id);
    if (a.months) assert.ok(a.months.every((m) => m >= 1 && m <= 12), a.id);
  }
});

test('every age gets ideas indoors and outdoors in every month', () => {
  for (let age = 0; age <= 17; age += 1) {
    const state = C.createDefaultState();
    state.kids = [{ id: 'k', name: 'K', birthdate: `${2026 - age}-01-01` }];
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, '0')}-15`;
      const inside = C.suitableActivities(ACTIVITIES, state, key, { place: 'inne' });
      const outside = C.suitableActivities(ACTIVITIES, state, key, { place: 'ute' });
      assert.ok(inside.length >= 2, `age ${age}, month ${month}: ${inside.length} indoor ideas`);
      assert.ok(outside.length >= 1, `age ${age}, month ${month}: ${outside.length} outdoor ideas`);
    }
  }
});

test('every age gets several dad missions, with and without partner missions', () => {
  for (const includePartner of [true, false]) {
    for (let age = 0; age <= 17; age += 1) {
      const state = C.createDefaultState();
      state.settings.includePartner = includePartner;
      state.kids = [{ id: 'k', name: 'K', birthdate: `${2026 - age}-01-01` }];
      const list = C.eligibleMissions(MISSIONS, state, '2026-06-15');
      assert.ok(list.length >= 8, `age ${age}: ${list.length} missions`);
      if (!includePartner) assert.ok(list.every((m) => m.cat !== 'partner'));
    }
  }
  const noKids = C.eligibleMissions(MISSIONS, C.createDefaultState(), '2026-06-15');
  assert.ok(noKids.length >= 5);
  for (const m of MISSIONS) assert.ok(MISSION_CATEGORIES[m.cat], `${m.id} has a known category`);
});

test('conversation starters cover every age band', () => {
  for (const band of ['small', 'mid', 'teen']) {
    assert.ok(STARTERS.filter((s) => s.band === band).length >= 10, band);
  }
  assert.ok(DAD_TIPS.length >= 12);
});

test('money actions reference real streams and categories', () => {
  const streams = new Set(C.DEFAULT_STREAMS.map((s) => s.id));
  for (const a of MONEY_ACTIONS) {
    assert.ok(MONEY_CATEGORIES[a.cat], a.id);
    if (a.stream) assert.ok(streams.has(a.stream), `${a.id} → ${a.stream}`);
  }
  const state = C.createDefaultState();
  state.settings.streams = [{ id: 'other', name: 'Övrigt' }];
  const list = C.eligibleMoneyActions(MONEY_ACTIONS, state);
  assert.ok(list.length >= 20);
  assert.ok(list.every((a) => !a.stream || a.stream === 'other'));
});
