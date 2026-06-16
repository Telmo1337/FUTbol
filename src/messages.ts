// ALL player-facing text lives here, in European Portuguese (pt-PT), informal "tu".
// Never hardcode user-facing strings elsewhere — import from M.
// To add another language later, swap this object behind a tiny selector.

import { esc } from './util';
import { MIN_GAMES_TO_RANK } from './config';

export const M = {
  start:
    '⚽ <b>Olá! Sou o bot do nosso futebol.</b>\n\n' +
    'O admin abre uma votação de dia com /novojogo, e depois é só toda a gente ' +
    'carregar nos botões para votar e confirmar presença — tudo aqui no grupo.\n\n' +
    'Escreve /ajuda para veres os comandos.',

  help:
    '📋 <b>Comandos</b>\n\n' +
    '/novojogo — abrir uma votação de dia <i>(só admin)</i>\n' +
    '/jogo — ver o jogo atual\n' +
    '/fecharvotacao — fechar já a votação <i>(só admin)</i>\n' +
    '/cancelar — cancelar o jogo atual <i>(só admin)</i>\n' +
    '/stats — ranking de presenças e fiabilidade 📊\n' +
    '/eu — as tuas estatísticas 📇\n' +
    '/euquem — ver o teu ID de Telegram\n' +
    '/ajuda — esta mensagem',

  whoami: (id: number) =>
    `O teu ID de Telegram é <code>${id}</code>.\n\n` +
    'Para te tornares admin, mete este número em <code>ADMIN_IDS</code> (ver README).',

  notAdmin: '🔒 Só o admin pode fazer isto.',

  novojogoUsage:
    '📝 <b>Como abrir um jogo</b> <i>(só admin)</i>\n\n' +
    'Copia, ajusta e envia:\n\n' +
    '<pre>/novojogo\n' +
    'local: IPVC ESTG - campo 7x7\n' +
    'jogadores: 10-14\n' +
    'fecha: 13/06 21:00\n' +
    'dia: 14/06 20:00\n' +
    'dia: 18/06 21:00\n' +
    'dia: 20/06 18:00</pre>\n\n' +
    '• <b>local</b> — onde se joga\n' +
    '• <b>jogadores</b> — mínimo-máximo (ex.: 10-14)\n' +
    '• <b>fecha</b> — quando termina a votação\n' +
    '• <b>dia</b> — cada opção de horário (mete 2 ou mais)',

  errNeedTwoSlots: '⚠️ Precisas de pelo menos <b>2</b> opções de "dia:". Escreve /novojogo para veres o exemplo.',
  errBadPlayers: '⚠️ "jogadores" tem de ser tipo <code>10-14</code> (mínimo-máximo).',
  errMinGtCap: '⚠️ O mínimo de jogadores não pode ser maior que o máximo.',
  errBadDate: (line: string) => `⚠️ Não percebi a data: <code>${esc(line)}</code>. Usa o formato <code>DD/MM HH:MM</code>.`,
  errNoFutureSlots: '⚠️ Todas as datas estão no passado. Usa datas futuras.',
  gameAlreadyActive: '⚠️ Já existe um jogo ativo. Usa /cancelar antes de abrir outro.',
  noActiveGame: 'Não há nenhum jogo ativo. Abre um com /novojogo.',

  tieAdminPrompt: '🤝 <b>Empate na votação!</b> Admin, escolhe o horário 👇',

  promoted: (who: string, when: string, loc: string) =>
    `🎉 ${who}, abriu uma vaga — <b>estás dentro</b> para ${when}! 📍 ${esc(loc)}`,

  gameOn: (n: number, when: string, loc: string) =>
    `🎉 <b>Temos jogo!</b> ${n} confirmados para <b>${when}</b>. 📍 ${esc(loc)}`,

  shortWarn: (missing: number, inCount: number, min: number, when: string) =>
    `⚠️ Faltam <b>${missing}</b> para ${when} (${inCount}/${min}). Confirmem presença 👆`,

  nonRespPing: (mentions: string, when: string) =>
    `👋 Ainda não responderam: ${mentions}. Vão jogar <b>${when}</b>? Carreguem no botão 👆`,

  rsvpClosedFinal: (when: string, loc: string, names: string) =>
    `🔒 <b>Inscrições fechadas — ${when}</b>\n📍 ${esc(loc)}\n\n<b>Equipa final:</b>\n${names}`,

  cancelledNotEnough: (when: string, inCount: number, min: number) =>
    `❌ Sem jogadores suficientes para ${when} (${inCount}/${min}). Jogo cancelado.`,

  cancelledByAdmin: '❌ Jogo cancelado pelo admin.',

  // ---- Vote message fragments ----
  vote: {
    title: '🗳️ <b>Votação — quando jogamos?</b>',
    pickHint: 'Carrega no(s) horário(s) em que podes (podes escolher vários).',
    voters: (n: number) => `👥 ${n} ${n === 1 ? 'pessoa votou' : 'pessoas votaram'}`,
    closesAt: (when: string) => `⏳ Fecha ${when}`,
    votesCount: (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`,
    resultTitle: '✅ <b>Jogo marcado!</b>',
    tieTitle: '🗳️ <b>Votação encerrada — empate!</b>',
    tieFooter: 'O admin vai escolher o horário 👇',
  },

  // ---- RSVP live-message fragments ----
  rsvp: {
    markedTitle: (when: string) => `✅ <b>Jogo marcado — ${when}</b>`,
    lockedTitle: (when: string) => `🔒 <b>Jogo confirmado — ${when}</b>`,
    cancelledTitle: (when: string) => `❌ <b>Jogo cancelado — ${when}</b>`,
    prompt: 'Vais? Carrega num botão 👇',
    confirmed: (n: number, cap: number) => `🟢 <b>Confirmados (${n}/${cap})</b>`,
    waitlist: (n: number) => `📋 <b>Lista de espera (${n})</b>`,
    maybe: (n: number) => `🤔 <b>Talvez (${n})</b>`,
    out: (n: number) => `🔴 <b>Não vão (${n})</b>`,
    empty: '— ainda ninguém —',
    needMore: (missing: number, inCount: number, min: number) =>
      `⚠️ Faltam <b>${missing}</b> para confirmar o jogo (${inCount}/${min}).`,
    confirmedLine: (inCount: number, min: number) => `🎉 Jogo confirmado! (${inCount}/${min})`,
    closesAt: (when: string) => `⏳ Inscrições fecham ${when}`,
    buttons: { in: '✅ Vou', out: '❌ Não vou', maybe: '🤔 Talvez' },
  },

  // ---- Short toasts shown on the tapped button (answerCallbackQuery) ----
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
    title: (when: string) => `🟢 <b>Hora do jogo — ${when}</b>`,
    ping: (mentions: string) => `📣 ${mentions}\nChegaram ao campo? Carreguem em <b>Cheguei</b> 👇`,
    button: '✅ Cheguei',
    present: (n: number) => `✅ <b>Já cá estão (${n})</b>`,
    pending: (n: number) => `⏳ <b>Ainda por confirmar (${n})</b>`,
    empty: '— ainda ninguém —',
    closesAt: (when: string) => `⏳ Check-in fecha ${when}. Quem não carregar fica fantasma 👻`,
  },

  // ---- Post-game recap (auto-posted when the window closes) ----
  recap: {
    title: (when: string) => `🏁 <b>Resumo — ${when}</b>`,
    played: (n: number) => `👟 <b>Jogaram (${n})</b>`,
    ghosts: (n: number) => `👻 <b>Fantasmas (${n})</b>`,
    noGhosts: '👏 Zero fantasmas esta semana — toda a gente apareceu!',
    clearHint: '<i>Admin: alguém jogou mas esqueceu-se de carregar? Toca no nome para corrigir 👇</i>',
    footer: '📊 Ranking completo em /stats',
    ghostButton: (name: string) => `✅ ${name} jogou`,
    empty: '— ninguém —',
  },

  // ---- /stats group leaderboard ----
  stats: {
    title: '📊 <b>Estatísticas FUTbol</b>',
    since: (when: string) => `<i>desde ${when}</i>`,
    totalGames: (n: number) => `⚽ ${n} ${n === 1 ? 'jogo jogado' : 'jogos jogados'}`,
    none: 'Ainda não há jogos jogados. As estatísticas aparecem depois do primeiro jogo. ⚽',
    reliableTitle: `🏅 <b>Mais fiáveis</b> <i>(mín. ${MIN_GAMES_TO_RANK} jogos)</i>`,
    reliableLine: (pct: number, shown: number, total: number) => `${pct}% <i>(${shown}/${total})</i>`,
    reliableEmpty: '<i>ainda ninguém com jogos suficientes — a aquecer 🔥</i>',
    appearancesTitle: '👟 <b>Mais presenças</b>',
    appearancesLine: (n: number) => `${n} ${n === 1 ? 'jogo' : 'jogos'}`,
    streakTitle: '🔥 <b>Em sequência</b>',
    streakLine: (n: number) => `${n} seguidos`,
    ghostsTitle: '👻 <b>Mais fantasma</b>',
    ghostsLine: (n: number) => `${n} ${n === 1 ? 'falta' : 'faltas'}`,
    ghostsEmpty: '<i>sem fantasmas — que grupo de confiança! 👏</i>',
  },

  // ---- /eu personal card ----
  eu: {
    title: (name: string) => `📇 <b>${name}</b>`,
    appearances: (n: number) => `👟 Presenças: <b>${n}</b>`,
    reliability: (pct: number, shown: number, total: number) => `🏅 Fiabilidade: <b>${pct}%</b> <i>(${shown}/${total})</i>`,
    reliabilityWarming: (missing: number) =>
      `🏅 Fiabilidade: a aquecer 🔥 <i>(faltam ${missing} ${missing === 1 ? 'jogo' : 'jogos'} p/ entrar no ranking)</i>`,
    streak: (cur: number, best: number) => `🔥 Sequência: <b>${cur}</b> <i>(melhor: ${best})</i>`,
    ghosts: (n: number) => `👻 Fantasma: <b>${n}</b> ${n === 1 ? 'vez' : 'vezes'}`,
    none: 'Ainda não tens jogos registados. Aparece num jogo e carrega em <b>Cheguei ✅</b>.',
  },
};
