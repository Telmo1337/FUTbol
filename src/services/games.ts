// Orchestration: turns events/time into Discord actions + DB writes.
// Pure logic lives in core/*; this is the wiring. Called by the interactions handler and the tick.
import type { Sender } from '../discord/rest';
import type { Repo } from '../db/repo';
import type { Game, RsvpStatus, Slot, Vote } from '../types';
import { M } from '../messages';
import { esc, mention } from '../util';
import { CHECKIN_WINDOW_MS, GROUP_PING, GROUP_PING_MENTIONS, RSVP_CLOSE_BEFORE_KICKOFF_MS, VOTE_MAX_WAIT_MS } from '../config';
import { countVoters, pickWinner, tallyVotes } from '../core/voting';
import { confirmedIds, splitSquad } from '../core/rsvp';
import { dueNudges } from '../core/nudges';
import { postTeamsPlaceholder } from './teams';
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
import { COLORS } from '../discord/embeds';
import { editBoard, removeKeyboard, sendBoard } from './board';

const MAX_PING = 15;

// ---------- Discord send/edit helpers ----------
/** Post a plain-text announcement/ping — mentions HERE do notify (unlike inside embeds). */
async function send(
  api: Sender,
  chatId: string,
  text: string,
  components?: unknown[],
  allowedMentions?: ('users' | 'everyone' | 'roles')[],
): Promise<string> {
  return api.send(chatId, { content: text, components: components ?? [], allowedMentions });
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
  // Final line of defence: never open a poll with fewer than 2 slots. The callers already guard,
  // but a 0/1-slot game would be unvotable AND, because it counts as "active", would block every
  // future auto-open via the dedup in maybeOpenNextGame. Refuse outright.
  if (input.slots.length < 2) {
    console.warn('[createGame] refused —', input.slots.length, 'slot(s)');
    return;
  }
  const gameId = await repo.createGame({
    chatId: input.chatId,
    createdBy: input.createdBy,
    locationNote: input.locationNote,
    minPlayers: input.minPlayers,
    capPlayers: input.capPlayers,
    voteDeadline: input.voteDeadline,
    now: input.now,
  });

  // TOCTOU dedup: callers already check "no active game" before calling createGame, but that
  // check-then-act isn't atomic — two overlapping callers (an admin's /novojogo racing the
  // cron's auto-open, or two overlapping ticks) could both pass it and both insert a game.
  // Cheap mitigation, not a full guarantee: getCurrentGame picks the highest-id active game
  // in this chat deterministically, so exactly one caller "wins" and every other loses and
  // rolls itself back here, before spending any Discord API calls.
  const current = await repo.getCurrentGame(input.chatId);
  if (current && current.id !== gameId) {
    await repo.deleteGame(gameId).catch(() => {});
    console.warn('[createGame] duplicate active game detected — rolled back', gameId);
    return;
  }

  try {
    await repo.addSlots(
      gameId,
      input.slots.map((s, i) => ({ kickoffAt: s.kickoffAt, label: s.label, sortOrder: i })),
    );
    const slots = await repo.getSlots(gameId);
    // Ping the group once, only at "come and vote". The mention goes in `content` (it must,
    // to actually notify — a mention inside the embed wouldn't); the board is the embed.
    const board = renderVoteMessage(input.locationNote, tallyVotes(slots, []), input.voteDeadline, 0, new Map());
    const msgId = await sendBoard(api, input.chatId, board, voteComponents(gameId, slots), {
      content: GROUP_PING,
      allowedMentions: GROUP_PING_MENTIONS,
      color: COLORS.vote,
    });
    await repo.setVoteMsg(gameId, msgId, input.now);
  } catch (e) {
    // A hiccup between the game insert and the posted board would otherwise leave a corrupt,
    // slot-less / message-less game stuck in VOTING — unvotable, and blocking the auto-open
    // forever. Roll the half-made game back so the next tick can cleanly retry.
    await repo.deleteGame(gameId).catch(() => {});
    throw e;
  }
}

// ---------- voting ----------
export async function handleVote(
  api: Sender,
  repo: Repo,
  gameId: number,
  slotId: number,
  userId: string,
  now: number,
): Promise<void> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'VOTING') return;
  await repo.toggleVote(gameId, slotId, userId, now);
  await rerenderVote(api, repo, game);
}

