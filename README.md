# 🏠 HomeTrack

One app for your household: **prepaid power ⚡ · metered water 💧 · budget 💰** — with
**M-Pesa / bank SMS capture** on Android. Offline-first; an account is optional (cloud sync).

Built from a plain web app (in `www/`) wrapped with **Capacitor** into a native Android app.
The APK is compiled in the cloud by **GitHub Actions** — you don't need Android Studio.

---

## Modules

- **Home** — status of all three at a glance, alerts, and the SMS review queue.
- **Power** — prepaid meter (counts *down*): readings → days-remaining prediction, recharge log, appliance model.
- **Water** — metered meter (counts *up*, m³): consumption, monthly **bill projection** from your tariff, **leak detection**.
- **Budget** — expenses/income, balance, **runway**, category (envelope) budgets, on-pace projection.
  Tap any entry in History to edit it.
- **Settings** — account & sync, language (English / Português), theme, reminders, SMS capture,
  per-module and full backups.

**Cross-feed:** power recharges and water-bill payments are auto-added as expenses in the
Budget's Electricity / Water categories (toggle in Settings → App settings). They're managed from
their own module — delete the recharge/payment there and the budget entry goes with it.

**Balance:** enter your real total in Budget settings; only transactions dated *after* that moment
change it, so older entries (or old SMS you approve later) aren't counted twice.

## SMS capture (Android only)

When installed as the APK, HomeTrack reads M-Pesa / bank transaction texts — **only from senders
you approve** — and puts them in a **review queue**. Nothing enters the budget until you approve it.

- New texts are queued **live** while the app runs; texts received while it was closed are picked up
  when you open or return to the app (inbox scan, last 45 days).
- In the review list you can pick the category before tapping ✓ Add; approved entries are tagged
  `auto` and can still be edited in Budget → History.
- The parser handles Portuguese M-Pesa Moçambique formats (`pagaste`, `compraste`, `recebeste`,
  `transferiste`…) and common bank/POS texts, including `1,000.00MT`, `1.250,50MT`, `1 500,00 MT`
  and `MZN307,00` styles.
- Settings → SMS capture: approve senders (or detect them from your inbox), scan, review.

> ⚠️ **Sideload / personal use.** Google Play prohibits SMS-reading finance apps, so this build is
> for installing on your **own** phone, not for Play Store distribution. iOS cannot read SMS at all.

## Notifications (Android)

- **Alerts** (Settings → App settings): "power running low" (timed for the predicted date),
  "power runs out today" (morning of the empty day) and "possible water leak". An alert that's
  already due fires at most once a day. Alarms wake the phone, so they arrive while it's locked.
- **Daily reminders** to log the power meter / spending at a time you choose.
- **Settings → Reliable alerts** checks notifications, battery optimisation and exact alarms, with
  Fix buttons, a test notification, and a shortcut to the app settings for phones that need
  **Autostart** allowed to restore alarms after a restart (Xiaomi, Samsung, Oppo, Huawei…).

The Power screen also shows **this month's cost** (used so far + projection, vs last month and your
Electricity budget), a **6-month cost chart**, and stats (avg per month, per year, recharge
frequency, peak day, price change).

## Cloud sync (optional)

Sign in under Settings → Account & sync (Supabase, configured in `www/js/config.js`; set it to
`null` to run fully local). The whole data set is stored per user in a `states` table.
Whichever side changed since the last sync wins; if **both** this device and the cloud changed
(e.g. you edited while signed out), the app asks which copy to keep.

## Build the APK (no local Android SDK needed)

1. Push this folder to a **GitHub repo**.
2. GitHub Actions runs **Build Android APK** automatically (`.github/workflows/build-apk.yml`).
   You can also trigger it from the **Actions** tab → *Run workflow*.
3. Open the finished run → **Artifacts** → download **`hometrack-debug-apk`**.
4. Copy `app-debug.apk` to your phone, open it, allow **install from unknown sources**, install.
5. Grant the **SMS permission** when asked (after you approve a sender, or when you tap Scan/Detect).

To change the app identity, edit `capacitor.config.json` (`appId`, `appName`) **before** the first
build.

### Local build (optional)
Requires Android Studio / SDK and **JDK 17** (not newer):
```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```
APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Run the web version

The `www/` folder is a complete standalone web app (no build step):
```bash
cd www && python -m http.server 8080
```
…or drag `www/` to <https://app.netlify.com/drop>. SMS capture and reminders are Android-only;
everything else works in the browser.

## Structure

```
www/                     the app (also the Capacitor webDir)
  index.html  styles.css  sw.js (offline cache, web hosting only)
  js/core.js             storage, helpers, charts, utility→budget link, resume hook
  js/power.js js/water.js js/budget.js js/overview.js js/settings.js
  js/sms.js              M-Pesa/bank SMS parser + review queue (no-op in browser)
  js/sync.js js/config.js   Supabase login + cloud sync
  js/notify.js           Android local notifications (alerts + reminders)
  js/i18n.js             English / Português
  js/studio.js           hidden admin tab (Gallery · Chat · PixelAnvil) via bridge/
  js/app.js              navigation + boot
bridge/                  optional PC server for the Studio tab (see bridge/README.md)
capacitor.config.json    app id / name / webDir
android/                 native project (committed)
  .../SmsReaderPlugin.java   custom plugin: inbox read + live SMS events
.github/workflows/build-apk.yml   cloud APK build
```

## Data & backup

Everything is stored on-device (`localStorage`), plus your account if you sign in.
Use **Settings → Full backup** for JSON backups (Import replaces all data, after asking), or
**Per-module data** to export/import/reset just Power, Water or Budget. On first run the app also
pulls in data from the standalone PowerTracker / BudgetTracker apps if they were used in the same
browser.
