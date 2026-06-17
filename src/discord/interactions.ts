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
import { assistsEnabled, golosEnabled, pagamentosEnabled, parseAdminIds } from '../util';
import { capturePanelComponents, historyComponents, parseCb, paymentPanelComponents, teamsPanelComponents } from './components';
import { boardEmbed } from './embeds';
import { NOVOJOGO_MODAL, parseNovoJogoFields } from './novojogo';
import { resultModal, parseResultFields } from './teams';
import { paymentPriceModal, parsePriceField } from './payments';
import * as games from '../services/games';
import { applyTeamSelect, loadTeamsState, publishTeams, recordResult } from '../services/teams';
import { loadCaptureState } from '../services/capture';
import { loadPaymentState, postPaymentBoard, refreshPaymentBoard, setPaidSet } from '../services/payments';
import { seedTestGame } from '../services/testseed';
import { loadStats, loadStatsInput } from '../services/stats';
import { loadHistory, type HistoryView } from '../services/history';
import { computeStats, statFor } from '../core/stats';
import { formatMonth, monthWindow } from '../core/time';
import { renderComparison, renderPersonalCard, renderStats, renderTopScorers, sinceLabel } from '../render/stats-message';
import { renderHistory } from '../render/history-message';
import { renderTeamsPanel } from '../render/teams-message';
import { renderCapturePanel, renderCaptureSummary } from '../render/capture-message';
import { renderPaymentPanel } from '../render/payment-message';
import type { Game } from '../types';

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
    values?: string[]; // string-select submit: the chosen option values (user ids)
    components?: { components?: { custom_id: string; value?: string }[] }[]; // modal submit
    // Slash-command arguments. For a USER option, `value` is the picked user's snowflake,
    // and `resolved` carries that user's name + server nick so we never need a name lookup.
    options?: { name: string; type: number; value?: string }[];
    resolved?: {
      users?: Record<string, DiscordUser>;
      members?: Record<string, { nick?: string | null }>;
    };
  };
}

type Player = { tgUserId: string; displayName: string; username: string | null };

function playerFrom(i: Interaction): Player | null {
  const u = i.member?.user ?? i.user;
  if (!u) return null;
  const displayName = i.member?.nick || u.global_name || u.username || 'Jogador';
  return { tgUserId: u.id, displayName, username: u.username ?? null };
}

