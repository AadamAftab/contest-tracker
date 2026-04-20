# ◈ Contest Tracker Extension

Never miss a competitive programming contest again.

## Supported Platforms
- **Codeforces** · **CodeChef** · **AtCoder** · **LeetCode**
- **Kaggle** · **HackerRank** · **HackerEarth** · **TopCoder**
- More via the [Kontests API](https://kontests.net/)

---

## Installation

### Chrome / Edge / Brave / Arc
1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Done! The ◈ icon appears in your toolbar

### Firefox
1. Copy `manifest.firefox.json` → `manifest.json` (replace the Chrome one)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** → select `manifest.json`

### Safari (macOS)
- Requires Xcode + conversion via `xcrun safari-web-extension-converter .`
- Full guide: https://developer.apple.com/documentation/safariservices/safari_web_extensions

---

## Project Structure

```
contest-tracker/
├── manifest.json              # Chrome/Edge/Brave (MV3)
├── manifest.firefox.json      # Firefox (MV2)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background/
    │   └── worker.js          # Service worker: fetch, alarms, notifications
    └── popup/
        ├── popup.html         # UI shell
        ├── popup.css          # Styles
        └── popup.js           # UI logic
```

---

## How It Works

1. **Data Source**: Uses [Kontests.net API](https://kontests.net/) — a free aggregator that polls CF, CC, AC, LC, Kaggle, and more
2. **Refresh Cycle**: Fetches fresh data every hour via `chrome.alarms`
3. **Notifications**: Configurable lead times (5m, 15m, 30m, 1h, 1 day before start)
4. **Filters**: All / Today / Per-platform tabs in popup

---

## ──────────────────────────────────────────────────
## WEBSITE EXPANSION PLAN
## ──────────────────────────────────────────────────

When you're ready to turn this into a full web app, here's the roadmap:

### Phase 1 — Static Web Dashboard
**Stack**: Next.js 14 (App Router) + Tailwind CSS  
**Deploy**: Vercel (free tier)

- Server-side fetch from Kontests API every 5 minutes (ISR)  
- Same filter/sort UI as extension  
- No auth needed  
- Share links like `contesttracker.dev/codeforces`

### Phase 2 — User Accounts + Personalization
**Add**: Supabase (auth + Postgres) or Firebase

- Save preferred platforms and alert times per user  
- Email digests (daily / weekly upcoming schedule) via Resend or SendGrid  
- Calendar export (.ics) — subscribe to contest calendar in Google/Apple Cal  
- "Bookmark" contests to a personal list

### Phase 3 — Smart Features
- **Registration links** — deep link to each contest's registration page  
- **Difficulty tags** — pull problem counts/rating ranges from CF/AC APIs  
- **Rating filter** — show only contests relevant to your level  
- **Post-contest editorials** — auto-link to editorial threads  
- **Personal history** — track which contests you participated in

### Phase 4 — Community
- Upvote/comment on contests  
- Discord bot that posts daily digest to a server  
- API endpoint so others can build on your aggregator  
- Open-source the project; accept platform contributions via PR

### Tech Decisions at Scale
| Need | Choice |
|---|---|
| Hosting | Vercel + Supabase |
| Background jobs | Vercel Cron or Railway worker |
| Email | Resend (great DX, generous free tier) |
| Auth | Supabase Auth (GitHub OAuth) |
| DB | Postgres via Supabase |
| Calendar | ical.js for .ics generation |
| Analytics | Plausible (privacy-friendly) |

---

## Adding More Platforms

Edit the `PLATFORMS` object in both `worker.js` and `popup.js`.  
The Kontests API already handles aggregation — just add a display entry:

```js
myplatform: { name: 'MyPlatform', color: '#HEX', icon: 'MP' }
```

---

## License
MIT
