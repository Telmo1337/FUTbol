// Game lifecycle state machine (documentation + pure predicates).
//
//   VOTING ──deadline, clear winner──▶ RSVP_OPEN
//   VOTING ──deadline, tie───────────▶ TIEBREAK ──admin picks──▶ RSVP_OPEN
//   RSVP_OPEN ──rsvp_close_at────────▶ LOCKED   (or CANCELLED if < min players)
//   LOCKED ──kickoff_at──────────────▶ PLAYED   (seam for future stats)
//   any (non-terminal) ──/cancelar───▶ CANCELLED
//
// E = event-driven (a tap or command). T = time-driven (the tick reads now vs deadlines).
import type { Game, GameStatus } from '../types';

export const TERMINAL_STATUSES: GameStatus[] = ['PLAYED', 'CANCELLED'];

export function isVotingExpired(game: Game, now: number): boolean {
  return game.status === 'VOTING' && now >= game.voteDeadline;
}

export function isRsvpExpired(game: Game, now: number): boolean {
  return game.status === 'RSVP_OPEN' && game.rsvpCloseAt != null && now >= game.rsvpCloseAt;
}
