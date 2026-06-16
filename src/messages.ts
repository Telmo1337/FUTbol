// ALL player-facing text lives here, in European Portuguese (pt-PT), informal "tu".
// Never hardcode user-facing strings elsewhere — import from M.
// Formatting is Discord markdown: **bold**, *italic*, `code`, ```block```.
// To add another language later, swap this object behind a tiny selector.

import { esc } from './util';
import { MIN_GAMES_TO_RANK } from './config';

export const M = {
  start:
    '⚽ **Olá! Sou o bot do nosso futebol.**\n\n' +
    'O admin abre uma votação de dia com `/novojogo`, e depois é só toda a gente ' +
    'carregar nos botões para votar e confirmar presença — tudo aqui no canal.\n\n' +
    'Escreve `/ajuda` para veres os comandos.',

  help:
    '📋 **Comandos**\n\n' +
    '`/novojogo` — abrir uma votação de dia *(só admin)*\n' +
    '`/jogo` — ver o jogo atual\n' +
    '`/fecharvotacao` — fechar já a votação *(só admin)*\n' +
    '`/cancelar` — cancelar o jogo atual *(só admin)*\n' +
    '`/stats` — ranking de presenças e fiabilidade 📊\n' +
    '`/eu` — as tuas estatísticas 📇\n' +
    '`/euquem` — ver o teu ID de Discord\n' +
    '`/ajuda` — esta mensagem',

  whoami: (id: string) =>
    `O teu ID de Discord é \`${id}\`.\n\n` +
    'Para te tornares admin, mete este id em `ADMIN_IDS` (ver README).',

  notAdmin: '🔒 Só o admin pode fazer isto.',

  novojogoUsage:
    '📝 **Como abrir um jogo** *(só admin)*\n\n' +
    'O `/novojogo` abre um formulário. Preenche:\n' +
    '• **Slots** — uma opção de horário por linha, no formato `DD/MM HH:MM` (mete 2 ou mais):\n' +
    '```\n18/06 21:00\n20/06 18:00\n```\n' +
    '• **Local** — onde se joga\n' +
    '• **Jogadores** — mínimo-máximo (ex.: `10-14`)\n' +
    '• **Fecho** — quando termina a votação (ex.: `17/06 21:00`)',

  errNeedTwoSlots: '⚠️ Precisas de pelo menos **2** opções de horário (uma por linha).',
  errBadPlayers: '⚠️ "Jogadores" tem de ser tipo `10-14` (mínimo-máximo).',
  errMinGtCap: '⚠️ O mínimo de jogadores não pode ser maior que o máximo.',
  errBadDate: (line: string) => `⚠️ Não percebi a data: \`${esc(line)}\`. Usa o formato \`DD/MM HH:MM\`.`,
  errNoFutureSlots: '⚠️ Todas as datas estão no passado. Usa datas futuras.',
  gameAlreadyActive: '⚠️ Já existe um jogo ativo. Usa `/cancelar` antes de abrir outro.',
  noActiveGame: 'Não há nenhum jogo ativo. Abre um com `/novojogo`.',

  tieAdminPrompt: '🤝 **Empate na votação!** Admin, escolhe o horário 👇',

  promoted: (who: string, when: string, loc: string) =>
    `🎉 ${who}, abriu uma vaga — **estás dentro** para ${when}! 📍 ${esc(loc)}`,

  gameOn: (n: number, when: string, loc: string) =>
    `🎉 **Temos jogo!** ${n} confirmados para **${when}**. 📍 ${esc(loc)}`,

  shortWarn: (missing: number, inCount: number, min: number, when: string) =>
    `⚠️ Faltam **${missing}** para ${when} (${inCount}/${min}). Confirmem presença 👆`,

  nonRespPing: (mentions: string, when: string) =>
    `👋 Ainda não responderam: ${mentions}. Vão jogar **${when}**? Carreguem no botão 👆`,

  rsvpClosedFinal: (when: string, loc: string, names: string) =>
    `🔒 **Inscrições fechadas — ${when}**\n📍 ${esc(loc)}\n\n**Equipa final:**\n${names}`,

  cancelledNotEnough: (when: string, inCount: number, min: number) =>
    `❌ Sem jogadores suficientes para ${when} (${inCount}/${min}). Jogo cancelado.`,

  cancelledByAdmin: '❌ Jogo cancelado pelo admin.',

  // ---- Vote message fragments ----
  vote: {
    title: '🗳️ **Votação — quando jogamos?**',
    pickHint: 'Carrega no(s) horário(s) em que podes (podes escolher vários).',
    voters: (n: number) => `👥 ${n} ${n === 1 ? 'pessoa votou' : 'pessoas votaram'}`,
    closesAt: (when: string) => `⏳ Fecha ${when}`,
    votesCount: (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`,
    resultTitle: '✅ **Jogo marcado!**',
    tieTitle: '🗳️ **Votação encerrada — empate!**',
    tieFooter: 'O admin vai escolher o horário 👇',
  },

  // ---- RSVP live-message fragments ----
  rsvp: {
    markedTitle: (when: string) => `✅ **Jogo marcado — ${when}**`,
    lockedTitle: (when: string) => `🔒 **Jogo confirmado — ${when}**`,
    cancelledTitle: (when: string) => `❌ **Jogo cancelado — ${when}**`,
    prompt: 'Vais? Carrega num botão 👇',
    confirmed: (n: number, cap: number) => `🟢 **Confirmados (${n}/${cap})**`,
    waitlist: (n: number) => `📋 **Lista de espera (${n})**`,
    maybe: (n: number) => `🤔 **Talvez (${n})**`,
    out: (n: number) => `🔴 **Não vão (${n})**`,
    empty: '— ainda ninguém —',
    needMore: (missing: number, inCount: number, min: number) =>
      `⚠️ Faltam **${missing}** para confirmar o jogo (${inCount}/${min}).`,
    confirmedLine: (inCount: number, min: number) => `🎉 Jogo confirmado! (${inCount}/${min})`,
    closesAt: (when: string) => `⏳ Inscrições fecham ${when}`,
    buttons: { in: '✅ Vou', out: '❌ Não vou', maybe: '🤔 Talvez' },
  },

  // ---- Short toasts shown to the tapper (ephemeral interaction reply) ----
  cb: {
    voteAdded: 'Voto registado ✅',
    voteRemoved: 'Voto removido',
    votingClosed: 'A votação já fechou.',
    rsvpIn: 'Estás dentro! ✅',
    rsvpWait: 'Estás na lista de espera 📋',
    rsvpOut: 'Marcado: não vais ❌',
    rsvpMaybe: 'Marcado: talvez 🤔',
    rsvpClosed: 'As inscrições já fecharam.',
    onlyAdmin: 'Só o admin pode escolher.',
    tieResolved: 'Horário escolhido ✅',
    checkinDone: 'Boa! Ficaste registado ✅',
    checkinAlready: 'Já estavas registado ✅',
    checkinClosed: 'O check-in já fechou.',
    checkinNotInList: 'Não estavas na lista deste jogo 🤔',
    ghostCleared: 'Corrigido — já não é fantasma ✅',
    error: 'Algo correu mal 😬',
  },

  // ---- Check-in board (kickoff → +window): "Cheguei ✅" ----
  checkin: {
    title: (when: string) => `🟢 **Hora do jogo — ${when}**`,
    ping: (mentions: string) => `📣 ${mentions}\nChegaram ao campo? Carreguem em **Cheguei** 👇`,
    button: '✅ Cheguei',
    present: (n: number) => `✅ **Já cá estão (${n})**`,
    pending: (n: number) => `⏳ **Ainda por confirmar (${n})**`,
    empty: '— ainda ninguém —',
    closesAt: (when: string) => `⏳ Check-in fecha ${when}. Quem não carregar fica fantasma 👻`,
  },

  // ---- Post-game recap (auto-posted when the window closes) ----
  recap: {
    title: (when: string) => `🏁 **Resumo — ${when}**`,
    played: (n: number) => `👟 **Jogaram (${n})**`,
    ghosts: (n: number) => `👻 **Fantasmas (${n})**`,
    noGhosts: '👏 Zero fantasmas esta semana — toda a gente apareceu!',
    clearHint: '*Admin: alguém jogou mas esqueceu-se de carregar? Toca no nome para corrigir 👇*',
    footer: '📊 Ranking completo em `/stats`',
    ghostButton: (name: string) => `✅ ${name} jogou`,
    empty: '— ninguém —',
  },

  // ---- /stats group leaderboard ----
  stats: {
    title: '📊 **Estatísticas FUTbol**',
    since: (when: string) => `*desde ${when}*`,
    totalGames: (n: number) => `⚽ ${n} ${n === 1 ? 'jogo jogado' : 'jogos jogados'}`,
    none: 'Ainda não há jogos jogados. As estatísticas aparecem depois do primeiro jogo. ⚽',
    reliableTitle: `🏅 **Mais fiáveis** *(mín. ${MIN_GAMES_TO_RANK} jogos)*`,
    reliableLine: (pct: number, shown: number, total: number) => `${pct}% *(${shown}/${total})*`,
    reliableEmpty: '*ainda ninguém com jogos suficientes — a aquecer 🔥*',
    appearancesTitle: '👟 **Mais presenças**',
    appearancesLine: (n: number) => `${n} ${n === 1 ? 'jogo' : 'jogos'}`,
    streakTitle: '🔥 **Em sequência**',
    streakLine: (n: number) => `${n} seguidos`,
    ghostsTitle: '👻 **Mais fantasma**',
    ghostsLine: (n: number) => `${n} ${n === 1 ? 'falta' : 'faltas'}`,
    ghostsEmpty: '*sem fantasmas — que grupo de confiança! 👏*',
  },

  // ---- /eu personal card ----
  eu: {
    title: (name: string) => `📇 **${name}**`,
    appearances: (n: number) => `👟 Presenças: **${n}**`,
    reliability: (pct: number, shown: number, total: number) => `🏅 Fiabilidade: **${pct}%** *(${shown}/${total})*`,
    reliabilityWarming: (missing: number) =>
      `🏅 Fiabilidade: a aquecer 🔥 *(faltam ${missing} ${missing === 1 ? 'jogo' : 'jogos'} p/ entrar no ranking)*`,
    streak: (cur: number, best: number) => `🔥 Sequência: **${cur}** *(melhor: ${best})*`,
    ghosts: (n: number) => `👻 Fantasma: **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
    none: 'Ainda não tens jogos registados. Aparece num jogo e carrega em **Cheguei ✅**.',
  },
};
