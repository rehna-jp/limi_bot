import type { Market } from "./limitless/api.js";
import type { PublicPosition, PublicPortfolioResponse } from "./limitless/api.js";
import { yesPrice, allPositions } from "./limitless/api.js";

// ── HTML helpers ───────────────────────────────────────────────────────────

export const b = (s: string) => `<b>${s}</b>`;
export const i = (s: string) => `<i>${s}</i>`;
export const code = (s: string) => `<code>${s}</code>`;

// ── Number formatting ──────────────────────────────────────────────────────

export function fmtVol(v: number | undefined | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}

/** +$120 or -$45, no cents */
export function fmtPnl(p: number | null | undefined): string {
  if (p == null) return "—";
  const sign = p >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(p).toFixed(0)}`;
}

/** +18% or -12% */
function fmtPnlPct(p: number | null | undefined): string {
  if (p == null) return "";
  const sign = p >= 0 ? "+" : "−";
  return `${sign}${Math.abs(Math.round(p))}%`;
}

export function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── Position PnL ───────────────────────────────────────────────────────────
// Public portfolio endpoint can return several shapes.
// CLOB: unrealizedPnl as 6-decimal USDC string ("1234567" = $1.23)
// AMM: unrealizedPnl may be decimal string already ("1.23")
// We attempt both interpretations and pick the sensible one.

function parseUsdc6(s: string | number | undefined): number | null {
  if (s == null) return null;
  const n = typeof s === "number" ? s : parseFloat(s);
  if (isNaN(n)) return null;
  // Heuristic: if |value| > 1000, assume 6-decimal micro-USDC, divide by 1e6.
  // Most real P&L values fall within ±$1000; micro-USDC strings for $1 = 1000000.
  return Math.abs(n) > 1000 ? n / 1_000_000 : n;
}

function positionPnl(p: PublicPosition): number | null {
  if (p.unrealizedPnl != null) return parseUsdc6(p.unrealizedPnl);
  const mv = parseUsdc6(p.marketValue);
  const cb = parseUsdc6(p.costBasis);
  if (mv != null && cb != null) return mv - cb;
  return null;
}

function positionPnlPct(p: PublicPosition): number | null {
  if (p.pnlPct != null) return p.pnlPct;
  const pnl = positionPnl(p);
  const cb = parseUsdc6(p.costBasis);
  if (pnl != null && cb != null && cb !== 0) return (pnl / cb) * 100;
  return null;
}

// ── Market line (used in briefing + /markets) ──────────────────────────────

function trendIcon(yes: number | null): string {
  if (yes == null) return "📊";
  if (yes >= 0.6) return "📈";
  if (yes <= 0.4) return "📉";
  return "📊";
}

function oddsLabel(yes: number | null): string {
  if (yes == null) return "";
  const pct = Math.round(yes * 100);
  if (pct === 50) return " — 50/50";
  const side = pct > 50 ? "YES" : "NO";
  const display = pct > 50 ? pct : 100 - pct;
  return ` — ${display}% ${side}`;
}

export function marketLine(m: Market): string {
  const yes = yesPrice(m);
  // SDK Market.volume is a string like "1234567.89"; volumeFormatted is human-readable.
  const rawVol = m.volume != null ? parseFloat(m.volume) : null;
  const volStr =
    rawVol != null && !isNaN(rawVol) ? ` — ${fmtVol(rawVol)} vol` : "";
  return `${trendIcon(yes)} ${m.title}${oddsLabel(yes)}${volStr}`;
}

// ── Morning briefing ───────────────────────────────────────────────────────
//
// Target format (from spec):
//
//   🌅 Morning brief, Alex
//
//   📊 Top markets
//   📈 Will BTC hit $150k by June? — 64% YES — $1.2M vol
//   📉 Trump wins NYC mayor race — 31% YES — $890k vol
//
//   💼 Your positions (3 open)
//   🟢 BTC $150k: +$120 (+18%)
//   🔴 Mayor race: −$45 (−12%)
//
//   24h PnL: +$83

export function buildBriefing(
  firstName: string,
  markets: Market[],
  posRes: PublicPortfolioResponse
): string {
  const positions = allPositions(posRes);
  const lines: string[] = [];

  lines.push(`🌅 ${b(`Morning brief, ${firstName}`)}`);
  lines.push("");

  // Markets section
  lines.push(b("Top markets"));
  if (markets.length === 0) {
    lines.push("No markets right now.");
  } else {
    for (const m of markets.slice(0, 5)) {
      lines.push(marketLine(m));
    }
  }

  lines.push("");

  // Positions section
  lines.push(b(`Your positions (${positions.length} open)`));
  if (positions.length === 0) {
    lines.push("No open positions.");
  } else {
    let totalPnl = 0;
    for (const p of positions.slice(0, 6)) {
      const pnl = positionPnl(p) ?? 0;
      const pct = positionPnlPct(p);
      totalPnl += pnl;
      const icon = pnl >= 0 ? "🟢" : "🔴";
      const title = truncate(p.marketTitle ?? p.marketSlug ?? "—", 28);
      const pctStr = pct != null ? ` (${fmtPnlPct(pct)})` : "";
      lines.push(`${icon} ${title}: ${fmtPnl(pnl)}${pctStr}`);
    }
    lines.push("");
    lines.push(`24h PnL: ${b(fmtPnl(totalPnl))}`);
  }

  return lines.join("\n");
}

// ── Market explanation ─────────────────────────────────────────────────────
//
// Target format:
//
//   <b>Will BTC hit $150k by June 2026?</b>
//   Markets are pricing this at 64% — slightly more likely than not.
//
//   <b>Odds</b>
//   YES 64%  ·  NO 36%
//
//   24h volume: $1.2M  ·  Resolves Fri Jun 30

export function buildExplanation(market: Market, isGroup = false): string {
  const yes = yesPrice(market);
  const expiry = fmtDate(market.expirationDate ?? market.resolutionDate);
  const rawVol = market.volume != null ? parseFloat(market.volume) : null;
  const vol = rawVol != null && !isNaN(rawVol) ? fmtVol(rawVol) : "—";
  const lines: string[] = [];

  lines.push(b(market.title));

  // NegRisk group market — list child markets instead of showing a single price
  if (isGroup && Array.isArray(market.markets) && market.markets.length > 0) {
    lines.push("");
    lines.push(i("Multi-outcome market. Outcomes:"));
    for (const child of market.markets.slice(0, 8)) {
      const childYes = yesPrice(child);
      const oddsStr = childYes != null ? ` — ${fmtPct(childYes)} YES` : "";
      lines.push(`• ${child.title}${oddsStr}`);
    }
    return lines.join("\n");
  }

  // Plain-English lead
  if (yes != null) {
    const pct = Math.round(yes * 100);
    if (pct >= 70) {
      lines.push(`Markets price this at ${pct}% — a strong lean toward YES.`);
    } else if (pct >= 55) {
      lines.push(`Markets price this at ${pct}% — slightly more likely than not.`);
    } else if (pct === 50) {
      lines.push("Markets are split 50/50 on this one.");
    } else if (pct <= 30) {
      lines.push(`Markets price this at ${100 - pct}% NO — heavily expected not to happen.`);
    } else {
      lines.push(`Markets lean NO at ${100 - pct}%.`);
    }
  } else if (market.description) {
    lines.push(truncate(market.description, 200));
  }

  lines.push("");
  lines.push(b("Odds"));

  if (yes != null) {
    const no = 1 - yes;
    lines.push(`YES ${fmtPct(yes)}  ·  NO ${fmtPct(no)}`);
  } else {
    lines.push("Odds unavailable.");
  }

  const meta: string[] = [];
  if (vol !== "—") meta.push(`24h volume: ${vol}`);
  if (expiry !== "—") meta.push(`Resolves ${expiry}`);
  if (meta.length > 0) {
    lines.push("");
    lines.push(meta.join("  ·  "));
  }

  return lines.join("\n");
}

// ── Positions list ─────────────────────────────────────────────────────────

export function buildPositions(
  posRes: PublicPortfolioResponse,
  walletShort: string
): string {
  const positions = allPositions(posRes);

  if (positions.length === 0) {
    return `No open positions for ${code(walletShort)}.`;
  }

  const lines: string[] = [];
  lines.push(b(`Positions — ${walletShort}`));
  lines.push("");

  let totalPnl = 0;
  for (const p of positions) {
    const pnl = positionPnl(p) ?? 0;
    const pct = positionPnlPct(p);
    totalPnl += pnl;
    const icon = pnl >= 0 ? "🟢" : "🔴";
    const title = truncate(p.marketTitle ?? p.marketSlug ?? "—", 32);
    const outcome = p.outcome ? ` · ${p.outcome}` : "";
    const pctStr = pct != null ? ` (${fmtPnlPct(pct)})` : "";
    lines.push(`${icon} ${title}${outcome}: ${fmtPnl(pnl)}${pctStr}`);
  }

  lines.push("");
  lines.push(`${b("Total PnL:")} ${fmtPnl(totalPnl)}`);

  return lines.join("\n");
}

// ── Markets list ───────────────────────────────────────────────────────────

export function buildMarketsList(markets: Market[], category?: string): string {
  const header = category ? `Markets · ${category}` : "Trending markets";
  const lines: string[] = [b(header), ""];

  if (markets.length === 0) {
    lines.push("Nothing found.");
    return lines.join("\n");
  }

  for (const m of markets) {
    lines.push(marketLine(m));
  }

  return lines.join("\n");
}
