# Limi — 60-Second Demo Script

**Setup before recording:**
- Bot is running with a seeded SQLite DB (Alex's wallet pre-registered, 3 positions loaded)
- One watch pre-set on a market that will "trigger" during the demo (stage the notification)
- Telegram open on phone, bot at the top of chat list
- Screen recording at 1080p, portrait if phone, landscape if desktop Telegram

---

## Script

**0:00 — Open Telegram**
Tap the Limi bot (`@uselimi_bot`). Chat opens. Show the empty state briefly.

**0:04 — /start**
Type `/start`. Bot replies:

> 👋 **Welcome to Limi**
> Your edge on Limitless prediction markets.
> Paste your Base wallet address below (starts with 0x):

Paste a wallet address. Bot confirms:

> ✅ **Wallet saved.**
> `0x1234…abcd`
> You're set. Try /briefing for your morning brief.

**0:14 — /briefing**
Type `/briefing`. Brief pause. Bot sends the morning brief:

> 🌅 **Morning brief, Alex**
>
> **Top markets**
> 📈 Will BTC hit $150k by June? — 64% YES — $1.2M vol
> 📉 Trump wins NYC mayor race — 31% YES — $890k vol
> 📊 ETH/BTC ratio > 0.05 by July — 50/50 — $440k vol
>
> **Your positions (3 open)**
> 🟢 BTC $150k: +$120 (+18%)
> 🔴 Mayor race: −$45 (−12%)
> 🟢 ETH/BTC flip: +$8 (+2%)
>
> 24h PnL: **+$83**
> [ Open Limitless ] [ See all markets ]

**0:26 — /explain**
Type `/explain btc-above-150k-jun-2026`. Bot replies with a plain-English explanation:

> **Will BTC hit $150k by June 2026?**
> Markets price this at 64% — slightly more likely than not.
>
> **Odds**
> YES 64%  ·  NO 36%
>
> 24h volume: $1.2M  ·  Resolves Fri Jun 30
>
> [ Open on Limitless ]

**0:37 — /watch**
Type `/watch btc-above-150k-jun-2026 5`. Bot replies:

> 🔔 **Watch set**
> Will BTC hit $150k by June 2026? (currently 64% YES)
> I'll alert you when YES odds shift **5pp** from this baseline.

**0:44 — Odds alert arrives (pre-staged)**
A notification pops in from Limi:

> 🔔 **Odds alert**
> `btc-above-150k-jun-2026`
> YES moved **▲ up 6.2pp**
> 58% → 64%
> [Open on Limitless]

Tap it. Market opens. Hold for one second.

**0:52 — /positions**
Back to the bot. Type `/positions`. Bot shows current portfolio:

> **Positions — 0x1234…abcd**
>
> 🟢 BTC $150k · YES: +$128 (+19%)
> 🔴 Mayor race · NO: −$45 (−12%)
> 🟢 ETH/BTC ratio · YES: +$8 (+2%)
>
> **Total PnL:** +$91

**0:58 — Outro**
Hold on the Limi chat for two seconds.
Cut to black. Text overlay:

> **Limi**
> Your edge on Limitless.
> t.me/uselimi_bot

---

## Recording notes

- Keep finger movements deliberate and slow — fast swipes read as jitter on screen recording
- Don't narrate — let the UI speak
- If using desktop Telegram, hide the left sidebar for cleaner shots
- The notification in the alert section should arrive ~2 seconds after the watch is set, not immediately — pre-stage it with a 2-second delay
- Target total runtime: 58–62 seconds
