import "dotenv/config";
import { Bot } from "grammy";
import cron from "node-cron";

import { handleStart, handleText } from "./commands/start.js";
import { handleBriefing } from "./commands/briefing.js";
import { handleExplain } from "./commands/explain.js";
import {
  handleMarkets,
  handleExplainCallback,
} from "./commands/markets.js";
import { handleWatch } from "./commands/watch.js";
import { handlePositions } from "./commands/positions.js";
import { handleHelp } from "./commands/help.js";
import { startWatcher } from "./limitless/watcher.js";
import db, { getUser } from "./db/index.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

const bot = new Bot(token);

// ── Commands ───────────────────────────────────────────────────────────────

bot.command("start", handleStart);
bot.command("briefing", handleBriefing);
bot.command("explain", handleExplain);
bot.command("markets", handleMarkets);
bot.command("watch", handleWatch);
bot.command("positions", handlePositions);
bot.command("help", handleHelp);

// ── Callback queries (inline keyboard taps) ────────────────────────────────

bot.callbackQuery(/^explain:/, handleExplainCallback);

// ── Plain text → multi-step flows ──────────────────────────────────────────

bot.on("message:text", handleText);

// ── Morning briefing cron (8 AM UTC) ──────────────────────────────────────

cron.schedule("0 8 * * *", async () => {
  console.log("[cron] sending morning briefings");
  const users = db
    .prepare("SELECT * FROM users WHERE wallet_address IS NOT NULL")
    .all() as Array<{ telegram_id: number; wallet_address: string }>;

  for (const user of users) {
    try {
      // Reuse the briefing handler by faking a context is error-prone;
      // instead call the underlying API and send directly.
      const { getTrendingMarkets, getUserPositions } = await import(
        "./limitless/api.js"
      );
      const { buildBriefing } = await import("./format.js");
      const { InlineKeyboard } = await import("grammy");

      const [markets, positions] = await Promise.all([
        getTrendingMarkets(5),
        getUserPositions(user.wallet_address),
      ]);
      const text = buildBriefing("trader", markets, positions);
      const keyboard = new InlineKeyboard()
        .url("Open Limitless", "https://limitless.exchange")
        .url("See all markets", "https://limitless.exchange/markets");

      await bot.api.sendMessage(user.telegram_id, text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error(`[cron] briefing failed for ${user.telegram_id}:`, err);
    }
  }
});

// ── Error handler ──────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error("[bot] unhandled error:", err.error);
});

// ── Start ──────────────────────────────────────────────────────────────────

bot.start({ onStart: () => console.log("[bot] running") });
startWatcher(bot);
