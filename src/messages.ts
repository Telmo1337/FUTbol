// ALL player-facing text lives here, in European Portuguese (pt-PT), informal "tu".
// Never hardcode user-facing strings elsewhere — import from M.
// To add another language later, swap this object behind a tiny selector.

import { esc } from './util';

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
    error: 'Algo correu mal 😬',
  },
};
