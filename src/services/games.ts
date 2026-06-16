// Orchestration: turns events/time into Discord actions + DB writes.
// Pure logic lives in core/*; this is the wiring. Called by the interactions handler and the tick.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { Game, RsvpStatus, Slot } from '../types';
import { M } from '../messages';
import { esc, mention } from '../util';
import { CHECKIN_WINDOW_MS, GROUP_PING, RSVP_CLOSE_BEFORE_KICKOFF_MS } from '../config';
import { countVoters, pickWinner, tallyVotes } from '../core/voting';
import { confirmedIds, splitSquad } from '../core/rsvp';
import { dueNudges } from '../core/nudges';
import { renderVoteMessage, renderVoteResult, renderVoteTie } from '../render/vote-message';
import { renderRsvpMessage } from '../render/rsvp-message';
import { renderCheckinBoard } from '../render/checkin-message';
import { renderRecap } from '../render/recap-message';
import {
  checkinComponents,
  recapComponents,
  rsvpComponents,
  tieComponents,
  voteComponents,
} from '../discord/components';

const MAX_PING = 15;

// ---------- Discord send/edit helpers ----------
/** Post a message; returns the new message id. */
async function send(
  api: Sender,
  chatId: string,
  text: string,
  components?: unknown[],
  allowedMentions?: ('users' | 'everyone')[],
): Promise<string> {
  return api.send(chatId, { content: text, components: components ?? [], allowedMentions });
}

/** Edit a board's text (and buttons) in place. */
async function safeEditText(api: Sender, chatId: string, msgId: string, text: string, components?: unknown[]) {
  await api.edit(chatId, msgId, { content: text, components: components ?? [] });
}

/** Strip the buttons off a message, leaving its text untouched. */
async function removeKeyboard(api: Sender, chatId: string, msgId: string) {
  await api.edit(chatId, msgId, { components: [] });
}

// Present (checked-in, incl. subs) vs the confirmed squad who are still absent.
// During the window the absent set is "pending"; after it closes the same set are the 👻 ghosts.
async function attendanceView(repo: Repo, game: Game) {
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const rsvps = await repo.getRsvps(game.id);
  const split = splitSquad(rsvps, game.capPlayers);
  const rows = await repo.getCheckins(game.id);
  const presentIds = new Set(rows.map((c) => c.tgUserId));
  const nameById = new Map(rsvps.map((r) => [r.tgUserId, r.displayName] as const));
  const present = rows.map((c) => ({ tgUserId: c.tgUserId, displayName: nameById.get(c.tgUserId) ?? 'Jogador' }));
  const confirmedAbsent = split.confirmed
    .filter((p) => !presentIds.has(p.tgUserId))
    .map((p) => ({ tgUserId: p.tgUserId, displayName: p.displayName }));
  return { winnerLabel: winner?.label ?? '', present, confirmedAbsent };
}

// ---------- create ----------
export async function createGame(
  api: Sender,
  repo: Repo,
  input: {
    chatId: string;
    createdBy: string;
    locationNote: string;
    minPlayers: number;
    capPlayers: number;
    voteDeadline: number;
    slots: { kickoffAt: number; label: string }[];
    now: number;
  },
): Promise<void> {
  const gameId = await repo.createGame({
    chatId: input.chatId,
    createdBy: input.createdBy,
    locationNote: input.locationNote,
    minPlayers: input.minPlayers,
    capPlayers: input.capPlayers,
    voteDeadline: input.voteDeadline,
    now: input.now,
  });
  await repo.addSlots(
    gameId,
    input.slots.map((s, i) => ({ kickoffAt: s.kickoffAt, label: s.label, sortOrder: i })),
  );
  const slots = await repo.getSlots(gameId);
  // Ping the group once, only at "come and vote" — re-renders use the plain board.
  // This is the single message allowed to resolve @everyone (the group ping).
  const text = `${GROUP_PING}\n${renderVoteMessage(input.locationNote, tallyVotes(slots, []), input.voteDeadline, 0)}`;
  const msgId = await send(api, input.chatId, text, voteComponents(gameId, slots), ['users', 'everyone']);
  await repo.setVoteMsg(gameId, msgId, input.now);
}

