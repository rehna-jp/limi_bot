import { io, type Socket } from "socket.io-client";
import { Bot } from "grammy";
import {
  getActiveWatches,
  updateLastSeenOdds,
  type Watch,
} from "../db/index.js";
import { fmtPct } from "../format.js";

const WS_URL = "wss://ws.limitless.exchange";
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;

interface PriceData {
  marketAddress?: string;
  updatedPrices?: { yes?: string; no?: string };
}

interface OrderbookUpdate {
  marketSlug?: string;
  orderbook?: {
    yes?: { bids?: Array<{ price: string }>; asks?: Array<{ price: string }> };
    bids?: Array<{ price: string }>;
    asks?: Array<{ price: string }>;
  };
}

function bestYesPrice(update: OrderbookUpdate): number | null {
  // Try CLOB orderbook shape: yes asks (best ask = current price to buy YES)
  const yesAsks =
    update.orderbook?.yes?.asks ??
    update.orderbook?.asks;
  if (yesAsks && yesAsks.length > 0) {
    return parseFloat(yesAsks[0].price);
  }
  return null;
}

export function startWatcher(bot: Bot): void {
  let reconnectDelay = RECONNECT_BASE_MS;
  let socket: Socket | null = null;
  const subscribedSlugs = new Set<string>();

  function connect(): void {
    socket = io(WS_URL, {
      path: "/socket.io",
      transports: ["websocket"],
      reconnection: false, // we handle reconnect ourselves with backoff
    });

    socket.on("connect", () => {
      console.log("[watcher] connected");
      reconnectDelay = RECONNECT_BASE_MS;
      subscribedSlugs.clear();
      subscribeActiveWatches();
    });

    socket.on("disconnect", (reason: string) => {
      console.log(`[watcher] disconnected: ${reason}. Reconnecting in ${reconnectDelay}ms`);
      scheduleReconnect();
    });

    socket.on("connect_error", (err: Error) => {
      console.error(`[watcher] connection error: ${err.message}. Retry in ${reconnectDelay}ms`);
      scheduleReconnect();
    });

    socket.on("orderbookUpdate", async (data: OrderbookUpdate) => {
      const slug = data.marketSlug;
      if (!slug) return;
      const price = bestYesPrice(data);
      if (price == null) return;
      await checkAndAlert(slug, price);
    });

    socket.on("newPriceData", async (data: PriceData) => {
      // AMM price update — keyed by address, not slug.
      // We match by the address we subscribed with if applicable.
      const rawYes = data.updatedPrices?.yes;
      if (!rawYes) return;
      const price = parseFloat(rawYes);
      // Best effort: check all active watches against this price.
      // For CLOB-only Limitless, this path is rarely hit.
      const watches = getActiveWatches();
      for (const w of watches) {
        await checkAndAlert(w.market_slug, price, w);
      }
    });
  }

  function subscribeActiveWatches(): void {
    const watches = getActiveWatches();
    for (const w of watches) {
      subscribeSlug(w.market_slug);
    }
  }

  function subscribeSlug(slug: string): void {
    if (subscribedSlugs.has(slug) || !socket?.connected) return;
    socket.emit("subscribe_market_prices", { slug });
    subscribedSlugs.add(slug);
  }

  async function checkAndAlert(
    slug: string,
    currentPrice: number,
    hint?: Watch
  ): Promise<void> {
    const watches = getActiveWatches().filter((w) => w.market_slug === slug);
    for (const watch of watches) {
      const baseline = watch.last_seen_odds;
      if (baseline == null) {
        updateLastSeenOdds(watch.id, currentPrice);
        continue;
      }
      const drift = Math.abs(currentPrice - baseline) * 100;
      if (drift >= watch.threshold_pct) {
        const direction = currentPrice > baseline ? "▲ up" : "▼ down";
        const msg =
          `🔔 <b>Odds alert</b>\n\n` +
          `<code>${slug}</code>\n` +
          `YES moved <b>${direction} ${drift.toFixed(1)}pp</b>\n` +
          `${fmtPct(baseline)} → ${fmtPct(currentPrice)}\n\n` +
          `<a href="https://limitless.exchange/markets/${slug}">Open on Limitless</a>`;

        try {
          await bot.api.sendMessage(watch.telegram_id, msg, {
            parse_mode: "HTML",
          });
          updateLastSeenOdds(watch.id, currentPrice);
        } catch (err) {
          console.error(`[watcher] failed to notify ${watch.telegram_id}:`, err);
        }
      }
    }
  }

  function scheduleReconnect(): void {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    setTimeout(() => {
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  // Re-subscribe new watches every 30 seconds (picks up /watch commands).
  setInterval(() => {
    subscribeActiveWatches();
  }, 30_000);

  connect();
}
