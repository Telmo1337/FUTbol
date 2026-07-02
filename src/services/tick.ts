// The only clock. Runs every minute on Workers (Cron Trigger).
// Advances time-driven transitions and fires due nudges. Idempotent: safe to re-run.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { FieldClient } from './field';
import { isCheckinExpired, isRsvpExpired, isVotingExpired } from '../core/lifecycle';
import * as games from './games';
import { maybeOpenNextGame, type WeeklyConfig } from './weekly';

export async function runTick(
  api: Sender,
  repo: Repo,
  now: number,
  field: FieldClient,
  weekly: WeeklyConfig,
): Promise<void> {
  const active = await repo.getActiveGames();
  for (const game of active) {
    try {
      if (isVotingExpired(game, now)) {
        await games.closeVoting(api, repo, game, now);
      } else if (game.status === 'RSVP_OPEN') {
        if (isRsvpExpired(game, now)) await games.closeRsvp(api, repo, game, now);
        else await games.processNudges(api, repo, game.id, now);
      } else if (game.status === 'LOCKED') {
        const slot = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
        if (slot && now >= slot.kickoffAt) await games.openCheckin(api, repo, game, now);
      } else if (game.status === 'CHECKIN_OPEN') {
        if (isCheckinExpired(game, now)) await games.closeCheckin(api, repo, game, now);
      } else if (game.status === 'TIEBREAK') {
        // Normally waits for the admin to pick — the one time-driven exception is a dead
        // tiebreak whose every candidate slot has already passed (processed too late).
        await games.expireTiebreak(api, repo, game, now);
      }
    } catch (e) {
      console.error('[tick] game', game.id, e);
    }
  }

  // Event-driven: open the next game as soon as none is in progress (within daytime hours).
  await maybeOpenNextGame(api, repo, field, weekly, now);
}