// ---------- voting ----------
export async function handleVote(
  api: Sender,
  repo: Repo,
  gameId: number,
  slotId: number,
  userId: string,
  now: number,
): Promise<string> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'VOTING') return M.cb.votingClosed;
  const res = await repo.toggleVote(gameId, slotId, userId, now);
  await rerenderVote(api, repo, game);
  return res === 'added' ? M.cb.voteAdded : M.cb.voteRemoved;
}

async function rerenderVote(api: Sender, repo: Repo, game: Game): Promise<void> {
  if (!game.voteMsgId) return;
  const slots = await repo.getSlots(game.id);
  const votes = await repo.getVotes(game.id);
  const text = renderVoteMessage(game.locationNote, tallyVotes(slots, votes), game.voteDeadline, countVoters(votes));
  await safeEditText(api, game.chatId, game.voteMsgId, text, voteComponents(game.id, slots));
}

export async function closeVoting(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'VOTING') return;
  const slots = await repo.getSlots(game.id);
  const votes = await repo.getVotes(game.id);
  const { winner, tied } = pickWinner(slots, votes);
  if (winner) {
    await openRsvp(api, repo, game, winner, now);
  } else {
    await repo.setStatus(game.id, 'TIEBREAK', now);
    if (game.voteMsgId) {
      await safeEditText(api, game.chatId, game.voteMsgId, renderVoteTie(game.locationNote, tallyVotes(slots, votes)));
      await removeKeyboard(api, game.chatId, game.voteMsgId);
    }
    await send(api, game.chatId, M.tieAdminPrompt, tieComponents(game.id, tied.length ? tied : slots));
  }
}

export async function resolveTie(api: Sender, repo: Repo, gameId: number, slotId: number, now: number): Promise<boolean> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'TIEBREAK') return false;
  const slot = await repo.getSlot(slotId);
  if (!slot || slot.gameId !== gameId) return false;
  await openRsvp(api, repo, game, slot, now);
  return true;
}

async function openRsvp(api: Sender, repo: Repo, game: Game, winner: Slot, now: number): Promise<void> {
  const rsvpCloseAt = winner.kickoffAt - RSVP_CLOSE_BEFORE_KICKOFF_MS;
  await repo.lockWinner(game.id, winner.id, rsvpCloseAt, now);
  if (game.voteMsgId) {
    await safeEditText(api, game.chatId, game.voteMsgId, renderVoteResult(game.locationNote, winner.label));
    await removeKeyboard(api, game.chatId, game.voteMsgId);
  }
  const text = renderRsvpMessage({
    loc: game.locationNote,
    winnerLabel: winner.label,
    min: game.minPlayers,
    cap: game.capPlayers,
    split: splitSquad([], game.capPlayers),
    rsvpCloseAt,
    state: 'open',
  });
  const msgId = await send(api, game.chatId, text, rsvpComponents(game.id));
  await repo.setRsvpMsg(game.id, msgId, now);
}

// ---------- rsvp ----------
export async function handleRsvp(
  api: Sender,
  repo: Repo,
  gameId: number,
  userId: string,
  status: RsvpStatus,
  now: number,
): Promise<string> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'RSVP_OPEN') return M.cb.rsvpClosed;
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const winnerLabel = winner?.label ?? '';

  const before = confirmedIds(await repo.getRsvps(gameId), game.capPlayers);
  await repo.setRsvp(gameId, userId, status, now);
  const after = await repo.getRsvps(gameId);
  const afterConfirmed = confirmedIds(after, game.capPlayers);

  // Notify anyone newly promoted into the squad (not the person who just tapped).
  for (const r of after) {
    if (r.tgUserId === userId) continue;
    if (afterConfirmed.has(r.tgUserId) && !before.has(r.tgUserId)) {
      if (await repo.markPromotedNotified(gameId, r.tgUserId, now)) {
        await send(api, game.chatId, M.promoted(mention(r), winnerLabel, game.locationNote));
      }
    }
  }

  await rerenderRsvp(api, repo, game, 'open');
  await processNudges(api, repo, gameId, now);

  if (status === 'IN') return afterConfirmed.has(userId) ? M.cb.rsvpIn : M.cb.rsvpWait;
  if (status === 'OUT') return M.cb.rsvpOut;
  return M.cb.rsvpMaybe;
}

