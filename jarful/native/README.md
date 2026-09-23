# Jarful native apps (Capacitor)

These are the App Store / Google Play shells. They **bundle** the web app from `../public`, so the app works as a real app and not a wrapped website (Apple rejects bare web views under guideline 4.2). The bundled app talks to your hosted Jarful server over HTTPS; the server already allows CORS from the Capacitor origins.

Already done here:
- Android and iOS projects generated (`android/`, `ios/`)
- App ID `app.jarful.recipes`, name "Jarful"
- Icons and splash screens for both platforms (sources in `assets/`)
- Android **share target**: "Share → Jarful" from TikTok, Instagram, YouTube or a browser opens the import sheet with the link filled in (`MainActivity.java`)
- The Android debug build compiles (verified: target SDK 35, min SDK 23)

## Build

```bash
cd jarful/native
npm install
JARFUL_API_BASE=https://YOUR_DOMAIN npm run android   # copies ../public into www/, syncs, opens Android Studio
JARFUL_API_BASE=https://YOUR_DOMAIN npm run ios       # macOS + Xcode only
```

Command-line Android debug build: `cd android && ./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`.

## Google Play

1. Create a developer account ($25 one-time).
2. Create an upload key and sign: Android Studio → Build → Generate Signed App Bundle. **Back up the keystore and passwords**; losing them means you can never update the app.
3. Upload the `.aab` to internal testing first, then production. Listing copy is in `../docs/MARKETING.md`.
4. Fill in the Data safety form. It should match `../public/privacy.html`: no ads, no tracking, and recipe content is processed by Anthropic for AI imports.

## Apple App Store

1. Apple Developer Program ($99/year) and a Mac with Xcode.
2. `npm run ios`, then set your Team under Signing & Capabilities → Product → Archive → Distribute.
3. Screenshots (6.9″, 1290×2796) are ready in `../docs/store-screenshots/`.
4. iOS has no text share target yet. Adding a Share Extension is native Swift work and a good v1.1 feature. Until then, users paste links, or use the web app's share target on Android.

## Payments inside the native apps — read before enabling

The native build **hides the Stripe purchase buttons** (`native: true` in `www/config.js`). Stores generally require their own billing for digital subscriptions bought inside an app:

- **iOS:** in-app purchase is required for digital goods, with regional exceptions (for example, link-outs to web checkout have been allowed in the US storefront since 2025). Check the current App Review Guidelines 3.1 before shipping any purchase path.
- **Google Play:** Play Billing is required for digital goods, except where alternative billing programs apply.

The recommended path once the web app shows traction: add in-app purchases through RevenueCat (`@revenuecat/purchases-capacitor`), create the same three products, and send RevenueCat's webhook to a small endpoint that sets `billing.plan = 'pro'`, following the Stripe handler in `lib/billing.mjs`. Web purchases already unlock Pro for everyone in the kitchen on every device.
