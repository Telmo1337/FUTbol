// Pure decision: which automated nudges are due for a game right now.
// Each is guarded by a flag on the game so it fires exactly once.
import { NONRESP_PING_BEFORE_CLOSE_MS, SHORT_WARN_BEFORE_CLOSE_MS } from '../config';
import type { Game } from '../types';

export type NudgeKind = 'GAME_ON' | 'SHORT_WARN' | 'NONRESP_PING';

export function dueNudges(game: Game, inCount: number, now: number): NudgeKind[] {
  const due: NudgeKind[] = [];
  if (game.status !== 'RSVP_OPEN' || game.rsvpCloseAt == null) return due;
  const toClose = game.rsvpCloseAt - now;
  if (toClose <= 0) return due;

  if (!game.flagGameOnSent && inCount >= game.minPlayers) due.push('GAME_ON');
  if (!game.flagShortWarnSent && inCount < game.minPlayers && toClose <= SHORT_WARN_BEFORE_CLOSE_MS) {
    due.push('SHORT_WARN');
  }
  if (!game.flagNonrespPingSent && toClose <= NONRESP_PING_BEFORE_CLOSE_MS) due.push('NONRESP_PING');
  return due;
}
