// Game lifecycle state machine (documentation + pure predicates).
//
//   VOTING ──deadline, clear winner──▶ RSVP_OPEN
//   VOTING ──deadline, tie───────────▶ TIEBREAK ──admin picks──▶ RSVP_OPEN
//   VOTING ──deadline, no future slots─▶ CANCELLED   (processed too late; cron may relaunch)
//   TIEBREAK ──every slot passes─────▶ CANCELLED   (dead tiebreak; cron may relaunch)
//   RSVP_OPEN ──rsvp_close_at────────▶ LOCKED   (or CANCELLED if < min players)
//   LOCKED ──kickoff_at──────────────▶ CHECKIN_OPEN  (bot posts the "Cheguei ✅" board)
//   CHECKIN_OPEN ──checkin_close_at──▶ PLAYED         (ghosts assigned, recap posted)
//   any (non-terminal) ──/cancelar───▶ CANCELLED_ADMIN   (a deliberate stop; cron won't auto-reopen)
//
// E = event-driven (a tap or command). T = time-driven (the tick reads now vs deadlines).
import type { Game, GameStatus } from '../types';

export const TERMINAL_STATUSES: GameStatus[] = ['PLAYED', 'CANCELLED', 'CANCELLED_ADMIN'];

export function isVotingExpired(game: Game, now: number): boolean {
  return game.status === 'VOTING' && now >= game.voteDeadline;
}

export function isRsvpExpired(game: Game, now: number): boolean {
  return game.status === 'RSVP_OPEN' && game.rsvpCloseAt != null && now >= game.rsvpCloseAt;
}

export function isCheckinExpired(game: Game, now: number): boolean {
  return game.status === 'CHECKIN_OPEN' && game.checkinCloseAt != null && now >= game.checkinCloseAt;
}
