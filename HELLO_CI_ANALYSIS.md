# HELLO_CI_ANALYSIS.md
# Line-by-Line Breakdown of `examples/hello-ci`

This is the golden reference every Aomi community app must mirror exactly.
Deviation from this structure will cause CI to reject the build.

---

## File: `examples/hello-ci/Cargo.toml`

```toml
[package]
name = "hello-ci"         # Must match the app slug (kebab-case). Ours: "limi"
version = "0.1.0"         # Semver string — passed into dyn_aomi_app! macro
edition = "2024"          # Rust 2024 edition — do not downgrade
publish = false           # Never publish to crates.io — this is a cdylib artifact

[lib]
crate-type = ["cdylib"]   # HARD REQUIREMENT: must be cdylib, not rlib or bin
                           # The runtime dlopen()s this .so — any other crate-type breaks CI

[dependencies]
aomi-sdk = "=0.1.19"      # HARD REQUIREMENT: exact pin with leading = 
                           # "^0.1.19" and "0.1.19" both break CI
                           # ci/platform.json required_sdk_version = "0.1.19"
schemars = "1.0"          # JSON Schema generation for tool arg structs
serde = { version = "1", features = ["derive"] }   # Deserialization of tool args
serde_json = "1"          # serde_json::Value — return type for all tools
```

**What to replicate for Limi:** Same structure, different `name = "limi"`. Add
`reqwest`, `tokio`, `anyhow` for the HTTP client. Keep the exact SDK pin.

---

## File: `examples/hello-ci/src/lib.rs`

```rust
// Line 1-4: Imports — always import from aomi_sdk, not aomi-sdk (hyphen vs underscore)
use aomi_sdk::{DynAomiTool, DynToolCallCtx, dyn_aomi_app};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::Value;

// Lines 6-7: App struct — a zero-field marker type.
// Must be Clone + Default (derive both). This struct is the App type
// parameter for every tool in the crate.
#[derive(Clone, Default)]
struct HelloCiApp;

// Lines 9-12: Args struct — one per tool. 
// Must derive Debug + Deserialize + JsonSchema (all three, always).
// Field doc comments become the parameter descriptions the LLM sees.
#[derive(Debug, Deserialize, JsonSchema)]
struct EchoArgs {
    message: String,
}

// Line 14: Tool struct — a zero-field marker type, one per tool.
struct EchoTool;

// Lines 16-30: DynAomiTool impl — the contract.
impl DynAomiTool for EchoTool {
    type App = HelloCiApp;     // Must match the app struct above
    type Args = EchoArgs;      // Must match the args struct above

    // NAME: snake_case, prefixed with the app name. Used by the LLM + runtime
    // to dispatch tool calls. Must be globally unique across all loaded apps.
    const NAME: &'static str = "hello_ci_echo";

    // DESCRIPTION: the model-facing string. The LLM reads this to decide
    // whether to call the tool. Write it as a sentence describing what the
    // tool does and when to use it.
    const DESCRIPTION: &'static str = "Echo a message for CI bundle validation.";

    // run(): the tool implementation. Signature is fixed:
    //   _app: &Self::App    — app state (usually unused for stateless tools)
    //   args: Self::Args    — deserialized, type-safe arguments
    //   _ctx: DynToolCallCtx — runtime context: session_id, secrets, state_attributes
    // Returns: Result<serde_json::Value, String>
    //   Ok(value) — any JSON value returned to the LLM as the tool result
    //   Err(msg)  — error string surfaced to the LLM as a tool failure
    fn run(
        _app: &HelloCiApp,
        args: Self::Args,
        _ctx: DynToolCallCtx,
    ) -> Result<Value, String> {
        Ok(serde_json::json!({ "message": args.message }))
    }
}

// Lines 32-39: dyn_aomi_app! macro — the app manifest declaration.
// This generates the FFI entry points (aomi_dyn_manifest, aomi_dyn_tool_call, etc.)
// that the Aomi runtime calls after dlopen().
// MUST appear exactly once per crate, in lib.rs.
dyn_aomi_app!(
    app = HelloCiApp,           // The app struct. Must be Clone + Default.
    name = "hello-ci",          // App slug. Must match community-apps apps/{name}/.
    version = "0.1.0",          // Semver. No "v" prefix.
    preamble = "You are the CI validation fixture app.",
                                // System prompt injected into the LLM context.
                                // For production apps: detailed instructions on
                                // tool usage, safety rules, and conventions.
    tools = [EchoTool],         // All tool structs. Comma-separated. No trailing comma needed.
    namespaces = ["common"]     // Host namespaces to inject alongside app tools.
                                // "common" = basic host tools (no wallet).
                                // "evm-core" = EVM wallet tools (stage_tx, commit_eip712, etc.)
                                // For Limi (read-only): use "common"
);
```

