// Orchestration for the 💶 Pagamentos flow: the public board (post/refresh) + the admin's
// paid-set writes. The eligible payers = the confirmed squad (RSVP IN within cap), same as
// the team panel. Pure splitting lives in core/rsvp; rendering in render/payment-message;
// SQL in db/repo. This is the wiring.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { Game } from '../types';
import { splitSquad } from '../core/rsvp';
import { boardEmbed } from '../discord/embeds';
import { paymentBoardComponents, type TeamMember } from '../discord/components';
import { renderPaymentBoard } from '../render/payment-message';

export interface PaymentState {
  players: TeamMember[]; // the confirmed squad — the select options + board lists
  paid: Set<string>; // tgUserId of everyone marked as paid
  priceCents: number | null; // per-person price, or null until the admin sets it
  kickoffAt: number | null; // for dating the board title
}

async function sendBoard(api: Sender, chatId: string, text: string, components?: unknown[]): Promise<string> {
  return api.send(chatId, { embeds: [boardEmbed(text)], components: components ?? [] });
}
async function editBoard(api: Sender, chatId: string, msgId: string, text: string, components?: unknown[]) {
  await api.edit(chatId, msgId, { content: '', embeds: [boardEmbed(text)], components: components ?? [] });
}

/** Read the confirmed squad + who has paid + the current price for a game. */
export async function loadPaymentState(repo: Repo, game: Game): Promise<PaymentState> {
  const [rsvps, paid, slot] = await Promise.all([
    repo.getRsvps(game.id),
    repo.getPayments(game.id),
    game.winningSlotId ? repo.getSlot(game.winningSlotId) : Promise.resolve(null),
  ]);
  const players: TeamMember[] = splitSquad(rsvps, game.capPlayers).confirmed.map((r) => ({
    tgUserId: r.tgUserId,
    displayName: r.displayName,
  }));
  return { players, paid: new Set(paid), priceCents: game.pricePerPersonCents, kickoffAt: slot?.kickoffAt ?? null };
}

/** Set the paid-set to exactly `ids`, filtered to the confirmed squad (a crafted select can't pay outsiders). */
export async function setPaidSet(repo: Repo, game: Game, ids: string[], now: number): Promise<void> {
  const state = await loadPaymentState(repo, game);
  const squad = new Set(state.players.map((p) => p.tgUserId));
  await repo.replacePayments(game.id, ids.filter((id) => squad.has(id)), now);
}

/** Post (or re-post) the public payment board — bumps it to the bottom and stores its id. */
export async function postPaymentBoard(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.paymentMsgId) await api.edit(game.chatId, game.paymentMsgId, { components: [] });
  const state = await loadPaymentState(repo, game);
  const msgId = await sendBoard(api, game.chatId, renderPaymentBoard(state), paymentBoardComponents(game.id));
  await repo.setPaymentMsg(game.id, msgId, now);
}

/** Edit the existing public board in place after an admin change (no-op if it was never posted). */
export async function refreshPaymentBoard(api: Sender, repo: Repo, game: Game): Promise<void> {
  if (!game.paymentMsgId) return;
  const state = await loadPaymentState(repo, game);
  await editBoard(api, game.chatId, game.paymentMsgId, renderPaymentBoard(state), paymentBoardComponents(game.id));
}
