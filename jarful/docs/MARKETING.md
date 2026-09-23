# Jarful marketing kit

Everything here is ready to use. Nothing is posted or sent automatically: posting, DMs and store submissions have to come from you.

---

## 1. Positioning in one line

**"Every recipe you've saved, in one place. No weekly subscriptions. Ever."**

Proof points, each backed by real 1–2★ reviews of the top-grossing competitors (see `LAUNCH.md`):
1. Unlimited website imports, 20 AI imports a month free (competitors: ~5 a week).
2. No ads, and no paywall before you've tried it.
3. Free household sharing with live grocery ticks.
4. Missing-ingredient check.
5. $2.99/mo or $39 once, cancel in one tap.

---

## 2. 30-day short-video calendar (TikTok, Reels, Shorts)

Format: 15–30 s vertical screen recording of the real app, with your voice or captions. Post the same video on all three platforms. Two a day is ideal and one is the minimum. The first 1.5 seconds are the hook.

### Pillars (rotate them)
- **A. Rescue:** take a viral recipe video and show it becoming a clean recipe card in 3 seconds.
- **B. Rage-bait (honest):** the weekly-subscription / import-cap problem, and the fix.
- **C. Household:** two phones, one grocery list, ticks syncing live.
- **D. Magic moments:** photo of grandma's handwritten card → recipe; "2 tbsp + ¼ cup = ⅜ cup" merging; servings scaler.
- **E. Build in public:** "I read 25,000 App Store reviews and built the recipe app people asked for." This one is unusually strong for founder accounts.

### Scripts

| Day | Pillar | Hook (on screen + spoken) | Beats |
|---|---|---|---|
| 1 | E | "I read 25,000 App Store reviews to find what people hate about recipe apps." | Show 3 real review quotes (import caps, ads, trial trap) → "so I built the opposite" → app demo → "it's free, link in bio" |
| 2 | A | "Stop screenshotting TikTok recipes." | Copy link → paste → recipe card appears → add to Tuesday |
| 3 | B | "This recipe app lets you save 5 recipes… a WEEK." | Mock the cap → Jarful: unlimited website imports → price card |
| 4 | C | "My partner and I haven't double-bought eggs since." | Two phones, tick on one, appears on the other |
| 5 | D | "Grandma's handwritten recipe card → my phone in 5 seconds." | Photo → recipe → scale to 8 servings |
| 6 | A | "The viral [dish of the week] recipe, but actually saved." | Use whatever food trend is hot that day |
| 7 | E | "Week 1 of launching my app: here are the real numbers." | Share signups from `/api/admin/metrics`. Honesty builds trust |
| 8 | D | "Your grocery list shouldn't say 'olive oil' three times." | Plan 3 recipes → merged, aisle-sorted list |
| 9 | B | "Apps that charge $12 a week should be illegal." | Price comparison table from the site |
| 10 | A | "How I meal plan from TikTok in 2 minutes." | Save 4 recipes → plan week → list |
| 11 | D | "Cook mode: your screen won't turn off with flour on your hands." | Step-by-step mode |
| 12 | C | "Send this to whoever does the grocery shopping." | Invite code share flow (built to get shared) |
| 13 | A | "Instagram's saved folder is where recipes go to die." | Copy caption → paste → recipe |
| 14 | E | "Two weeks in: what users asked for, and what I shipped." | Show a feature you added from feedback |
| 15–30 | Repeat what worked | Double down on the 3 best hooks by watch time | Change the dish, keep the structure |

**Rules that matter more than the scripts:** reply to every comment with a video when possible, pin a comment with the link, and never fake reviews or testimonials.

---

## 3. Creator partnerships

Target: food creators with 5k–50k followers who post recipes with written captions. Their audience are the people who need to save those recipes.

**DM template**
> Hi {name}! I love your {specific recipe} — made it last week. I built a small app, Jarful, that turns recipe videos like yours into a saved recipe + grocery list (it always links back to your original post). Would you be up for trying it? Free lifetime Pro for you, and if you'd like to mention it, 30% of what your followers pay, for as long as they stay. No script, no obligation — honest opinion only. — {your name}