/** Group voter display names by slot id (for the "who voted what" board). */
function groupVoters(rows: { slotId: number; displayName: string }[]): Map<number, string[]> {
  const m = new Map<number, string[]>();
  for (const r of rows) {
    const arr = m.get(r.slotId);
    if (arr) arr.push(r.displayName);
    else m.set(r.slotId, [r.displayName]);
  }
  return m;
}

async function rerenderVote(api: Sender, repo: Repo, game: Game): Promise<void> {
  if (!game.voteMsgId) return;
  const slots = await repo.getSlots(game.id);
  const votes = await repo.getVotes(game.id);
  const named = await repo.getVotesWithNames(game.id);
  const text = renderVoteMessage(
    game.locationNote,
    tallyVotes(slots, votes),
    game.voteDeadline,
    countVoters(votes),
    groupVoters(named),
  );
  await editBoard(api, game.chatId, game.voteMsgId, text, voteComponents(game.id, slots), COLORS.vote);
}

/** The still-valid options for a tie prompt: unique future winner, else the future tied set
 *  (empty when every slot has already passed). Votes are frozen once status leaves VOTING,
 *  so recomputing this later (e.g. on repost) is deterministic. */
export function tieOptions(slots: Slot[], votes: Vote[], now: number): Slot[] {
  const future = slots.filter((s) => s.kickoffAt > now);
  const { winner, tied } = pickWinner(future, votes);
  return winner ? [winner] : tied;
}

/** VOTING → RSVP_OPEN/TIEBREAK/CANCELLED once the deadline passes. `forced` is the admin's
 *  explicit /fecharvotacao override — it always closes immediately, ignoring both the voter
 *  minimum and the 1-week cap below. A time-driven (tick) call additionally requires at least
 *  `game.minPlayers` DISTINCT voters (one person voting on several days still counts once —
 *  see core/voting.ts countVoters) before locking in a date; short of that, it's a silent
 *  no-op and the tick just retries every minute past the deadline until enough people have
 *  weighed in. Without this, a slot could be decided by 1-2 early voters minutes after the
 *  poll opens. That wait isn't open-ended, though: past VOTE_MAX_WAIT_MS since the poll opened,
 *  it gives up and cancels outright rather than leaving the group stuck on a dead poll. */
export async function closeVoting(api: Sender, repo: Repo, game: Game, now: number, opts?: { forced?: boolean }): Promise<void> {
  if (game.status !== 'VOTING') return;
  const slots = await repo.getSlots(game.id);
  const votes = await repo.getVotes(game.id);
  const future = slots.filter((s) => s.kickoffAt > now);

  // Processed too late (or the poll's dates were never in the future to begin with) — every
  // slot has already passed. Plain CANCELLED (not CANCELLED_ADMIN) so the cron can relaunch.
  // Always allowed, regardless of turnout — there's nothing left to wait for more voters on.
  if (future.length === 0) {
    if (!(await repo.transitionStatus(game.id, 'VOTING', 'CANCELLED', now))) return;
    if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
    await send(api, game.chatId, M.votingExpired);
    return;
  }

  const voterCount = countVoters(votes);
  if (!opts?.forced && voterCount < game.minPlayers) {
    // Been waiting a full week for enough votes and still short — stop waiting.
    if (now - game.createdAt >= VOTE_MAX_WAIT_MS) {
      if (!(await repo.transitionStatus(game.id, 'VOTING', 'CANCELLED', now))) return;
      if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
      await send(api, game.chatId, M.votingNotEnoughVoters(voterCount, game.minPlayers));
    }
    return;
  }

  const { winner, tied } = pickWinner(future, votes);
  if (winner) {
    await openRsvp(api, repo, game, winner, now);
  } else {
    if (!(await repo.transitionStatus(game.id, 'VOTING', 'TIEBREAK', now))) return;
    if (game.voteMsgId) {
      const named = await repo.getVotesWithNames(game.id);
      const tieText = renderVoteTie(game.locationNote, tallyVotes(slots, votes), groupVoters(named));
      await editBoard(api, game.chatId, game.voteMsgId, tieText, undefined, COLORS.vote);
      await removeKeyboard(api, game.chatId, game.voteMsgId);
    }
    const msgId = await send(api, game.chatId, M.tieAdminPrompt, tieComponents(game.id, tied));
    await repo.setTieMsg(game.id, msgId, now);
  }
}

export type TieOutcome = 'ok' | 'not-tiebreak' | 'past-slot' | 'bad-slot';

