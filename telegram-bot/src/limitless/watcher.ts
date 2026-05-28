import {
  Client,
  type WebSocketClient,
  type OrderbookUpdate,
  type NewPriceData,
} from "@limitless-exchange/sdk";
import { Bot } from "grammy";
import {
  getActiveWatches,
  updateLastSeenOdds,
  type Watch,
} from "../db/index.js";
import { fmtPct } from "../format.js";

const BASE_URL =
  process.env.LIMITLESS_API_BASE ?? "https://api.limitless.exchange";

const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const RESYNC_INTERVAL_MS = 30_000;

export function startWatcher(bot: Bot): void {
  let ws: WebSocketClient | null = null;
  let reconnectDelay = RECONNECT_BASE_MS;
  // slug → set of watch ids subscribed via marketSlugs
  const subscribedSlugs = new Set<string>();
  // address → set of watch ids subscribed via marketAddresses
  const subscribedAddresses = new Set<string>();

  function buildClient(): WebSocketClient {
    const sdkClient = new Client({ baseURL: BASE_URL });
    return sdkClient.newWebSocketClient();
  }

  function connect(): void {
    ws = buildClient();

    ws.on("connect", () => {
      console.log("[watcher] connected");
      reconnectDelay = RECONNECT_BASE_MS;
      subscribedSlugs.clear();
      subscribedAddresses.clear();
      subscribeActiveWatches().catch((e) =>
        console.error("[watcher] initial subscribe error:", e)
      );
    });

    ws.on("disconnect", () => {
      console.log(`[watcher] disconnected — reconnecting in ${reconnectDelay}ms`);
      scheduleReconnect();
    });

    ws.on("orderbookUpdate", (data: OrderbookUpdate) => {
      // CLOB market: YES price = adjustedMidpoint from the orderbook
      const slug = data.marketSlug;
      const price = data.orderbook?.adjustedMidpoint;
      if (!slug || price == null) return;
      void checkAndAlert(slug, price, null);
    });

    ws.on("newPriceData", (data: NewPriceData) => {
      // AMM market: keyed by marketAddress; iterate all price entries
      for (const entry of data.updatedPrices ?? []) {
        if (entry.yesPrice == null) continue;
        void checkAndAlert(null, entry.yesPrice, entry.marketAddress);
      }
    });
  }

  async function subscribeActiveWatches(): Promise<void> {
    if (!ws) return;
    const watches = getActiveWatches();
    const newSlugs = watches
      .filter((w) => w.market_type !== "AMM" && !subscribedSlugs.has(w.market_slug))
      .map((w) => w.market_slug);
    const newAddrs = watches
      .filter(
        (w) =>
          w.market_type === "AMM" &&
          w.market_address &&
          !subscribedAddresses.has(w.market_address)
      )
      .map((w) => w.market_address as string);

    try {
      if (newSlugs.length > 0) {
        await ws.subscribe("subscribe_market_prices", {
          marketSlugs: newSlugs,
        });
        newSlugs.forEach((s) => subscribedSlugs.add(s));
      }
      if (newAddrs.length > 0) {
        await ws.subscribe("subscribe_market_prices", {
          marketAddresses: newAddrs,
        });
        newAddrs.forEach((a) => subscribedAddresses.add(a));
      }
    } catch (err) {
      console.error("[watcher] subscribe error:", err);
    }
  }

  async function checkAndAlert(
    slug: string | null,
    currentPrice: number,
    address: string | null
  ): Promise<void> {
    const watches = getActiveWatches().filter((w) => {
      if (slug) return w.market_slug === slug;
      if (address) return w.market_address === address;
      return false;
    });

    for (const watch of watches) {
      const baseline = watch.last_seen_odds;
      if (baseline == null) {
        updateLastSeenOdds(watch.id, currentPrice);
        continue;
      }
      const drift = Math.abs(currentPrice - baseline) * 100;
      if (drift < watch.threshold_pct) continue;

      const direction = currentPrice > baseline ? "▲ up" : "▼ down";
      const displaySlug = watch.market_slug;
      const msg =
        `🔔 <b>Odds alert</b>\n\n` +
        `<code>${displaySlug}</code>\n` +
        `YES moved <b>${direction} ${drift.toFixed(1)}pp</b>\n` +
        `${fmtPct(baseline)} → ${fmtPct(currentPrice)}\n\n` +
        `<a href="https://limitless.exchange/markets/${displaySlug}">Open on Limitless</a>`;

      try {
        await bot.api.sendMessage(watch.telegram_id, msg, {
          parse_mode: "HTML",
        });
        updateLastSeenOdds(watch.id, currentPrice);
      } catch (err) {
        console.error(`[watcher] notify ${watch.telegram_id}:`, err);
      }
    }
  }

  function scheduleReconnect(): void {
    ws?.disconnect?.();
    ws = null;
    setTimeout(() => connect(), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  // Re-subscribe new watches every 30 seconds.
  setInterval(() => {
    subscribeActiveWatches().catch((e) =>
      console.error("[watcher] resync error:", e)
    );
  }, RESYNC_INTERVAL_MS);

  connect();
}
