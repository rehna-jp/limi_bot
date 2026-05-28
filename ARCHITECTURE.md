# ARCHITECTURE.md
# Limi — Deployment Architecture & Runtime Model

Answers to all Step 0 architecture questions, sourced from reading
`aomi-sdk/docs/host-interop.md`, `aomi-sdk/apps/limitless/`, `aomi-sdk/apps/polymarket/`,
`examples/hello-ci/`, and the Limitless WebSocket docs.

---

## a. How does the Telegram bot talk to the Aomi runtime?

**Short answer: it doesn't. They are parallel, independent frontends.**

The Aomi plugin (compiled cdylib) is loaded by the Aomi hosted runtime server.
There is no public REST or WebSocket API that lets an external process (e.g. a
Telegram bot) invoke tool functions inside the Aomi runtime. Tools are only
invoked when the LLM agent at `chat.aomi.dev` decides to call them in response
to a user chat message.

**What this means for Limi:**

```
┌─────────────────────────────────────┐   ┌────────────────────────────────────┐
│         Telegram Bot (TypeScript)   │   │        Aomi App (Rust cdylib)      │
│                                     │   │                                    │
│  /briefing → calls Limitless API    │   │  chat.aomi.dev LLM agent calls     │
│             directly via HTTP       │   │  limi_get_trending_markets() etc.  │
│                                     │   │  which call Limitless API directly │
│  WebSocket watcher → connects to    │   │                                    │
│  wss://ws.limitless.exchange        │   │  Both surfaces; same data source;  │
│                                     │   │  no inter-process communication    │
└──────────────┬──────────────────────┘   └──────────────┬─────────────────────┘
               │                                          │
               └──────────────────────┬───────────────────┘
                                      ▼
                          https://api.limitless.exchange
                          (shared Limitless Exchange API)
```

The Telegram bot and the Aomi app are two separate surfaces over the same data.
They do not communicate with each other.

---

## b. Does the Aomi runtime need to run locally for development?

**No local runtime is needed.** Development flow:

1. **Write & test tool logic locally** — tools are plain Rust functions.
   Mock the Limitless HTTP responses in unit tests. The SDK has a testing module
   (`sdk/src/testing.rs`) but for our use case `cargo test` with mock HTTP is enough.

2. **Compile locally** to verify correctness:
   ```
   cargo build --release --target x86_64-unknown-linux-gnu
   cargo clippy -- -D warnings
   ```

3. **Deploy via PR** to `aomi-labs/community-apps` → CI builds → GitHub release.

4. **Chat at chat.aomi.dev** once the Aomi team activates the app (24-48h after PR).

There is no `cargo run` for an Aomi app — the cdylib is not executable. The only
way to run the tools against real user sessions is through the hosted runtime.
For end-to-end API testing, call the Limitless REST endpoints directly from a
standalone test binary or the TypeScript bot.

---

## c. Tool function signatures — 2 real examples from the codebase

### Example 1: Simple read tool (from `apps/limitless/src/tool.rs`)

```rust
pub(crate) struct SearchMarkets;

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct SearchMarketsArgs {
    /// Free-text query (e.g., "election", "ETH price by year-end").
    pub query: String,
    /// Max markets to return (default 20).
    #[serde(default)]
    pub limit: Option<i64>,
}

impl DynAomiTool for SearchMarkets {
    type App = LimitlessApp;
    type Args = SearchMarketsArgs;
    const NAME: &'static str = "limitless_search_markets";
    const DESCRIPTION: &'static str =
        "Semantic search across active Limitless prediction markets. \
         Use when the user names a topic...";

    fn run(
        _app: &LimitlessApp,
        args: Self::Args,
        _ctx: DynToolCallCtx,
    ) -> Result<Value, String> {
        let runtime = tokio::runtime::Runtime::new()
            .map_err(|e| format!("runtime: {e}"))?;
        runtime.block_on(async move {
            let path = format!("/markets/search?query={}", urlencode(&args.query));
            let resp = public_get(&path).await?;
            Ok(resp)
        })
    }
}
```