export async function resolveTie(api: Sender, repo: Repo, gameId: number, slotId: number, now: number): Promise<TieOutcome> {
  const game = await repo.getGame(gameId);
  if (!game || game.status !== 'TIEBREAK') return 'not-tiebreak';
  const slot = await repo.getSlot(slotId);
  if (!slot || slot.gameId !== gameId) return 'bad-slot';
  if (slot.kickoffAt <= now) return 'past-slot';
  const ok = await openRsvp(api, repo, game, slot, now);
  return ok ? 'ok' : 'not-tiebreak';
}

/** VOTING/TIEBREAK → RSVP_OPEN. Locks the winner FIRST (a guarded write — false means someone
 *  else already moved the game on, e.g. a double-click or the tick racing the admin) and only
 *  THEN posts the RSVP board, so a failed Discord POST reverts the status instead of stranding
 *  the game in RSVP_OPEN with no board and no way back into the tie/vote flow. */
async function openRsvp(api: Sender, repo: Repo, game: Game, winner: Slot, now: number): Promise<boolean> {
  const rsvpCloseAt = winner.kickoffAt - RSVP_CLOSE_BEFORE_KICKOFF_MS;
  const locked = await repo.lockWinner(game.id, winner.id, rsvpCloseAt, now);
  if (!locked) return false;

  const text = renderRsvpMessage({
    loc: game.locationNote,
    winnerLabel: winner.label,
    min: game.minPlayers,
    cap: game.capPlayers,
    split: splitSquad([], game.capPlayers),
    rsvpCloseAt,
    state: 'open',
  });
  try {
    const msgId = await sendBoard(api, game.chatId, text, rsvpComponents(game.id));
    await repo.setRsvpMsg(game.id, msgId, now);
  } catch (e) {
    await repo.setStatus(game.id, game.status, now); // revert to the pre-lock status; caller can retry
    throw e;
  }

  if (game.voteMsgId) {
    await editBoard(api, game.chatId, game.voteMsgId, renderVoteResult(game.locationNote, winner.label));
    await removeKeyboard(api, game.chatId, game.voteMsgId);
  }
  if (game.tieMsgId) {
    await api.edit(game.chatId, game.tieMsgId, { content: M.tieResolvedNote(winner.label), components: [] });
  }
  return true;
}

// TIEBREAK with every candidate slot now in the past (nothing time-driven normally moves a
// TIEBREAK game — this is the one exception, called from the tick). Plain CANCELLED so the
// cron's auto-open can relaunch, instead of leaving a dead poll blocking it forever.
export async function expireTiebreak(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'TIEBREAK') return;
  const slots = await repo.getSlots(game.id);
  if (slots.some((s) => s.kickoffAt > now)) return;
  if (!(await repo.transitionStatus(game.id, 'TIEBREAK', 'CANCELLED', now))) return;
  if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
  if (game.tieMsgId) await removeKeyboard(api, game.chatId, game.tieMsgId);
  await send(api, game.chatId, M.votingExpired);
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

  // The write landed — but the tick (or an admin) may have closed RSVP in the meantime.
  // Re-read before doing anything that assumes the board is still open, so a tap that
  // lands right on the close doesn't re-attach live buttons to an already-LOCKED board.
  const fresh = await repo.getGame(gameId);
  if (!fresh || fresh.status !== 'RSVP_OPEN') return M.cb.rsvpClosed;

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

  await rerenderRsvp(api, repo, fresh, 'open');
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
  await editBoard(
    api,
    game.chatId,
    game.rsvpMsgId,
    text,
    state === 'open' ? rsvpComponents(game.id) : undefined,
    state === 'cancelled' ? COLORS.cancelled : undefined,
  );
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
    if (!(await repo.transitionStatus(game.id, 'RSVP_OPEN', 'LOCKED', now))) return;
    await rerenderRsvp(api, repo, { ...game, status: 'LOCKED' }, 'locked');
    const names = split.confirmed.map((p, i) => `${i + 1}. ${esc(p.displayName)}`).join('\n');
    await send(api, game.chatId, M.rsvpClosedFinal(winnerLabel, game.locationNote, names));
    // Auto-open the (public) team-formation board; the admin assigns teams privately.
    await postTeamsPlaceholder(api, repo, { ...game, status: 'LOCKED' }, now);
  } else {
    if (!(await repo.transitionStatus(game.id, 'RSVP_OPEN', 'CANCELLED', now))) return;
    await rerenderRsvp(api, repo, { ...game, status: 'CANCELLED' }, 'cancelled');
    await send(api, game.chatId, M.cancelledNotEnough(winnerLabel, inCount, game.minPlayers));
  }
}

