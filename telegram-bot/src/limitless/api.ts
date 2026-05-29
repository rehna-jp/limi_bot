import axios from "axios";
import {
  Client,
  RateLimitError,
  type MarketInterface,
  type Market as MarketClass,
  type OrderBook,
  type CLOBPosition,
  type AMMPosition,
  type PortfolioPositionsResponse,
} from "@limitless-exchange/sdk";
import Bottleneck from "bottleneck";

// Use MarketInterface everywhere — it's the plain data shape that both
// getActiveMarkets() (returns MarketInterface[]) and getMarket() (returns
// Market class, which extends MarketInterface) satisfy.
export type Market = MarketInterface;
export type { OrderBook, CLOBPosition, AMMPosition };

// ── Rate limiter ───────────────────────────────────────────────────────────
// Max 2 concurrent requests, minimum 300ms between job starts.

const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 300 });

const BASE_URL =
  process.env.LIMITLESS_API_BASE ?? "https://api.limitless.exchange";

const sdkClient = new Client({ baseURL: BASE_URL });

// ── Retry helper — one retry after 600ms on 429 ───────────────────────────

async function once<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RateLimitError) {
      await sleep(600);
      return fn();
    }
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Market data ───────────────────────────────────────────────────────────

export async function getTrendingMarkets(
  limit = 10,
  category?: string
): Promise<Market[]> {
  const cappedLimit = Math.min(limit, 25);
  const res = await limiter.schedule(() =>
    once(() => sdkClient.markets.getActiveMarkets({ limit: cappedLimit, page: 1 }))
  );
  const markets: Market[] = res.data ?? [];
  if (!category) return markets;
  const q = category.toLowerCase();
  return markets.filter(
    (m) =>
      m.categories?.some((c: string) => c.toLowerCase().includes(q)) ||
      m.title?.toLowerCase().includes(q)
  );
}

export async function getMarket(slug: string): Promise<Market> {
  // getMarket() returns the Market class which extends MarketInterface.
  return limiter.schedule(() =>
    once(() => sdkClient.markets.getMarket(slug) as Promise<MarketClass>)
  ) as Promise<Market>;
}

export async function getOrderbook(slug: string): Promise<OrderBook | null> {
  try {
    return await limiter.schedule(() =>
      once(() => sdkClient.markets.getOrderBook(slug))
    );
  } catch {
    // NegRisk group markets and some AMM markets don't have a CLOB orderbook.
    return null;
  }
}

// ── Public portfolio (no auth) ─────────────────────────────────────────────
// SDK's PortfolioFetcher.getPositions() requires authentication.
// The public endpoint accepts a wallet address with no credentials.

export interface PublicPosition {
  marketSlug?: string;
  marketTitle?: string;
  outcome?: string;
  unrealizedPnl?: string | number;
  costBasis?: string | number;
  marketValue?: string | number;
  pnlPct?: number;
}

export interface PublicPortfolioResponse {
  clob?: PublicPosition[];
  amm?: PublicPosition[];
  positions?: PublicPosition[];
}

export async function getUserPositions(
  address: string
): Promise<PublicPortfolioResponse> {
  return limiter.schedule(() =>
    once(async () => {
      try {
        const res = await axios.get<PublicPortfolioResponse>(
          `${BASE_URL}/public-portfolio/positions`,
          {
            params: { address },
            headers: { "User-Agent": "Limi-Bot/0.1" },
            timeout: 10_000,
          }
        );
        return res.data;
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 429) throw new RateLimitError("rate limited");
          // 404 = wallet has no positions on Limitless
          if (err.response?.status === 404) return {} as PublicPortfolioResponse;
        }
        throw err;
      }
    })
  );
}

// ── Price helpers ─────────────────────────────────────────────────────────

/** Best-effort YES price (0-1) from an SDK Market object. */
export function yesPrice(market: Market): number | null {
  // SDK: prices[0] = YES, prices[1] = NO (0-1 range)
  if (Array.isArray(market.prices) && market.prices[0] != null) {
    return market.prices[0];
  }
  // Fallback: outcomes list
  const yes = market.outcomes?.find(
    (o) => o.title?.toUpperCase() === "YES"
  );
  if (yes?.price != null) return yes.price;
  // Fallback: tradePrices midpoint
  if (market.tradePrices) {
    const buyYes = market.tradePrices.buy.market[0];
    const sellYes = market.tradePrices.sell.market[0];
    if (buyYes != null && sellYes != null) return (buyYes + sellYes) / 2;
  }
  return null;
}

/** Whether a market is a NegRisk group (has child markets, no direct orderbook). */
export function isNegRiskGroup(market: Market): boolean {
  return (
    Array.isArray(market.markets) &&
    market.markets.length > 0 &&
    market.marketType === "NegRisk"
  );
}

/** Combine all positions from a public portfolio response. */
export function allPositions(res: PublicPortfolioResponse): PublicPosition[] {
  return [
    ...(res.clob ?? []),
    ...(res.amm ?? []),
    ...(res.positions ?? []),
  ];
}
