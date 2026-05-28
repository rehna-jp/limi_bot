const BASE = process.env.LIMITLESS_API_BASE ?? "https://api.limitless.exchange";

// ── Loose types — the Limitless API response shapes vary; we use optional
//    chaining throughout to degrade gracefully rather than throw.

export interface Market {
  slug: string;
  title: string;
  description?: string;
  category?: string;
  prices?: { yes?: string; no?: string };
  outcomes?: string[];
  volume24h?: number;
  volume?: number;
  expirationDate?: string;
  expiration?: string;
  liquidity?: number;
  type?: string;
}

export interface OrderbookLevel {
  price: string;
  size: string;
  side?: string;
}

export interface Orderbook {
  bids?: OrderbookLevel[];
  asks?: OrderbookLevel[];
  yes?: { bids?: OrderbookLevel[]; asks?: OrderbookLevel[] };
  no?: { bids?: OrderbookLevel[]; asks?: OrderbookLevel[] };
}

export interface Position {
  marketSlug?: string;
  marketTitle?: string;
  outcome?: string;
  size?: number;
  avgPrice?: number;
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
  // CLOB shape
  ctfBalance?: string;
  averageFillPrice?: string;
  costBasis?: string;
  marketValue?: string;
}

export interface PositionsResponse {
  clob?: Position[];
  amm?: Position[];
  positions?: Position[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "Limi-Bot/0.1" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Limitless API ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── Public endpoints ───────────────────────────────────────────────────────

export async function getTrendingMarkets(
  limit = 10,
  category?: string
): Promise<Market[]> {
  let path = `/markets/active?limit=${limit}&page=1`;
  if (category) path += `&category=${encodeURIComponent(category)}`;
  const res = await get<{ data?: Market[] } | Market[]>(path);
  // Handle both { data: [...] } and bare array shapes.
  if (Array.isArray(res)) return res;
  if (Array.isArray((res as { data?: Market[] }).data))
    return (res as { data: Market[] }).data;
  return [];
}

export async function getMarket(slugOrAddress: string): Promise<Market> {
  return get<Market>(`/markets/${encodeURIComponent(slugOrAddress)}`);
}

export async function getOrderbook(slug: string): Promise<Orderbook> {
  return get<Orderbook>(
    `/markets/${encodeURIComponent(slug)}/orderbook`
  );
}

export async function getUserPositions(
  address: string
): Promise<PositionsResponse> {
  return get<PositionsResponse>(
    `/public-portfolio/positions?address=${encodeURIComponent(address)}`
  );
}

// ── Price helpers ──────────────────────────────────────────────────────────

/** Extract YES price (0-1) from a market object, trying common field shapes. */
export function yesPrice(market: Market): number | null {
  const raw = market.prices?.yes ?? (market as unknown as Record<string, unknown>).yesPrice;
  if (typeof raw === "string") return parseFloat(raw);
  if (typeof raw === "number") return raw;
  return null;
}

/** Combine all positions (CLOB + AMM) from a positions response. */
export function allPositions(res: PositionsResponse): Position[] {
  return [
    ...(res.clob ?? []),
    ...(res.amm ?? []),
    ...(res.positions ?? []),
  ];
}