Key points:
- `fn run(...)` is synchronous at the FFI boundary — use `Runtime::block_on()` for async HTTP
- Args field doc comments (` /// `) become model-facing parameter descriptions
- Return `Result<Value, String>` — any JSON object is valid; errors are surfaced to the LLM
- `_ctx: DynToolCallCtx` carries `session_id`, `secrets` (API keys), `state_attributes` (wallet address etc.)

### Example 2: Routed tool (wallet signing, from `apps/polymarket/src/tool.rs`)

```rust
impl DynAomiTool for BuildPolymarketOrder {
    type App = PolymarketApp;
    type Args = BuildOrderArgs;
    const NAME: &'static str = "build_polymarket_order";
    const DESCRIPTION: &'static str = "...";

    // Override run_with_routes instead of run when you need the host
    // to take a follow-up action (wallet signing, tx submission, etc.)
    fn run_with_routes(
        app: &Self::App,
        args: Self::Args,
        ctx: DynToolCallCtx,
    ) -> Result<ToolReturn, String> {
        // ... build order data ...
        Ok(ToolReturn::route(result)
            .next(|next| {
                next.add::<host::CommitEip712>(wallet_request)
                    .bind_as("order_signature")
                    .note("Sign this order.");
            })
            .after::<SubmitPolymarketOrder>(submit_template)
            .awaits("order_signature")
            .note("Wallet signed — submit now.")
            .build())
    }
}
```

For Limi (read-only, no trading), we only use the simple `run()` pattern.
No `ToolReturn` routing needed.

---

## d. How does wallet context flow from user → runtime → plugin?

The flow for read-only apps (our case):

```
User connects wallet at chat.aomi.dev
        ↓
Aomi runtime injects wallet address into DynToolCallCtx.state_attributes:
  { "user": { "evm": { "address": "0x..." } } }
        ↓
Tool reads it: ctx.attribute_string(&["user", "evm", "address"])
```

For apps that need the actual wallet to sign:
- Plugin declares `namespaces = ["evm-core"]` in `dyn_aomi_app!`
- This unlocks host tools: `stage_tx`, `simulate_batch`, `commit_tx`, `commit_eip712`
- Plugin stages a transaction via `ToolReturn` routing → host pops a wallet prompt → user signs in browser → callback injects the signature back into the next tool call
- Plugin never holds private keys

**For Limi (read-only portfolio + market data):**
- User provides their Base wallet address in the Telegram bot's `/start` onboarding
- Aomi app: wallet address comes from `DynToolCallCtx.state_attributes["user"]["evm"]["address"]`
- No signing needed → declare `namespaces = ["common"]` (no `evm-core`)

Secrets (API keys) use a separate channel:
```rust
const SECRET_API_KEY: Secret = Secret::new(
    "LIMITLESS_API_KEY",
    "Description shown in settings UI.",
    true, // required — app won't load without this
);
// At tool-call time:
let key = ctx.secrets.get("LIMITLESS_API_KEY").ok_or("missing key")?;
// or via the SDK helper:
resolve_secret_value(&ctx, None, "LIMITLESS_API_KEY", "missing key")?;
```

---

## e. Can the plugin trigger proactive messages (push notifications)?

**No. Tools are strictly request/response.**

The Aomi runtime calls a tool only when the LLM decides to invoke it in response
to a user message. There is no mechanism for a plugin to:
- Push a message to the user without a user-initiated chat turn
- Subscribe to external events and react to them
- Run background tasks or timers

This is a fundamental constraint of the cdylib plugin model: the `.so` is a
library, not a process. It has no event loop of its own.

**Consequence for Limi:** The odds-drift alert feature cannot be implemented
inside the Aomi plugin. It lives entirely in the Telegram bot side-process.

---

## f. Where does the WebSocket odds-watcher live?

**In the Telegram bot side-process.** The watcher is a background task that:

