// The Sunday-18:00 auto-game: once a week the cron opens a vote with the field's free
// slots, so the group never has to run /novojogo by hand. Pure wiring — slot math lives
// in core/availability.ts, the Firestore reads in services/field.ts.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { FieldClient } from './field';
import { loadFreeSlots } from './field';
import * as games from './games';
import { lisbonParts } from '../core/time';
import {
  DEFAULT_CAP_PLAYERS,
  DEFAULT_MIN_PLAYERS,
  VOTE_LEAD_BEFORE_EARLIEST_MS,
  WEEKLY_LOCATION_NOTE,
  WEEKLY_TRIGGER_DOW,
  WEEKLY_TRIGGER_HOUR,
} from '../config';

const HOUR_MS = 3_600_000;

export interface WeeklyConfig {
  /** Channel to post the auto-game in. Empty string disables the feature. */
  channelId: string;
  /** Stored as the game's creator (first admin id, or 'system'). */
  createdBy: string;
}

/**
 * True during the Sunday-18:00 Lisbon hour. We match the whole hour (any minute), not a
 * single minute, so a skipped/retried tick still fires; the getCurrentGame guard below
 * makes sure only the first tick of that hour actually creates a game.
 */
export function isWeeklyTriggerWindow(now: number): boolean {
  const p = lisbonParts(now);
  return p.weekday === WEEKLY_TRIGGER_DOW && p.hour === WEEKLY_TRIGGER_HOUR;
}

export async function maybeCreateWeeklyGame(
  api: Sender,
  repo: Repo,
  client: FieldClient,
  cfg: WeeklyConfig,
  now: number,
): Promise<void> {
  if (!cfg.channelId) return; // feature not configured → off
  if (!isWeeklyTriggerWindow(now)) return;
  if (await repo.getCurrentGame(cfg.channelId)) return; // a game is already live → dedup

  try {
    const slots = await loadFreeSlots(client, { now }); // sorted ascending, capped
    if (slots.length < 2) {
      console.log('[weekly] skip — only', slots.length, 'free slot(s) this week');
      return;
    }
    // Same default as /novojogo: deadline 6h before the earliest slot, clamped to the future.
    let voteDeadline = slots[0].kickoffAt - VOTE_LEAD_BEFORE_EARLIEST_MS;
    if (voteDeadline <= now) voteDeadline = now + HOUR_MS;

    await games.createGame(api, repo, {
      chatId: cfg.channelId,
      createdBy: cfg.createdBy,
      locationNote: WEEKLY_LOCATION_NOTE,
      minPlayers: DEFAULT_MIN_PLAYERS,
      capPlayers: DEFAULT_CAP_PLAYERS,
      voteDeadline,
      slots,
      now,
    });
    console.log('[weekly] opened auto-game with', slots.length, 'slots in', cfg.channelId);
  } catch (e) {
    console.error('[weekly]', e); // never let a Firestore/Discord hiccup break the tick
  }
}
