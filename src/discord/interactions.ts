// The interactions endpoint dispatcher: turns a verified Discord interaction into
// engine calls and an interaction response. Mirrors v1's bot/commands + bot/callbacks.
//
// Interaction types: 1 PING · 2 APPLICATION_COMMAND · 3 MESSAGE_COMPONENT · 5 MODAL_SUBMIT.
// Response types:    1 PONG · 4 message (+flags 64 = ephemeral) · 9 modal.
//
// Button clicks reply with an ephemeral "toast" (only the tapper sees it); the live
// board itself is edited via REST inside the engine call. All work is awaited before we
// respond — fast at this scale; if a handler ever nears Discord's 3s limit, switch that
// branch to a deferred response (type 5) + a follow-up.
import type { Env } from '../types';
import type { Repo } from '../db/repo';
import type { Sender } from './rest';
import { M } from '../messages';
import { parseAdminIds } from '../util';
import { parseCb } from './components';
import { NOVOJOGO_MODAL, parseNovoJogoFields } from './novojogo';
import * as games from '../services/games';
import { loadStats } from '../services/stats';
import { statFor } from '../core/stats';
import { renderPersonalCard, renderStats, sinceLabel } from '../render/stats-message';

interface DiscordUser {
  id: string;
  username?: string;
  global_name?: string | null;
}
interface Interaction {
  type: number;
  channel_id?: string;
  member?: { user?: DiscordUser; nick?: string | null };
  user?: DiscordUser;
  message?: { id: string };
  data?: {
    name?: string; // slash command
    custom_id?: string; // component / modal
    components?: { components?: { custom_id: string; value?: string }[] }[]; // modal submit
  };
}

type Player = { tgUserId: string; displayName: string; username: string | null };

function playerFrom(i: Interaction): Player | null {
  const u = i.member?.user ?? i.user;
  if (!u) return null;
  const displayName = i.member?.nick || u.global_name || u.username || 'Jogador';
  return { tgUserId: u.id, displayName, username: u.username ?? null };
}

function isAdmin(env: Env, userId: string | undefined): boolean {
  return userId != null && parseAdminIds(env.ADMIN_IDS).has(userId);
}

function reply(data: object): Response {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}
const pong = () => reply({ type: 1 });
const ephemeral = (content: string) => reply({ type: 4, data: { content, flags: 64 } });
const publicMsg = (content: string) => reply({ type: 4, data: { content } });
const modal = (data: object) => reply({ type: 9, data });
// Type 6 = DEFERRED_UPDATE_MESSAGE: silently acknowledge a component tap (no toast, no
// loading state). We edit the live board separately over REST.
const silentAck = () => reply({ type: 6 });

export async function handleInteraction(i: Interaction, env: Env, repo: Repo, sender: Sender): Promise<Response> {
  if (i.type === 1) return pong();

  const now = Date.now();
  const player = playerFrom(i);
  if (player) await repo.upsertPlayer(player, isAdmin(env, player.tgUserId), now);
  const channelId = i.channel_id ?? '';

  try {
    if (i.type === 2) return await onCommand(i, env, repo, sender, player, channelId, now);
    if (i.type === 3) return await onComponent(i, env, repo, sender, player, channelId, now);
    if (i.type === 5) return await onModal(i, env, repo, sender, player, channelId, now);
  } catch (e) {
    console.error('[interaction]', e);
    return ephemeral(M.cb.error);
  }
  return pong();
}