async function rerenderRsvp(
  api: Sender,
  repo: Repo,
  game: Game,
  state: 'open' | 'locked' | 'cancelled',
): Promise<void> {
  if (!game.rsvpMsgId) return;
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
  const text = renderRsvpMessage({
    loc: game.locationNote,
    winnerLabel: winner?.label ?? '',
    min: game.minPlayers,
    cap: game.capPlayers,
    split,
    rsvpCloseAt: game.rsvpCloseAt,
    state,
  });
  await safeEditText(api, game.chatId, game.rsvpMsgId, text, state === 'open' ? rsvpComponents(game.id) : undefined);
  if (state !== 'open') await removeKeyboard(api, game.chatId, game.rsvpMsgId);
}

// ---------- nudges ----------
export async function processNudges(api: Sender, repo: Repo, gameId: number, now: number): Promise<void> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'RSVP_OPEN') return;
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const winnerLabel = winner?.label ?? '';
  const rsvps = await repo.getRsvps(gameId);
  const inCount = splitSquad(rsvps, game.capPlayers).confirmed.length;

  for (const kind of dueNudges(game, inCount, now)) {
    if (kind === 'GAME_ON') {
      await send(api, game.chatId, M.gameOn(inCount, winnerLabel, game.locationNote));
      await repo.setNudgeFlag(gameId, 'GAME_ON', now);
    } else if (kind === 'SHORT_WARN') {
      await send(api, game.chatId, M.shortWarn(game.minPlayers - inCount, inCount, game.minPlayers, winnerLabel));
      await repo.setNudgeFlag(gameId, 'SHORT_WARN', now);
    } else if (kind === 'NONRESP_PING') {
      const responded = new Set(rsvps.map((r) => r.tgUserId));
      const missing = (await repo.getKnownPlayers())
        .filter((p) => !responded.has(p.tgUserId) && p.tgUserId !== game.createdBy)
        .slice(0, MAX_PING);
      if (missing.length > 0) {
        await send(api, game.chatId, M.nonRespPing(missing.map(mention).join(', '), winnerLabel));
      }
      await repo.setNudgeFlag(gameId, 'NONRESP_PING', now);
    }
  }
}

// ---------- close / cancel ----------
export async function closeRsvp(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'RSVP_OPEN') return;
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  const winnerLabel = winner?.label ?? '';
  const split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
  const inCount = split.confirmed.length;

  if (inCount >= game.minPlayers) {
    await repo.setStatus(game.id, 'LOCKED', now);
    await rerenderRsvp(api, repo, { ...game, status: 'LOCKED' }, 'locked');
    const names = split.confirmed.map((p, i) => `${i + 1}. ${esc(p.displayName)}`).join('\n');
    await send(api, game.chatId, M.rsvpClosedFinal(winnerLabel, game.locationNote, names));
  } else {
    await repo.setStatus(game.id, 'CANCELLED', now);
    await rerenderRsvp(api, repo, { ...game, status: 'CANCELLED' }, 'cancelled');
    await send(api, game.chatId, M.cancelledNotEnough(winnerLabel, inCount, game.minPlayers));
  }
}

export async function cancelGame(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  await repo.setStatus(game.id, 'CANCELLED', now);
  if (game.rsvpMsgId) await rerenderRsvp(api, repo, { ...game, status: 'CANCELLED' }, 'cancelled');
  else if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
  await send(api, game.chatId, M.cancelledByAdmin);
}

// ---------- /jogo : bump the live message to the bottom of the chat ----------
export async function repost(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status === 'VOTING') {
    const slots = await repo.getSlots(game.id);
    const votes = await repo.getVotes(game.id);
    const text = renderVoteMessage(game.locationNote, tallyVotes(slots, votes), game.voteDeadline, countVoters(votes));
    if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
    const msgId = await send(api, game.chatId, text, voteComponents(game.id, slots));
    await repo.setVoteMsg(game.id, msgId, now);
  } else if (game.status === 'RSVP_OPEN') {
    const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
    const split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
    const text = renderRsvpMessage({
      loc: game.locationNote,
      winnerLabel: winner?.label ?? '',
      min: game.minPlayers,
      cap: game.capPlayers,
      split,
      rsvpCloseAt: game.rsvpCloseAt,
      state: 'open',
    });
    if (game.rsvpMsgId) await removeKeyboard(api, game.chatId, game.rsvpMsgId);
    const msgId = await send(api, game.chatId, text, rsvpComponents(game.id));
    await repo.setRsvpMsg(game.id, msgId, now);
  } else if (game.status === 'TIEBREAK') {
    const slots = await repo.getSlots(game.id);
    await send(api, game.chatId, M.tieAdminPrompt, tieComponents(game.id, slots));
  } else if (game.status === 'CHECKIN_OPEN') {
    const v = await attendanceView(repo, game);
    if (game.checkinMsgId) await removeKeyboard(api, game.chatId, game.checkinMsgId);
    const text = renderCheckinBoard({
      winnerLabel: v.winnerLabel,
      present: v.present,
      pending: v.confirmedAbsent,
      checkinCloseAt: game.checkinCloseAt,
    });
    const msgId = await send(api, game.chatId, text, checkinComponents(game.id));
    await repo.setCheckinMsg(game.id, msgId, now);
  }
}

