use serde_json::Value;

pub(crate) const BASE_URL: &str = "https://api.limitless.exchange";

pub(crate) fn rt() -> Result<tokio::runtime::Runtime, String> {
    tokio::runtime::Runtime::new().map_err(|e| format!("[limi] tokio runtime: {e}"))
}

/// Percent-encode a URL path/query segment per RFC 3986.
/// Keeps unreserved characters verbatim; encodes everything else.
pub(crate) fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            use std::fmt::Write;
            let _ = write!(out, "%{b:02X}");
        }
    }
    out
}

/// Unauthenticated GET returning raw JSON. All Limi tools use public endpoints.
pub(crate) async fn get(path: &str) -> Result<Value, String> {
    let url = format!("{BASE_URL}{path}");
    let resp = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("[limi] HTTP {path}: {e}"))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("[limi] body read {path}: {e}"))?;
    if !status.is_success() {
        return Err(format!("[limi] {path} → {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| {
        format!(
            "[limi] non-JSON from {path} ({e}): {}",
            body.chars().take(200).collect::<String>()
        )
    })
}
