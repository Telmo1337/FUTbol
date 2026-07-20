// Orchestration for the 💶 Pagamentos flow: the public board (post/refresh) + the admin's
// paid-set writes. Eligible payers = anyone who actually stood to play: the confirmed squad
// (RSVP IN within cap) UNION anyone who checked in UNION anyone assigned to a team — so a
// waitlist sub who was promoted late (checked in / got a team) but isn't in the RSVP-confirmed
// snapshot still shows up and can be marked paid. Pure splitting lives in core/rsvp; rendering
// in render/payment-message; SQL in db/repo. This is the wiring.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { Game } from '../types';
import { splitSquad } from '../core/rsvp';
import { COLORS } from '../discord/embeds';
import { editBoard, removeKeyboard, sendBoard } from './board';
import { paymentBoardComponents, type TeamMember } from '../discord/components';
import { renderPaymentBoard } from '../render/payment-message';

export interface PaymentState {
  players: TeamMember[]; // everyone eligible to pay — the select options + board lists
  paid: Set<string>; // tgUserId of everyone marked as paid
  priceCents: number | null; // per-person price, or null until the admin sets it
  kickoffAt: number | null; // for dating the board title
}

/** Read who's eligible to pay + who has paid + the current price for a game. */
export async function loadPaymentState(repo: Repo, game: Game): Promise<PaymentState> {
  const [rsvps, paid, slot, checkins, teams, known] = await Promise.all([
    repo.getRsvps(game.id),
    repo.getPayments(game.id),
    game.winningSlotId ? repo.getSlot(game.winningSlotId) : Promise.resolve(null),
    repo.getCheckins(game.id),
    repo.getResultTeams(game.id),
    repo.getKnownPlayers(),
  ]);
  const nameById = new Map<string, string>();
  for (const p of known) nameById.set(p.tgUserId, p.displayName);
  for (const r of rsvps) nameById.set(r.tgUserId, r.displayName); // freshest — RSVP names win

  const eligibleIds = new Set(splitSquad(rsvps, game.capPlayers).confirmed.map((r) => r.tgUserId));
  for (const c of checkins) eligibleIds.add(c.tgUserId);
  for (const t of teams) eligibleIds.add(t.tgUserId);

  // The board/totals show everyone eligible; paymentPanelComponents caps its select at
  // Discord's 25-option limit separately, so a big roster still renders the full board.
  const players: TeamMember[] = [...eligibleIds].map((tgUserId) => ({
    tgUserId,
    displayName: nameById.get(tgUserId) ?? 'Jogador',
  }));
  return { players, paid: new Set(paid), priceCents: game.pricePerPersonCents, kickoffAt: slot?.kickoffAt ?? null };
}

/** Set the paid-set to exactly `ids`, filtered to who's eligible (a crafted select can't pay outsiders). */
export async function setPaidSet(repo: Repo, game: Game, ids: string[], now: number): Promise<void> {
  const state = await loadPaymentState(repo, game);
  const squad = new Set(state.players.map((p) => p.tgUserId));
  await repo.replacePayments(game.id, ids.filter((id) => squad.has(id)), now);
}

/** Post (or re-post) the public payment board — bumps it to the bottom and stores its id. */
export async function postPaymentBoard(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.paymentMsgId) await removeKeyboard(api, game.chatId, game.paymentMsgId);
  const state = await loadPaymentState(repo, game);
  const msgId = await sendBoard(api, game.chatId, renderPaymentBoard(state), paymentBoardComponents(game.id), {
    color: COLORS.payment,
  });
  await repo.setPaymentMsg(game.id, msgId, now);
}

/** Edit the existing public board in place after an admin change (no-op if it was never posted). */
export async function refreshPaymentBoard(api: Sender, repo: Repo, game: Game): Promise<void> {
  if (!game.paymentMsgId) return;
  const state = await loadPaymentState(repo, game);
  await editBoard(api, game.chatId, game.paymentMsgId, renderPaymentBoard(state), paymentBoardComponents(game.id), COLORS.payment);
}