**Follow-up (5 days later, once)**
> Hey {name}, just floating this back up in case it got buried. Happy to set you up in 30 seconds if you're curious. Totally fine if not!

Track creators in a simple sheet: name, followers, date contacted, reply, code, signups.

For creator revenue share, create a Stripe Payment Link per creator (for example with a `?ref=` in the success URL) or use a promotion code per creator, and pay out monthly.

---

## 4. Community posting (value first)

- Reddit: r/mealprepsunday, r/EatCheapAndHealthy, r/Cooking, r/budgetfood. Read each subreddit's self-promotion rules first. Best angle: "I analysed 25k reviews of recipe apps. Here's what people hate (data inside)." Share the data and mention the app only where the rules allow it.
- Facebook groups for meal planning and budget families: same data-first approach.
- Product Hunt launch once 50+ households are active (you need early users to upvote and comment honestly).

---

## 5. App Store listing (iOS)

Character limits checked. Brand names such as TikTok and Instagram are kept **out** of the name, subtitle and keywords, because Apple can reject third-party trademarks in metadata.

- **Name (30):** `Jarful: Recipe Saver & Planner`
- **Subtitle (30):** `Save any recipe. Shop once.`
- **Keywords (100):** `recipe,keeper,organizer,saver,box,meal,plan,planner,grocery,list,cookbook,import,social,video,dinner`
- **Promotional text (170):** `Save any recipe from social video, a website or a photo. Plan the week, shop from one shared list. No ads, no weekly subscriptions, cancel in one tap.`
- **Description:**

> Every recipe you've saved, finally in one place.
>
> Paste a link from your favorite recipe video, food blog or YouTube channel, or snap a photo of a cookbook page or a handwritten family card. Jarful pulls out the ingredients and steps, checks nothing is missing, and saves it to your jar.
>
> PLAN THE WEEK, SHOP ONCE
> • Drop recipes onto any day
> • One grocery list: ingredients merged across recipes, units converted, sorted by aisle
> • Scale any recipe to the servings you're cooking
>
> SHARE WITH YOUR HOUSEHOLD, FREE
> • One invite code — everyone sees the same recipes, plan and list
> • Ticks sync live while you shop
>
> HONEST BY DESIGN
> • No ads
> • Website imports are unlimited on the free plan
> • 20 AI imports a month free — from video captions, pasted text and photos
> • Pro: unlimited AI imports for $2.99/month, $19.99/year, or $39 once
> • No weekly plans. Cancel any time.
> • Export all your data in one tap
>
> COOK MODE
> • Big, one-step-at-a-time instructions
> • Your screen stays on while you cook

- **Screenshot captions** (images in `docs/store-screenshots/`):
  1. "Every recipe you've saved, in one place"
  2. "Paste a link. Get a recipe."
  3. "Scale it. Cook it. Screen stays on."
  4. "Plan the week in a minute"
  5. "One list, merged and sorted by aisle"
  6. "Share with your household — free"

## 6. Google Play listing

- **Title (30):** `Jarful: Recipe Saver & Planner`
- **Short description (80):** `Save recipes from video, web or photos. Plan meals, share one grocery list.`
- **Full description:** same as iOS.
- The PWA's share target already works on Android: "Share → Jarful" from any app.

---

## 7. Launch-day checklist

- [ ] App live on your domain over HTTPS; `/api/health` returns ok
- [ ] Stripe links tested with a real card in test mode, then live mode
- [ ] `ADMIN_TOKEN` set; open `/api/admin/metrics` with header `x-admin-token`
- [ ] Privacy policy and terms placeholders filled in
- [ ] Bio link on TikTok, Instagram and YouTube points to the site
- [ ] First 3 videos recorded (Day 1–3 scripts)
- [ ] 20 creator DMs sent