/** Resolve an INTEGER slash-command option to a number, or null if absent/invalid. */
function resolveIntOption(i: Interaction, name: string): number | null {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Resolve a USER slash-command option into a target (id + display name), or null if absent. */
function resolveUserOption(i: Interaction, name: string): { tgUserId: string; displayName: string } | null {
  const id = i.data?.options?.find((o) => o.name === name)?.value;
  if (!id) return null;
  const u = i.data?.resolved?.users?.[id];
  const nick = i.data?.resolved?.members?.[id]?.nick;
  const displayName = nick || u?.global_name || u?.username || 'Jogador';
  return { tgUserId: id, displayName };
}

function isAdmin(env: Env, userId: string | undefined): boolean {
  return userId != null && parseAdminIds(env.ADMIN_IDS).has(userId);
}

function reply(data: object): Response {
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
}
const pong = () => reply({ type: 1 });
const ephemeral = (content: string) => reply({ type: 4, data: { content, flags: 64 } });
// Board-style replies (stats cards) as green embeds — same look as the game boards.
const publicEmbed = (text: string) => reply({ type: 4, data: { embeds: [boardEmbed(text)] } });
const ephemeralEmbed = (text: string) => reply({ type: 4, data: { embeds: [boardEmbed(text)], flags: 64 } });
const modal = (data: object) => reply({ type: 9, data });
// Type 6 = DEFERRED_UPDATE_MESSAGE: silently acknowledge a component tap (no toast, no
// loading state). We edit the live board separately over REST.
const silentAck = () => reply({ type: 6 });
// Type 7 = UPDATE_MESSAGE: edit the message the tapped component lives on (the private panel).
const updateMsg = (data: object) => reply({ type: 7, data });

/** An ephemeral 📜 history page: embed + the ◀️/▶️ row (omitted on a single page). */
function historyData(view: HistoryView): object {
  return {
    embeds: [boardEmbed(renderHistory(view))],
    components: historyComponents(view.page, view.totalPages, view.tgUserId),
    flags: 64,
  };
}

/** The admin's private (ephemeral) team-formation panel: buckets embed + the two selects + lock. */
async function teamPanelData(repo: Repo, game: Game): Promise<object> {
  const state = await loadTeamsState(repo, game);
  return {
    embeds: [boardEmbed(renderTeamsPanel(state.view))],
    components: teamsPanelComponents(game.id, state.squad, state.aIds, state.bIds),
    flags: 64,
  };
}

/** The admin's private (ephemeral) ⚽ capture panel. `assists` toggles the 🅰️ select + tally. */
async function capturePanelData(repo: Repo, game: Game, assists: boolean): Promise<object> {
  const state = await loadCaptureState(repo, game);
  return {
    embeds: [boardEmbed(renderCapturePanel(state, assists))],
    components: capturePanelComponents(game.id, state.players, assists),
    flags: 64,
  };
}

/** The admin's private (ephemeral) 💶 pagamentos panel: the "who paid" select + price/done buttons. */
async function paymentPanelData(repo: Repo, game: Game): Promise<object> {
  const state = await loadPaymentState(repo, game);
  return {
    embeds: [boardEmbed(renderPaymentPanel(state))],
    components: paymentPanelComponents(game.id, state.players, state.paid),
    flags: 64,
  };
}

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
      return ephemeral(isAdmin(env, player?.tgUserId) ? M.helpAdmin : M.help);

    case 'meuid':
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

    case 'equipas': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      const game = await repo.getLatestTeamPhaseGame(channelId);
      if (!game) return ephemeral(M.noTeamGame);
      return reply({ type: 4, data: await teamPanelData(repo, game) });
    }

    case 'resultado': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      const game = await repo.getLatestTeamPhaseGame(channelId);
      if (!game) return ephemeral(M.noTeamGame);
      if (!game.teamsLockedAt) return ephemeral(M.cb.resultNoTeams);
      return modal(resultModal(game.id));
    }

    case 'pagamentos': {
      if (!isAdmin(env, player?.tgUserId)) return ephemeral(M.notAdmin);
      if (!pagamentosEnabled(env)) return ephemeral(M.pay.off);
      const game = await repo.getLatestSquadGame(channelId);
      if (!game) return ephemeral(M.pay.noGame);
      await postPaymentBoard(sender, repo, game, now);
      return ephemeral(M.pay.posted);
    }

    case 'testjogo': {
      if (!isAdmin(env, player?.tgUserId) || !player) return ephemeral(M.notAdmin);
      if (!env.TEST_CHANNEL_ID) return ephemeral(M.test.disabled);
      if (channelId !== env.TEST_CHANNEL_ID) return ephemeral(M.test.wrongChannel);
      const count = resolveIntOption(i, 'jogos') ?? 1;
      const res = await seedTestGame(sender, repo, channelId, player.tgUserId, now, count);
      return ephemeral(res.games > 1 ? M.test.createdMany(res.games) : M.test.created(res.players));
    }

    case 'stats': {
      const golos = golosEnabled(env);
      const assists = assistsEnabled(env);
      // /stats jogador:@X → that player's card (public); /stats alone → the group boards.
      const target = resolveUserOption(i, 'jogador');
      if (target) {
        const stats = await loadStats(repo, channelId);
        return publicEmbed(renderPersonalCard(statFor(stats, target.tgUserId, target.displayName), stats, golos, assists));
      }
      // Group boards: load once, aggregate all-time + this month from the same rows.
      const input = await loadStatsInput(repo, channelId);
      const stats = computeStats(input);
      const month = computeStats(input, monthWindow(now));
      return publicEmbed(renderStats(stats, month, formatMonth(now), sinceLabel(stats.firstKickoff), golos, assists));
    }

    case 'topmarcadores': {
      if (!golosEnabled(env)) return ephemeral(M.golosOff);
      return publicEmbed(renderTopScorers(await loadStats(repo, channelId), assistsEnabled(env)));
    }

    case 'eu': {
      const stats = await loadStats(repo, channelId);
      const name = player?.displayName ?? 'Jogador';
      return ephemeralEmbed(renderPersonalCard(statFor(stats, player?.tgUserId ?? '0', name), stats, golosEnabled(env), assistsEnabled(env)));
    }

    case 'historico': {
      // /historico jogador:@X → just that player's games; /historico alone → every game.
      const target = resolveUserOption(i, 'jogador');
      const view = await loadHistory(repo, channelId, 0, target?.tgUserId ?? null, target?.displayName ?? null, golosEnabled(env), assistsEnabled(env));
      return reply({ type: 4, data: historyData(view) });
    }

    case 'comparar': {
      const a = resolveUserOption(i, 'a');
      const b = resolveUserOption(i, 'b');
      if (!a || !b) return ephemeral(M.cb.error);
      const stats = await loadStats(repo, channelId);
      return publicEmbed(
        renderComparison(statFor(stats, a.tgUserId, a.displayName), statFor(stats, b.tgUserId, b.displayName), golosEnabled(env), assistsEnabled(env)),
      );
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

  // 📜 history ◀️/▶️: re-query the requested page and edit this (ephemeral) message in place.
  if (parsed.kind === 'historyPage') {
    const view = await loadHistory(repo, channelId, parsed.page, parsed.tgUserId, null, golosEnabled(env), assistsEnabled(env));
    return updateMsg(historyData(view));
  }

  // 💶 Pagamentos — admin-only panel + public board, gated by PAGAMENTOS_ENABLED.
  if (
    parsed.kind === 'paymentManage' ||
    parsed.kind === 'paymentToggle' ||
    parsed.kind === 'paymentPriceOpen' ||
    parsed.kind === 'paymentDone'
  ) {
    if (!isAdmin(env, player.tgUserId)) return ephemeral(M.cb.onlyAdmin);
    if (!pagamentosEnabled(env)) return ephemeral(M.pay.off);
    const game = await repo.getGame(parsed.gameId);
    if (!game) return ephemeral(M.cb.error);
    if (parsed.kind === 'paymentManage') {
      return reply({ type: 4, data: await paymentPanelData(repo, game) });
    }
    if (parsed.kind === 'paymentToggle') {
      // The select offers only squad members; setPaidSet re-filters defensively.
      await setPaidSet(repo, game, i.data?.values ?? [], now);
      await refreshPaymentBoard(sender, repo, game);
      return updateMsg(await paymentPanelData(repo, game));
    }
    if (parsed.kind === 'paymentPriceOpen') {
      return modal(paymentPriceModal(game.id, game.pricePerPersonCents));
    }
    // paymentDone: refresh the public board and close the private panel.
    await refreshPaymentBoard(sender, repo, game);
    return updateMsg({ content: M.pay.panelDone, embeds: [], components: [] });
  }

  // Team-formation + result + ⚽ capture controls — all admin-only, all reply directly (panel / modal / update).
  if (
    parsed.kind === 'teamOpen' ||
    parsed.kind === 'teamEdit' ||
    parsed.kind === 'teamSelect' ||
    parsed.kind === 'teamLock' ||
    parsed.kind === 'resultOpen' ||
    parsed.kind === 'captureOpen' ||
    parsed.kind === 'captureAdd' ||
    parsed.kind === 'captureUndo' ||
    parsed.kind === 'captureDone'
  ) {
    if (!isAdmin(env, player.tgUserId)) return ephemeral(M.cb.onlyAdmin);
    const game = await repo.getGame(parsed.gameId);
    if (!game) return ephemeral(M.cb.error);
    // ⚽ capture buttons only work when the feature is on (a stale card button → polite no-op).
    if (
      (parsed.kind === 'captureOpen' ||
        parsed.kind === 'captureAdd' ||
        parsed.kind === 'captureUndo' ||
        parsed.kind === 'captureDone') &&
      !golosEnabled(env)
    ) {
      return ephemeral(M.golosOff);
    }
    if (parsed.kind === 'teamOpen' || parsed.kind === 'teamEdit') {
      return reply({ type: 4, data: await teamPanelData(repo, game) });
    }
    if (parsed.kind === 'teamSelect') {
      await applyTeamSelect(repo, game, parsed.side, i.data?.values ?? []);
      return updateMsg(await teamPanelData(repo, game));
    }
    if (parsed.kind === 'teamLock') {
      const ok = await publishTeams(sender, repo, game, now);
      return ok ? updateMsg({ content: M.cb.teamsPublished, embeds: [], components: [] }) : ephemeral(M.cb.teamsNeedBoth);
    }
    // ⚽ capture panel: open from the result card, +1 a scorer/assister, undo, or close to a summary.
    const assists = assistsEnabled(env);
    if (parsed.kind === 'captureOpen') {
      return reply({ type: 4, data: await capturePanelData(repo, game, assists) });
    }
    if (parsed.kind === 'captureAdd') {
      const picked = i.data?.values?.[0]; // the select only offers squad members
      // Ignore an assist add when assists are off (a stale 🅰️ select → no-op).
      if (picked && (parsed.event === 'G' || assists)) await repo.addGoalEvent(game.id, picked, parsed.event, now);
      return updateMsg(await capturePanelData(repo, game, assists));
    }
    if (parsed.kind === 'captureUndo') {
      await repo.undoLastGoalEvent(game.id, parsed.event);
      return updateMsg(await capturePanelData(repo, game, assists));
    }
    if (parsed.kind === 'captureDone') {
      const state = await loadCaptureState(repo, game);
      return updateMsg({ content: '', embeds: [boardEmbed(renderCaptureSummary(state, assists))], components: [] });
    }
    // resultOpen: the score modal (game id rides in the modal custom_id)
    if (!game.teamsLockedAt) return ephemeral(M.cb.resultNoTeams);
    return modal(resultModal(game.id));
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
  const customId = i.data?.custom_id ?? '';

  const fields: Record<string, string> = {};
  for (const row of i.data?.components ?? []) {
    for (const c of row.components ?? []) fields[c.custom_id] = c.value ?? '';
  }

  // 📊 score modal: record the result for the game id carried in the custom_id.
  if (customId.startsWith('result:')) {
    if (!isAdmin(env, player?.tgUserId) || !player) return ephemeral(M.notAdmin);
    const game = await repo.getGame(Number(customId.split(':')[1]));
    if (!game) return ephemeral(M.cb.error);
    if ((await repo.getResultTeams(game.id)).length === 0) return ephemeral(M.cb.resultNoTeams);
    const parsedResult = parseResultFields({ golosA: fields.golosA ?? '', golosB: fields.golosB ?? '' });
    if ('error' in parsedResult) return ephemeral(parsedResult.error);
    // A recorded score means the game is over → close the check-in window so it counts as
    // PLAYED (and posts the recap with ghost-fix buttons). No-op if it's already closed.
    if (game.status === 'CHECKIN_OPEN') await games.closeCheckin(sender, repo, game, now);
    const golos = golosEnabled(env);
    await recordResult(sender, repo, game, parsedResult.goalsA, parsedResult.goalsB, player.tgUserId, now, golos);
    // With the feature on, drop straight into the ⚽ capture panel (ephemeral, admin-only) so
    // golos/assists get filled now; otherwise just confirm the score was saved.
    return golos
      ? reply({ type: 4, data: await capturePanelData(repo, game, assistsEnabled(env)) })
      : ephemeral(M.cb.resultSaved);
  }

  // 💶 price modal: set the per-person price for the game id carried in the custom_id.
  if (customId.startsWith('pgpricem:')) {
    if (!isAdmin(env, player?.tgUserId) || !player) return ephemeral(M.notAdmin);
    if (!pagamentosEnabled(env)) return ephemeral(M.pay.off);
    const game = await repo.getGame(Number(customId.split(':')[1]));
    if (!game) return ephemeral(M.cb.error);
    const parsedPrice = parsePriceField(fields.preco ?? '');
    if ('error' in parsedPrice) return ephemeral(parsedPrice.error);
    await repo.setGamePrice(game.id, parsedPrice.cents, now);
    const fresh = (await repo.getGame(game.id))!;
    await refreshPaymentBoard(sender, repo, fresh);
    return updateMsg(await paymentPanelData(repo, fresh));
  }

  if (customId !== 'novojogo') return ephemeral(M.cb.error);
  if (!isAdmin(env, player?.tgUserId) || !player) return ephemeral(M.notAdmin);
  if (await repo.getCurrentGame(channelId)) return ephemeral(M.gameAlreadyActive);

  const v: Record<string, string> = fields;

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
