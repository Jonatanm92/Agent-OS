// Owner dashboard numbers, computed from the store (no tracking scripts, no third parties).
import { monthKey } from './store.mjs';

const DAY = 864e5;

export function computeMetrics(data, now = Date.now()) {
  const hs = Object.values(data.households);
  const ageDays = (iso) => (now - Date.parse(iso)) / DAY;
  const recipesOf = (h) => Object.values(h.recipes);
  // Activation = imported/saved 3+ recipes within 7 days of creating the kitchen (LAUNCH.md north star).
  const activated = (h) => recipesOf(h).filter((r) => Date.parse(r.createdAt) - Date.parse(h.createdAt) <= 7 * DAY).length >= 3;
  const cohort = (days) => hs.filter((h) => ageDays(h.createdAt) <= days);
  const matured = hs.filter((h) => ageDays(h.createdAt) >= 7);
  const methods = {};
  for (const h of hs) for (const r of recipesOf(h)) methods[r.method ?? 'unknown'] = (methods[r.method ?? 'unknown'] ?? 0) + 1;
  const pro = hs.filter((h) => h.billing.plan === 'pro');
  const activeWeek = hs.filter((h) => recipesOf(h).some((r) => ageDays(r.updatedAt ?? r.createdAt) <= 7) || Object.keys(h.mealPlan).some((d) => Math.abs(ageDays(`${d}T00:00:00Z`)) <= 7));
  const signupsByDay = {};
  for (const h of cohort(30)) { const d = h.createdAt.slice(0, 10); signupsByDay[d] = (signupsByDay[d] ?? 0) + 1; }
  return {
    generatedAt: new Date(now).toISOString(),
    households: { total: hs.length, last7d: cohort(7).length, last30d: cohort(30).length, activeLast7d: activeWeek.length, multiMember: hs.filter((h) => Object.values(data.members).filter((m) => m.householdId === h.id).length > 1).length },
    members: Object.keys(data.members).length,
    activation: { eligible: matured.length, activated: matured.filter(activated).length, rate: matured.length ? +(matured.filter(activated).length / matured.length).toFixed(3) : null },
    recipes: { total: hs.reduce((s, h) => s + recipesOf(h).length, 0), byMethod: methods },
    aiImportsThisMonth: hs.reduce((s, h) => s + (h.usage[monthKey(new Date(now))] ?? 0), 0),
    freeUsersAtAiLimit: hs.filter((h) => h.billing.plan !== 'pro' && (h.usage[monthKey(new Date(now))] ?? 0) >= Number(process.env.FREE_AI_IMPORTS ?? 20)).length,
    revenue: { pro: pro.length, subscriptions: pro.filter((h) => h.billing.interval === 'subscription').length, lifetime: pro.filter((h) => h.billing.interval === 'lifetime').length, conversionRate: hs.length ? +(pro.length / hs.length).toFixed(4) : null },
    signupsByDay,
  };
}
