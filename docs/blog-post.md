# Limi: Building a Prediction Market Assistant on Aomi + Base

## The problem

Alex trades prediction markets on Limitless Exchange. He has 14 open positions right now — Bitcoin milestones, Fed rate decisions, a Premier League result, and a few political wildcards. He's good at finding edges. He's terrible at monitoring them.

The thing about prediction markets is that the interesting moves happen while you're doing something else. A policy statement drops at 2pm on a Wednesday. A key witness testifies. An economic report beats estimates. By the time Alex checks his positions in the evening, the market has already repriced — and he's sitting on a loss he could have cut, or a gain he could have pressed.

He doesn't want to watch charts. He wants to know when something material has moved.

That's the gap Limi fills.

## Three things, done well

Limi has three features. Not ten. Three.

**Morning brief.** At 8am, Telegram sends Alex a tidy summary: the top five markets by activity, then his open positions with current PnL. It takes thirty seconds to read. He knows where he stands before he opens a laptop.

**Market explainer.** When someone on Twitter mentions a market he hasn't looked at, Alex types `/explain will-fed-cut-rates-jun-2026` in Telegram and gets a plain-English breakdown: what the market resolves on, what the odds imply, how liquid it is, when it closes. No need to parse JSON or navigate a trading interface to understand a market.

**Odds alerts.** Alex sets a drift threshold — say, 5 percentage points — on any market he cares about. When the odds move that much from the baseline, he gets a notification. Not a newsletter. Not a daily digest. A specific ping about a specific market, the moment the crowd changes its mind.

## Why it's hard to do manually

Limitless has dozens of active markets at any time. Watching them manually means either checking constantly (exhausting) or checking infrequently (missing moves). There's no middle ground without automation.

The WebSocket feed that powers Limi's alerts is public. The portfolio endpoint is public. The market data is public. The technology to build this has been available for a while. What's been missing is a polished, zero-friction way to get it into a trader's workflow.

A Telegram bot is that interface. It's on the phone you already check. It requires no new app, no new tab, no new habit. The notification arrives; you tap it; you're looking at the market.

## Why Aomi

Building on Aomi meant writing the market-data tools once, in Rust, as a plugin that runs inside the chat.aomi.dev LLM agent. That gives the Aomi interface access to the same five tools the Telegram bot uses — trending markets, market detail, portfolio positions, odds snapshots, daily briefing — through natural language instead of slash commands.

The Rust plugin compiles to a shared library (`cdylib`) that the Aomi runtime loads directly. No server to maintain. No API to version. The tools run in the same process as the LLM, with typed schemas the model uses to decide when and how to call them. It's a clean model for building AI-native financial tools.

## Why Base

Limitless runs on Base mainnet. Base is cheap, fast, and has the USDC liquidity that prediction markets need. The conditional token framework that powers Limitless settlement is the same one Polymarket uses — battle-tested at scale.

The combination of a CLOB-style exchange with on-chain settlement and an off-chain order book is what makes Limitless interesting. You get price discovery from a real order book, not an AMM curve, while settlement is trustless. Limi reads all of this through public REST endpoints — no wallet required to research markets.

## Try it

The bot is live at [@uselimi\_bot](https://t.me/uselimi_bot). Start with `/briefing` if you have a Limitless wallet, or `/markets` to see what's currently active.

The Aomi app is available at [chat.aomi.dev](https://chat.aomi.dev) once activated. Source is on [GitHub](https://github.com/rehna-jp/limi_bot).