**Key observations:**
- There is NO `#[no_mangle]` or `extern "C"` anywhere in user code — the macro handles the FFI boundary
- There is NO `fn main()` — this is a library crate only
- The tool's `run()` is synchronous even when making HTTP calls (use `tokio::runtime::Runtime::new()?.block_on(...)` for async)
- `dyn_aomi_app!` is the only required macro call

---

## File: `examples/hello-ci/.aomi-publish/manifest.json`

This file is **auto-generated by CI** (`scripts/publish_app.py`) — you do NOT
write it by hand. It exists in the repo only as a reference/template showing
what the publish script produces.

```json
{
  "version": "aomi-git-stage-v1",   // CI bundle contract version — do not change
  "platform": "community",           // Must be "community" for community-apps PRs
  "app": {
    "slug": "hello-ci",              // Matches name in dyn_aomi_app! and apps/ directory
    "display_name": "Hello CI",      // Human-readable name
    "config_path": "aomi.toml"       // Unused in current flow; leave as-is
  },
  "source": { ... },                 // Git metadata — filled by publish_app.py
  "publish": {
    "source_repo": "aomi-labs/community-apps",
    "release_tag_convention": "apps-{app_slug}-{short_commit}",
    // → For Limi: release tag will be apps-limi-<12-char-commit>
    "visibility": "public",
    "review_policy": "community-review"
  },
  "files": [
    // SHA256 checksums of Cargo.toml and src/lib.rs — auto-computed
  ]
}
```

---

## CI Flow: `.github/workflows/publish-apps.yml`

The full publish pipeline, step by step:

```
1. Trigger: push to branch `publish` touching apps/**
   (NOT main — you must push to the `publish` branch to activate CI)

2. Job: detect
   → python3 scripts/publish_app.py detect-changed
   → Finds all app directories that changed since the previous push
   → Outputs a JSON array of app dirs (e.g. ["apps/limi"])

3. Job: publish (matrix over detected apps)
   a. Install Rust toolchain: 1.91 (exact), target x86_64-unknown-linux-gnu
   b. Run: python3 scripts/publish_app.py build
      - Reads ci/platform.json (required_sdk_version = "0.1.19")
      - Validates Cargo.toml: crate-type == ["cdylib"], sdk version == "=0.1.19"
      - cargo build --release --target x86_64-unknown-linux-gnu
      - Bundles the .so + manifest into a tarball
      - Outputs: release_tag, tarball path, manifest path
   c. gh release create apps-limi-<short_commit> --title ... <tarball> <manifest>
      → GitHub release is public; Aomi fetcher pulls from here

4. Post-CI: Aomi team manually activates the app (24-48h)
   → They run: aomi activate apps-limi-<commit>
   → App becomes available at chat.aomi.dev
```

**Critical path for our PR:**
- Fork `aomi-labs/community-apps`
- Add `apps/limi/` mirroring hello-ci structure
- Push to the `publish` branch (NOT main)
- CI builds and creates GitHub release
- Open PR; Aomi team activates after review

---

## Directory Structure to Replicate

```
apps/limi/                          ← Must live under apps/, not examples/
├── Cargo.toml                      ← See spec above
└── src/
    ├── lib.rs                      ← dyn_aomi_app! macro lives here
    ├── client.rs                   ← HTTP client + typed models (Limitless API)
    └── tool.rs                     ← Tool implementations
```

No `aomi.toml` is required at this stage (the field in manifest.json is unused).
No workspace `Cargo.toml` — each app is a standalone crate.

---

## Checklist Before Opening PR

- [ ] `apps/limi/Cargo.toml`: `crate-type = ["cdylib"]` present
- [ ] `apps/limi/Cargo.toml`: `aomi-sdk = "=0.1.19"` (exact equals sign)
- [ ] `apps/limi/Cargo.toml`: `edition = "2024"`
- [ ] `apps/limi/src/lib.rs`: `dyn_aomi_app!` macro invoked once
- [ ] `cargo build --release --target x86_64-unknown-linux-gnu` passes
- [ ] `cargo clippy -- -D warnings` clean
- [ ] No hardcoded secrets in source
- [ ] PR opened against `aomi-labs/community-apps` (the fork), not `aomi-sdk`
