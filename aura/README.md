# Aura

**A calm, adaptive operating system for everyday life.**
Aura works out what matters right now and reduces the amount of thinking,
planning and remembering you have to do. You don't organise Aura; Aura
helps organise you.

Aura grew out of **Min vardag** (on branch `claude/min-vardag-app-1ie6im`).
It keeps that app's architecture and principles and broadens it from one
parent's daily plan into a general personal assistant for many people.
No user is hardcoded: the first beta user's name, rhythm and areas live in
their own stored preferences, like everyone else's.

---

## What it does

| Area | What the user gets |
|---|---|
| **Now** (home) | One recommended action with a one-sentence reason and a duration, or "Nothing urgent — you have 32 minutes before you need to leave". Today at a glance (must / good if possible / can wait), one contextual suggestion, quick actions. |
| **What should I do now?** | One thing. **Do it** · **Something easier** (lighter, or a five-minute version) · **Something else** · **Not now** (Aura goes quiet for a while). |
| **My day** | Must, Good if possible, Can wait. Quick add, complete, postpone, reorder, fixed events, and **Rebuild my day** with a preview of what stays, what moves where and what is brought forward. |
| **Capture / brain dump** | Type or speak messy thoughts. Aura sorts them into shopping, tasks, admin, chores, reminders, events, notes and ideas, with dates, times, durations and repeats. You see and correct every candidate before anything is created. |
| **Pulse** | A 5–15 second check-in (energy, mood, stress, sleep, note — all optional). One tap on Home records energy. |
| **Low Energy Mode** | "Let's make today smaller": what is truly necessary, one tiny win, and where everything else moves. Suggested after a low Pulse, never forced. |
| **Chaos Mode** | Dump everything → Aura organises → one action at a time; finishing reveals the next. The rest stays out of sight. |
| **Evening reset** | What got done, one-tap decisions about what didn't, empty your head into the inbox, a glance at tomorrow. Two minutes. |
| **Aura (coach + Ask Aura)** | Questions about your own life are answered from your plan, exactly and instantly: *What was I supposed to buy? What have I postponed? What's due before Friday? What am I waiting for? What did I plan for the bedroom?* Open-ended help goes to Claude with today's plan as context; anything it proposes is shown as changes you apply with a tap. |
| **Life** | Inbox (no Inbox-Zero pressure), Shopping (categories, usuals), Life admin (needs action / waiting / follow up), Home (recurring chores Aura remembers), Projects (only the next step surfaces), Routines (adaptive), Weekly review, and the optional Cycle and Reflection modules. |
| **Patterns** | Observations from your own log, only after several occurrences: *"You often move Clean bathroom on Wednesdays. Want me to stop putting it there?"* Never diagnoses, always dismissible. |
| **Modes** | Normal, Workday and Free day follow your week automatically; Low energy, Chaos and Recovery are one tap away and can always be switched off. |
| **Onboarding** | Six short, skippable steps ending on a useful first day: language, name, what to help with, what makes life hard, rhythm, first Pulse, first brain dump. |

Swedish and English throughout, chosen per person.

## Principles the code keeps (and tests)

Carried over from Min vardag:
- **Unknown is a valid value.** Working hours, schedules and people are never invented.
- **A plan starts now.** A plan made at 16:00 doesn't begin with breakfast.
- **Margins are kept.** Travel time around away-from-home events; a quarter of free time is never planned.
- **Low energy shrinks the day and says what moved** instead of hiding it.
- **Missed plans don't pile up.** Yesterday's undone plan without a deadline falls back to "can wait".
- **Aura never invents chores** to fill gaps. It only picks from what you already have.
- **A rule engine is never called AI.** The interface always says which was used.

New in Aura:
- **One thing, not a list.** Every recommendation comes with a reason and a duration.
- **No guilt, no streaks, no gamification**, no motivational filler (a test checks the strings).
- **Every change is an op**: described in words before it happens, applied to a copy, undoable.
- **AI output is untrusted input**, validated against real ids before it is even shown.
- **Notifications only when there is a decision to make.**

## Architecture

No build step. `core/` and `app/` are plain scripts; tests load exactly the files the browser loads.

```
core/            pure domain logic, no DOM — runs in Node tests and the browser
  util.js        dates and times in the user's own time zone
  i18n.js        [svenska, English] string pairs, plurals, date words
  model.js       data model, defaults, migration, Min vardag import, compact storage form
  items.js       today's buckets (must / good / can wait), recurrence, lists
  planner.js     fixed blocks, free time, capacity, auto-plan, Rebuild my day
  engine.js      Aura Engine: NOW card, what-now ranking, modes, Low Energy and Chaos plans
  routines.js    adaptive routines (full / short) and templates
  apply.js       ops: describe → validate → apply → log
  parse.js       brain dump parser, Swedish and English (rules)
  evening.js     evening reset
  patterns.js    personal patterns from the log
  review.js      weekly review
  search.js      Ask Aura — deterministic life search
  cycle.js       optional cycle tracking (not medical)
  reflect.js     optional reflection prompts and contemplative themes
  notify.js      notification candidates (the rules for when to speak up)
  compact.js     retention
app/
  platform.js    claude.use() bridge — every capability may be absent
  storage.js     per-person private storage, browser fallback, undo, live sync
  ai.js          Claude calls: schemas, validation, fallbacks, privacy-minimal context
  voice.js       speech input where it can really work
  ui.js          rendering, navigation, sheets, toasts with undo, in-page confirm
  views/         home, day, capture, modes, evening, aura, life, projects, personal, settings, onboarding
index.html       shell and design tokens (light and dark)
test/            unit tests, end-to-end tests, lint/privacy checks, local server
```

