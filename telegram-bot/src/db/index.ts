import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../limi.db");

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id   INTEGER PRIMARY KEY,
    wallet_address TEXT,
    timezone      TEXT NOT NULL DEFAULT 'UTC',
    pending_action TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watches (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id    INTEGER NOT NULL,
    market_slug    TEXT NOT NULL,
    threshold_pct  REAL NOT NULL,
    last_seen_odds REAL,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(telegram_id, market_slug)
  );
`);

// ── Users ──────────────────────────────────────────────────────────────────

export interface User {
  telegram_id: number;
  wallet_address: string | null;
  timezone: string;
  pending_action: string | null;
  created_at: string;
}

export function getUser(telegramId: number): User | undefined {
  return db
    .prepare("SELECT * FROM users WHERE telegram_id = ?")
    .get(telegramId) as User | undefined;
}

export function upsertUser(
  telegramId: number,
  fields: Partial<Omit<User, "telegram_id" | "created_at">>
): void {
  const existing = getUser(telegramId);
  if (!existing) {
    db.prepare(
      `INSERT INTO users (telegram_id, wallet_address, timezone, pending_action)
       VALUES (@telegram_id, @wallet_address, @timezone, @pending_action)`
    ).run({
      telegram_id: telegramId,
      wallet_address: fields.wallet_address ?? null,
      timezone: fields.timezone ?? "UTC",
      pending_action: fields.pending_action ?? null,
    });
  } else {
    const updates = Object.entries(fields)
      .map(([k]) => `${k} = @${k}`)
      .join(", ");
    db.prepare(`UPDATE users SET ${updates} WHERE telegram_id = @telegram_id`).run({
      telegram_id: telegramId,
      ...fields,
    });
  }
}

// ── Watches ────────────────────────────────────────────────────────────────

export interface Watch {
  id: number;
  telegram_id: number;
  market_slug: string;
  threshold_pct: number;
  last_seen_odds: number | null;
  active: number;
  created_at: string;
}

export function upsertWatch(
  telegramId: number,
  slug: string,
  thresholdPct: number,
  currentOdds: number | null
): void {
  db.prepare(
    `INSERT INTO watches (telegram_id, market_slug, threshold_pct, last_seen_odds, active)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(telegram_id, market_slug)
     DO UPDATE SET threshold_pct = excluded.threshold_pct,
                   last_seen_odds = excluded.last_seen_odds,
                   active = 1`
  ).run(telegramId, slug, thresholdPct, currentOdds);
}

export function getActiveWatches(): Watch[] {
  return db
    .prepare("SELECT * FROM watches WHERE active = 1")
    .all() as Watch[];
}

export function updateLastSeenOdds(id: number, odds: number): void {
  db.prepare("UPDATE watches SET last_seen_odds = ? WHERE id = ?").run(odds, id);
}

export function deactivateWatch(telegramId: number, slug: string): number {
  const res = db
    .prepare("UPDATE watches SET active = 0 WHERE telegram_id = ? AND market_slug = ?")
    .run(telegramId, slug);
  return res.changes;
}

export default db;