// ---------- slash commands ----------
async function onCommand(
  i: Interaction,
  env: Env,
  repo: Repo,
  sender: Sender,
  player: Player | null,
  channelId: string,
  now: number,
): Promise<Response> {
  switch (i.data?.name) {
    case 'ajuda':
      return ephemeral(M.help);

    case 'euquem':
      return ephemeral(M.whoami(player?.tgUserId ?? '?'));

    case 'novojogo': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      if (await repo.getCurrentGame(channelId)) return ephemeral(M.gameAlreadyActive);
      return modal(NOVOJOGO_MODAL);
    }

    case 'jogo': {
      const game = await repo.getCurrentGame(channelId);
      if (!game) return ephemeral(M.noActiveGame);
      await games.repost(sender, repo, game, now);
      return ephemeral('Feito — o jogo está no canal 👇');
    }

    case 'fecharvotacao': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      const game = await repo.getCurrentGame(channelId);
      if (!game || game.status !== 'VOTING') return ephemeral(M.noActiveGame);
      await games.closeVoting(sender, repo, game, now);
      return ephemeral('Votação fechada ✅');
    }

    case 'cancelar': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      const game = await repo.getCurrentGame(channelId);
      if (!game) return ephemeral(M.noActiveGame);
      await games.cancelGame(sender, repo, game, now);
      return ephemeral('Jogo cancelado ✅');
    }

    case 'stats': {
      const stats = await loadStats(repo, channelId);
      return publicMsg(renderStats(stats, sinceLabel(stats.firstKickoff)));
    }

    case 'eu': {
      const stats = await loadStats(repo, channelId);
      const name = player?.displayName ?? 'Jogador';
      return ephemeral(renderPersonalCard(statFor(stats, player?.tgUserId ?? '0', name), stats.totalGames));
    }

    default:
      return ephemeral(M.cb.error);
  }
}

// ---------- button clicks ----------
async function onComponent(
  i: Interaction,
  env: Env,
  repo: Repo,
  sender: Sender,
  player: Player | null,
  channelId: string,
  now: number,
): Promise<Response> {
  const parsed = i.data?.custom_id ? parseCb(i.data.custom_id) : null;
  if (!parsed || !player) return ephemeral(M.cb.error);

  // A vote tap gets a silent ACK — no per-tapper toast; the board itself shows who voted what.
  if (parsed.kind === 'vote') {
    await games.handleVote(sender, repo, parsed.gameId, parsed.slotId, player.tgUserId, now);
    return silentAck();
  }

  let ack = '';
  if (parsed.kind === 'rsvp') {
    ack = await games.handleRsvp(sender, repo, parsed.gameId, player.tgUserId, parsed.status, now);
  } else if (parsed.kind === 'tie') {
    if (!isAdmin(env, player.tgUserId)) ack = M.cb.onlyAdmin;
    else ack = (await games.resolveTie(sender, repo, parsed.gameId, parsed.slotId, now)) ? M.cb.tieResolved : M.cb.error;
  } else if (parsed.kind === 'checkin') {
    ack = await games.handleCheckin(sender, repo, parsed.gameId, player.tgUserId, now);
  } else if (parsed.kind === 'unghost') {
    if (!isAdmin(env, player.tgUserId)) ack = M.cb.onlyAdmin;
    else if (!i.message) ack = M.cb.error;
    else
      ack = (await games.clearGhost(sender, repo, parsed.gameId, parsed.tgUserId, channelId, i.message.id, now))
        ? M.cb.ghostCleared
        : M.cb.error;
  }
  return ephemeral(ack || '✅');
}

// ---------- /novojogo modal submit ----------
async function onModal(
  i: Interaction,
  env: Env,
  repo: Repo,
  sender: Sender,
  player: Player | null,
  channelId: string,
  now: number,
): Promise<Response> {
  if (i.data?.custom_id !== 'novojogo') return ephemeral(M.cb.error);
  if (!isAdmin(env, player?.tgUserId) || !player) return ephemeral(M.notAdmin);
  if (await repo.getCurrentGame(channelId)) return ephemeral(M.gameAlreadyActive);

  const v: Record<string, string> = {};
  for (const row of i.data.components ?? []) {
    for (const c of row.components ?? []) v[c.custom_id] = c.value ?? '';
  }

  const parsed = parseNovoJogoFields(
    { slots: v.slots ?? '', local: v.local, players: v.players, deadline: v.deadline },
    now,
  );
  if ('error' in parsed) return ephemeral(parsed.error);

  await games.createGame(sender, repo, {
    chatId: channelId,
    createdBy: player.tgUserId,
    locationNote: parsed.locationNote,
    minPlayers: parsed.minPlayers,
    capPlayers: parsed.capPlayers,
    voteDeadline: parsed.voteDeadline,
    slots: parsed.slots,
    now,
  });
  return ephemeral('Jogo criado ✅ A votação está no canal 👇');
}