### The Aura Engine

`engine.js` combines the time, fixed events and travel margins, today's
buckets, the latest Pulse, the mode, routines in their window, and what
you already declined today. It scores candidates (deadlines, fit before
the next commitment, energy match, office hours for calls, background
tasks like laundry that run alongside, postponement history, your own
ordering) and returns **one** recommendation with the most salient
reason. It is deterministic: free, instant and predictable on every screen.

### Data model

One state per person, persisted in slices so no stored document grows
without bound: `core` (preferences, events, routines, projects, people,
meta), `items`, `days` (Pulse, mode, routine check-offs, focus, chaos
queue per date), `log` (compact events for patterns and the review),
`cycle`, `journal`.

A single **Item** type covers tasks, shopping, admin, chores, reminders,
notes and ideas — kind decides how Aura treats it, and the user never has
to file anything. Items carry priority, planned date, deadline, duration,
energy, context, background, recurrence, project, category, admin status,
follow-up, person, and postponement history.

### Storage and privacy

Aura is published as a claude.ai Artifact and uses the platform's `db`
capability. Each person's data lives under `data/users/<their id>/`,
which the platform keeps **private to that person — even from the page's
owner**. Shared paths are locked to editors and unused.

- Documents stay small: items are stored without default-valued fields
  (about 70% smaller) and long lists are split over several documents.
- A copy is cached in the browser under a key derived from the person's
  id, so Aura opens instantly and survives a flaky connection.
- Without the platform Aura saves in the browser and says so; if the
  browser blocks storage it says nothing is saved. It never claims more.
- Retention: finished items are kept 60 days, day details 90 days, the
  log 180 days.
- Export (copy or save as a file), import (Aura or Min vardag, adds only),
  and delete everything, all in Settings. Cycle data can be deleted on its own.
- Nothing is logged to the console; no personal names appear in code (lint-checked).

### AI

AI is optional and runs on the **viewer's own Claude account** through the
Artifact `sample` capability; the first use asks for permission.

| Used for | Model tier | Fallback |
|---|---|---|
| Sorting a brain dump | quick | the rules parser |
| Open-ended coaching with proposed changes | default | answers from the plan, or an honest "needs AI" |

- Prompts ask for strict JSON; every item and action is validated (kinds,
  dates, ids that must exist, people who must be known) before display.
- Nothing an AI proposes is applied without a tap, and every change is undoable.
- What is sent: titles and times from today's plan, or the text you ask it
  to sort. **Never** notes, reflections, cycle data or the people list
  (a unit test checks this).
- Failures (no permission, rate limit, bad output) fall back to rules and
  say why. AI can be turned off entirely in Settings.

### Voice

Voice is an input method into the same capture pipeline. Browser speech
recognition is used where it can really work. Inside a claude.ai Artifact
the frame refuses the microphone, so Aura shows no mic button there and
points to the phone keyboard's microphone, which works in every field.
A speech service can be plugged into `app/voice.js` later.

### Notifications

`core/notify.js` holds the rules for when Aura may speak up — leaving soon
with things that won't fit, a reminder whose time has come, a follow-up
that is due, unfinished musts late in the evening — at most one at a
time, never motivational. They appear as a quiet line on Now. The
Artifact platform has no push delivery; a future push channel would read
the same candidates.

## Run and test

```bash
cd aura
npm start                 # http://127.0.0.1:4173 — browser storage, rules, no AI
npm run lint              # syntax, string coverage in both languages, privacy/platform rules
npm test                  # unit tests (core, systems, storage and AI validation)
npm run test:e2e          # real browser at Pixel 7 size (needs Playwright + Chromium)
npm run check             # all of the above
```

The end-to-end suite runs the page inside the same skeleton the platform
adds at publish time, with a fixed clock. Part 2 simulates the claude.ai
runtime (private db and Claude) to test cloud storage, AI labelling,
validation and failure states.

## Deploying

Publish `index.html` as an Artifact with the `core/`, `app/` and
`app/views/` scripts as supporting files, declaring:

```js
capabilities: {
  db: { rules: [
    { path: '', read: 'admin', write: 'admin' },                    // no shared data
    { path: 'data/users/{self}', read: 'interact', write: 'interact' } // each person's own
  ] },
  user: {},          // the viewer's opaque id, for their private subtree
  sample: {},        // Claude, on the viewer's account
  downloads: true,   // "Save as a file" backup
}
```

**Giving someone access** (for example the first beta user): share the
artifact with them in claude.ai. Inside your organisation, share as
**Contributor**; someone outside it must be invited by email as
**Editor** (and link sharing left off), because outside viewers can't
save data otherwise. Each person gets their own private Aura; nobody,
including the owner, can read anyone else's.

## Deliberately deferred

- **Calendar sync** (Google/Outlook): no verified connection exists here;
  events are entered in Aura. When built it should be read-only and opt-in.
- **Push notifications**: not available on the Artifact platform; rules are ready.
- **Built-in microphone inside claude.ai**: refused by the frame; the keyboard microphone is the path.
- **Drag-to-reorder**: reordering is done with Move up / Move down in the item sheet.
- **Family module** from Min vardag (children's clothing sizes, pack lists
  per child): pack lists import as "leaving home" routines and children's
  needs as shopping items for that person; sizes are not carried over.
- **Shared households** (two people editing one list): the storage model
  supports it later via a shared path with its own rules; today every Aura is private.
