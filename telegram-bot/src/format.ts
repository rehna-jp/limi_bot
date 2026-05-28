import type { Market, Position, PositionsResponse } from "./limitless/api.js";
import { yesPrice, allPositions } from "./limitless/api.js";

// ── HTML helpers (Telegram HTML parse mode) ────────────────────────────────

export const b = (s: string) => `<b>${s}</b>`;
export const i = (s: string) => `<i>${s}</i>`;
export const code = (s: string) => `<code>${s}</code>`;
export const link = (text: string, url: string) => `<a href="${url}">${text}</a>`;

// ── Number formatting ──────────────────────────────────────────────────────

export function fmtVol(v: number | undefined): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}

export function fmtPnl(p: number | undefined): string {
  if (p == null) return "—";
  const sign = p >= 0 ? "+" : "";
  return `${sign}$${Math.abs(p).toFixed(0)}`;
}

export function fmtPnlPct(p: number | undefined): string {
  if (p == null) return "";
  const sign = p >= 0 ? "+" : "";
  return `${sign}${Math.round(p)}%`;
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

// ── Market line for a list ─────────────────────────────────────────────────

function trendArrow(yes: number | null): string {
  if (yes == null) return "📊";
  if (yes >= 0.6) return "📈";
  if (yes <= 0.4) return "📉";
  return "📊";
}

export function marketLine(m: Market): string {
  const yes = yesPrice(m);
  const vol = m.volume24h ?? m.volume;
  const volStr = vol != null ? ` — ${fmtVol(vol)} vol` : "";
  const oddsStr = yes != null ? ` — ${fmtPct(yes)} YES` : "";
  return `${trendArrow(yes)} ${m.title}${oddsStr}${volStr}`;
}

// ── Morning briefing ───────────────────────────────────────────────────────

export function buildBriefing(
  firstName: string,
  markets: Market[],
  posRes: PositionsResponse
): string {
  const positions = allPositions(posRes);

  let msg = `🌅 ${b(`Morning brief, ${firstName}`)}\n\n`;

  msg += b("Top markets right now") + "\n";
  if (markets.length === 0) {
    msg += "No markets available right now.\n";
  } else {
    for (const m of markets.slice(0, 5)) {
      msg += marketLine(m) + "\n";
    }
  }

  msg += `\n${b(`Your positions (${positions.length} open)`)}\n`;
  if (positions.length === 0) {
    msg += "No open positions.\n";
  } else {
    let totalPnl = 0;
    for (const p of positions.slice(0, 5)) {
      const pnl = p.pnl ?? 0;
      totalPnl += pnl;
      const icon = pnl >= 0 ? "🟢" : "🔴";
      const title = p.marketTitle ?? p.marketSlug ?? "—";
      msg += `${icon} ${title}: ${fmtPnl(pnl)} (${fmtPnlPct(p.pnlPct)})\n`;
    }
    msg += `\n24h PnL: ${fmtPnl(totalPnl)}`;
  }

  return msg;
}

// ── Market explanation ─────────────────────────────────────────────────────

export function buildExplanation(market: Market): string {
  const yes = yesPrice(market);
  const expiry = fmtDate(market.expirationDate ?? market.expiration);
  const vol = fmtVol(market.volume24h ?? market.volume);

  let msg = b(market.title) + "\n\n";

  if (market.description) {
    msg += `${market.description}\n\n`;
  }

  msg += b("Current odds") + "\n";
  if (yes != null) {
    const no = 1 - yes;
    msg += `YES ${fmtPct(yes)}  ·  NO ${fmtPct(no)}\n`;
    if (yes > 0.5) {
      msg += `${i(`Market leans YES (${fmtPct(yes)} implied probability)`)}\n`;
    } else if (yes < 0.5) {
      msg += `${i(`Market leans NO (${fmtPct(no)} implied probability)`)}\n`;
    } else {
      msg += `${i("Coin flip — market is 50/50")}\n`;
    }
  }

  msg += `\n24h volume: ${vol}`;
  if (expiry !== "—") msg += `  ·  Resolves ${expiry}`;

  return msg;
}

// ── Positions list ─────────────────────────────────────────────────────────

export function buildPositions(posRes: PositionsResponse, walletShort: string): string {
  const positions = allPositions(posRes);

  if (positions.length === 0) {
    return `No open positions for ${code(walletShort)}.`;
  }

  let msg = b(`Positions for ${walletShort}`) + "\n\n";
  let totalPnl = 0;

  for (const p of positions) {
    const pnl = p.pnl ?? 0;
    totalPnl += pnl;
    const icon = pnl >= 0 ? "🟢" : "🔴";
    const title = p.marketTitle ?? p.marketSlug ?? "—";
    const outcome = p.outcome ? ` ${p.outcome}` : "";
    msg += `${icon} ${title}${outcome}: ${fmtPnl(pnl)}`;
    if (p.pnlPct != null) msg += ` (${fmtPnlPct(p.pnlPct)})`;
    msg += "\n";
  }

  msg += `\n${b("Total unrealised PnL:")} ${fmtPnl(totalPnl)}`;
  return msg;
}

// ── Markets list ───────────────────────────────────────────────────────────

export function buildMarketsList(markets: Market[], category?: string): string {
  const header = category ? `Markets · ${category}` : "Trending markets";
  let msg = b(header) + "\n\n";

  if (markets.length === 0) {
    return msg + "No markets found.";
  }

  for (const m of markets) {
    msg += marketLine(m) + "\n";
  }

  return msg;
}