// ---------- check-in (attendance) ----------
// LOCKED → CHECKIN_OPEN: kickoff passed. Ping the squad and post the "Cheguei ✅" board.
export async function openCheckin(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'LOCKED') return;
  const winner = game.winningSlotId ? await repo.getSlot(game.winningSlotId) : null;
  if (!winner) return;
  const closeAt = winner.kickoffAt + CHECKIN_WINDOW_MS;
  await repo.openCheckin(game.id, closeAt, now);

  const split = splitSquad(await repo.getRsvps(game.id), game.capPlayers);
  if (split.confirmed.length > 0) {
    await send(api, game.chatId, M.checkin.ping(split.confirmed.map(mention).join(', ')));
  }
  const text = renderCheckinBoard({
    winnerLabel: winner.label,
    present: [],
    pending: split.confirmed.map((p) => ({ displayName: p.displayName })),
    checkinCloseAt: closeAt,
  });
  const msgId = await send(api, game.chatId, text, checkinComponents(game.id));
  await repo.setCheckinMsg(game.id, msgId, now);
}

// A player taps "Cheguei". Confirmed squad OR a sub off the waitlist (anyone who said IN) may check in.
export async function handleCheckin(api: Sender, repo: Repo, gameId: number, userId: string, now: number): Promise<string> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'CHECKIN_OPEN') return M.cb.checkinClosed;
  const me = (await repo.getRsvps(gameId)).find((r) => r.tgUserId === userId);
  if (!me || me.status !== 'IN') return M.cb.checkinNotInList;
  const added = await repo.addCheckin(gameId, userId, 'self', now);
  await rerenderCheckin(api, repo, game);
  return added ? M.cb.checkinDone : M.cb.checkinAlready;
}

async function rerenderCheckin(api: Sender, repo: Repo, game: Game): Promise<void> {
  if (!game.checkinMsgId) return;
  const v = await attendanceView(repo, game);
  const text = renderCheckinBoard({
    winnerLabel: v.winnerLabel,
    present: v.present,
    pending: v.confirmedAbsent,
    checkinCloseAt: game.checkinCloseAt,
  });
  await safeEditText(api, game.chatId, game.checkinMsgId, text, checkinComponents(game.id));
}

// CHECKIN_OPEN → PLAYED: window closed. Lock the board, assign ghosts, post the recap.
export async function closeCheckin(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'CHECKIN_OPEN') return;
  await repo.setStatus(game.id, 'PLAYED', now);
  if (game.checkinMsgId) await removeKeyboard(api, game.chatId, game.checkinMsgId);
  await postRecap(api, repo, { ...game, status: 'PLAYED' });
}

async function postRecap(api: Sender, repo: Repo, game: Game): Promise<void> {
  const v = await attendanceView(repo, game);
  const text = renderRecap({ winnerLabel: v.winnerLabel, present: v.present, ghosts: v.confirmedAbsent });
  await send(api, game.chatId, text, recapComponents(game.id, v.confirmedAbsent));
}

// Admin taps "X jogou" on the recap to clear a false ghost. Edits that recap message in place.
export async function clearGhost(
  api: Sender,
  repo: Repo,
  gameId: number,
  userId: string,
  chatId: string,
  msgId: string,
  now: number,
): Promise<boolean> {
  const game = await repo.getGame(gameId);
  if (!game) return false;
  await repo.addCheckin(gameId, userId, 'admin', now);
  const v = await attendanceView(repo, game);
  const text = renderRecap({ winnerLabel: v.winnerLabel, present: v.present, ghosts: v.confirmedAbsent });
  await safeEditText(api, chatId, msgId, text, recapComponents(gameId, v.confirmedAbsent));
  return true;
}