// Admin pressed /cancelar — a deliberate stop. We persist a DISTINCT terminal status
// (CANCELLED_ADMIN, vs the plain CANCELLED of a too-few-players fall-through) so the cron's
// auto-open knows NOT to reopen a poll behind the admin's back; the next game waits for /novojogo.
export async function cancelGame(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  await repo.setStatus(game.id, 'CANCELLED_ADMIN', now);
  if (game.rsvpMsgId) await rerenderRsvp(api, repo, { ...game, status: 'CANCELLED_ADMIN' }, 'cancelled');
  else if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
  if (game.tieMsgId) await removeKeyboard(api, game.chatId, game.tieMsgId);
  await send(api, game.chatId, M.cancelledByAdmin);
}

// ---------- /jogo : bump the live message to the bottom of the chat ----------
export async function repost(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status === 'VOTING') {
    const slots = await repo.getSlots(game.id);
    if (slots.length === 0) return; // corrupt/empty game — never repost an unvotable board
    const votes = await repo.getVotes(game.id);
    const named = await repo.getVotesWithNames(game.id);
    const text = renderVoteMessage(
      game.locationNote,
      tallyVotes(slots, votes),
      game.voteDeadline,
      countVoters(votes),
      groupVoters(named),
    );
    if (game.voteMsgId) await removeKeyboard(api, game.chatId, game.voteMsgId);
    const msgId = await sendBoard(api, game.chatId, text, voteComponents(game.id, slots), { color: COLORS.vote });
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
    const msgId = await sendBoard(api, game.chatId, text, rsvpComponents(game.id));
    await repo.setRsvpMsg(game.id, msgId, now);
  } else if (game.status === 'TIEBREAK') {
    const slots = await repo.getSlots(game.id);
    const votes = await repo.getVotes(game.id);
    const options = tieOptions(slots, votes, now);
    if (options.length === 0) {
      await expireTiebreak(api, repo, game, now);
      return;
    }
    if (game.tieMsgId) await removeKeyboard(api, game.chatId, game.tieMsgId);
    const msgId = await send(api, game.chatId, M.tieAdminPrompt, tieComponents(game.id, options));
    await repo.setTieMsg(game.id, msgId, now);
  } else if (game.status === 'CHECKIN_OPEN') {
    const v = await attendanceView(repo, game);
    if (game.checkinMsgId) await removeKeyboard(api, game.chatId, game.checkinMsgId);
    const text = renderCheckinBoard({
      winnerLabel: v.winnerLabel,
      present: v.present,
      pending: v.confirmedAbsent,
      checkinCloseAt: game.checkinCloseAt,
    });
    const msgId = await sendBoard(api, game.chatId, text, checkinComponents(game.id), { color: COLORS.checkin });
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
  if (!(await repo.openCheckin(game.id, closeAt, now))) return;

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
  const msgId = await sendBoard(api, game.chatId, text, checkinComponents(game.id), { color: COLORS.checkin });
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
  await editBoard(api, game.chatId, game.checkinMsgId, text, checkinComponents(game.id), COLORS.checkin);
}

// CHECKIN_OPEN → PLAYED: window closed. Lock the board, assign ghosts, post the recap.
export async function closeCheckin(api: Sender, repo: Repo, game: Game, now: number): Promise<void> {
  if (game.status !== 'CHECKIN_OPEN') return;
  if (!(await repo.transitionStatus(game.id, 'CHECKIN_OPEN', 'PLAYED', now))) return;
  if (game.checkinMsgId) await removeKeyboard(api, game.chatId, game.checkinMsgId);
  await postRecap(api, repo, { ...game, status: 'PLAYED' });
}

async function postRecap(api: Sender, repo: Repo, game: Game): Promise<void> {
  const v = await attendanceView(repo, game);
  const text = renderRecap({ winnerLabel: v.winnerLabel, present: v.present, ghosts: v.confirmedAbsent });
  await sendBoard(api, game.chatId, text, recapComponents(game.id, v.confirmedAbsent));
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
  await editBoard(api, chatId, msgId, text, recapComponents(gameId, v.confirmedAbsent));
  return true;
}
