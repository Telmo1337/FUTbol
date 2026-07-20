// The event-driven auto-game: as soon as no game is in progress in the channel — i.e. the
// previous one was just played (PLAYED) or fell through for lack of players (CANCELLED) — the
// cron opens the next vote with the field's free slots, so the group never has to run
// /novojogo by hand and always gets the maximum heads-up. Pure wiring — slot math lives in
// core/availability.ts, the Firestore reads in services/field.ts.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { FieldClient } from './field';
import { loadFreeSlots } from './field';
import * as games from './games';
import { lisbonParts } from '../core/time';
import {
  AUTO_OPEN_COOLDOWN_MS,
  AUTO_OPEN_END_HOUR,
  AUTO_OPEN_START_HOUR,
  DEFAULT_CAP_PLAYERS,
  DEFAULT_MIN_PLAYERS,
  MIN_VOTE_WINDOW_MS,
  VOTE_LEAD_BEFORE_EARLIEST_MS,
  WEEKLY_LOCATION_NOTE,
} from '../config';

export interface WeeklyConfig {
  /** Channel to post the auto-game in. Empty string disables the feature. */
  channelId: string;
  /** Stored as the game's creator (first admin id, or 'system'). */
  createdBy: string;
}

/**
 * Daytime guard: only auto-open between AUTO_OPEN_START_HOUR and AUTO_OPEN_END_HOUR (Lisbon),
 * so a game that finishes late at night doesn't ping the group at 3am — it waits for the morning.
 */
export function isAutoOpenHour(now: number): boolean {
  const p = lisbonParts(now);
  return p.hour >= AUTO_OPEN_START_HOUR && p.hour < AUTO_OPEN_END_HOUR;
}

export async function maybeOpenNextGame(
  api: Sender,
  repo: Repo,
  client: FieldClient,
  cfg: WeeklyConfig,
  now: number,
): Promise<void> {
  if (!cfg.channelId) return; // feature not configured → off
  if (!isAutoOpenHour(now)) return; // outside daytime → hold until the morning

  try {
    if (await repo.getCurrentGame(cfg.channelId)) return; // a game is still in progress → dedup
    const last = await repo.getLastGame(cfg.channelId);
    // An admin's explicit /cancelar is a deliberate "stop" — don't auto-reopen a poll behind their
    // back. The next game then waits for a manual /novojogo. (A game that merely fell through for too
    // few players stays plain CANCELLED and DOES auto-reopen, to give the group another shot.)
    if (last?.status === 'CANCELLED_ADMIN') return;
    if (last != null && now - last.createdAt < AUTO_OPEN_COOLDOWN_MS) return; // opened one recently → cool down

    const slots = await loadFreeSlots(client, { now }); // sorted ascending, capped
    if (slots.length < 2) {
      console.log('[auto] skip — only', slots.length, 'free slot(s) ahead');
      return;
    }
    // Same default as /novojogo: deadline 6h before the earliest slot, but never less than
    // MIN_VOTE_WINDOW_MS from now — a same-day earliest slot must not squeeze the group's
    // voting window down to something nobody has a real chance to see and respond to.
    let voteDeadline = slots[0].kickoffAt - VOTE_LEAD_BEFORE_EARLIEST_MS;
    if (voteDeadline < now + MIN_VOTE_WINDOW_MS) voteDeadline = now + MIN_VOTE_WINDOW_MS;

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
    console.log('[auto] opened next game with', slots.length, 'slots in', cfg.channelId);
  } catch (e) {
    console.error('[auto]', e); // never let a Firestore/Discord hiccup break the tick
  }
}