1. Connects to `wss://ws.limitless.exchange` (Socket.IO, namespace `/markets`)
2. On connect, calls `subscribe_market_prices` for each slug in the `watches` table
3. Listens for `orderbookUpdate` events (CLOB markets, which Limitless uses)
4. On each event: check `last_seen_odds` in SQLite; if drift ≥ threshold → send Telegram message → update `last_seen_odds`
5. Exponential backoff reconnect on disconnect

Relevant Socket.IO event shapes:

```typescript
// Subscribe to a market's price updates:
socket.emit('subscribe_market_prices', { slug: 'btc-above-100k-jul' });

// Receive orderbook updates:
socket.on('orderbookUpdate', (data: {
  marketSlug: string;
  orderbook: { bids: [...], asks: [...] };
  timestamp: string;
}) => { ... });

// Price updates (AMM markets):
socket.on('newPriceData', (data: {
  marketAddress: string;
  updatedPrices: { yes: string; no: string };  // decimal strings, not floats
  timestamp: string;
}) => { ... });
```

**Important:** Use `socket.io-client` (not raw WebSocket). Prices are decimal
strings — parse with `parseFloat()`, never use as JS numbers directly for
comparisons.

---

## Limi Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Limi Monorepo                                 │
│                                                                      │
│  ┌─────────────────────────┐   ┌────────────────────────────────┐   │
│  │    aomi-app/ (Rust)      │   │   telegram-bot/ (TypeScript)   │   │
│  │    cdylib plugin         │   │   Node.js process              │   │
│  │                          │   │                                │   │
│  │  5 tools:                │   │  Commands:                     │   │
│  │  - get_trending_markets  │   │  /start, /briefing, /explain   │   │
│  │  - explain_market        │   │  /markets, /watch, /positions  │   │
│  │  - get_user_positions    │   │                                │   │
│  │  - watch_market_odds     │   │  SQLite: users, watches        │   │
│  │  - daily_briefing        │   │                                │   │
│  │                          │   │  Background:                   │   │
│  │  Deployed to:            │   │  WebSocket watcher             │   │
│  │  aomi-labs/community-    │   │  → wss://ws.limitless.exchange │   │
│  │  apps as apps/limi/      │   │  → odds drift → Telegram push  │   │
│  │                          │   │                                │   │
│  │  Accessible at:          │   │  Morning cron (8am):           │   │
│  │  chat.aomi.dev           │   │  → /briefing auto-send         │   │
│  └──────────┬───────────────┘   └──────────────┬─────────────────┘   │
│             │                                  │                      │
└─────────────┼──────────────────────────────────┼──────────────────────┘
              │                                  │
              └──────────────┬───────────────────┘
                             ▼
              ┌──────────────────────────────┐
              │   api.limitless.exchange      │
              │   wss://ws.limitless.exchange │
              │   (Limitless Exchange API)    │
              └──────────────────────────────┘
```

---

## Environment Variables Summary

```
# Telegram bot (.env)
TELEGRAM_BOT_TOKEN=          # From @BotFather
LIMITLESS_API_BASE=https://api.limitless.exchange  # Override for staging

# Aomi app (set in chat.aomi.dev settings after activation)
# These are stored in the Aomi secret vault, not .env files:
LIMITLESS_API_KEY=           # From limitless.exchange → Settings → API Keys
LIMITLESS_API_SECRET=        # Base64-encoded, shown once on creation
```

---

## Decision Log

| Question | Answer | Source |
|----------|--------|--------|
| Telegram bot ↔ Aomi runtime | No connection — parallel frontends | No public Aomi tool API found; plugin model is request/response only |
| Local runtime needed? | No — compile locally, run at chat.aomi.dev | CI/deploy docs; no local server binary in SDK |
| Tool return type | `Result<Value, String>` | `sdk/src/types.rs` DynAomiTool trait |
| Wallet in ctx | `ctx.state_attributes["user"]["evm"]["address"]` | `sdk/src/types.rs` DynToolCallCtx + limitless app usage |
| Plugin push possible? | No | cdylib is a library; no event loop |
| WebSocket where? | Telegram bot side-process | Only component with a running process |
| Namespaces for Limi | `["common"]` (no wallet needed for reads) | hello-ci uses "common"; evm-core only needed for signing |
