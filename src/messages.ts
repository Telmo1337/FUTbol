// ALL player-facing text lives here, in European Portuguese (pt-PT), informal "tu".
// Never hardcode user-facing strings elsewhere — import from M.
// Formatting is Discord markdown: **bold**, *italic*, `code`, ```block```.
// To add another language later, swap this object behind a tiny selector.

import { esc } from './util';
import { MIN_GAMES_TO_RANK, MIN_GAMES_FOR_WINRATE, PERFECT_RECORD_MIN_GAMES } from './config';

export const M = {
  start:
    '⚽ **Olá! Sou o bot do nosso futebol.**\n\n' +
    'O admin abre uma votação de dia com `/novojogo`, e depois é só toda a gente ' +
    'carregar nos botões para votar e confirmar presença — tudo aqui no canal.\n\n' +
    'Escreve `/ajuda` para veres os comandos.',

  // Player help — only the commands a normal player uses.
  help:
    '📋 **Comandos**\n\n' +
    '`/jogo` — ver o jogo atual\n' +
    '`/stats` — rankings do grupo; `/stats jogador` vê o cartão de alguém\n' +
    '`/eu` — as tuas estatísticas *(só tu vês)*\n' +
    '`/comparar` — comparar dois jogadores lado a lado\n' +
    '`/topmarcadores` — melhores marcadores e assistentes\n' +
    '`/historico` — histórico de jogos (todos ou de um jogador)\n' +
    '`/meuid` — ver o teu ID de Discord\n' +
    '`/ajuda` — esta mensagem',

  // Admin help — everything (only shown when an admin runs /ajuda).
  helpAdmin:
    '📋 **Comandos**\n\n' +
    '`/jogo` — ver o jogo atual\n' +
    '`/stats` — rankings do grupo; `/stats jogador` vê o cartão de alguém\n' +
    '`/eu` — as tuas estatísticas *(só tu vês)*\n' +
    '`/comparar` — comparar dois jogadores lado a lado\n' +
    '`/topmarcadores` — melhores marcadores e assistentes\n' +
    '`/historico` — histórico de jogos (todos ou de um jogador)\n' +
    '`/meuid` — ver o teu ID de Discord\n' +
    '`/ajuda` — esta mensagem\n\n' +
    '**Admin** 🔒\n' +
    '`/novojogo` — abrir uma votação de dia\n' +
    '`/fecharvotacao` — fechar já a votação\n' +
    '`/cancelar` — cancelar o jogo atual\n' +
    '`/equipas` — montar/editar as equipas do jogo\n' +
    '`/resultado` — registar o placar do último jogo\n' +
    '`/pagamentos` — gerir quem já pagou o jogo',

  whoami: (id: string) =>
    `O teu ID de Discord é \`${id}\`.\n\n` +
    'Para te tornares admin, mete este id em `ADMIN_IDS` (ver README).',

  notAdmin: '🔒 Só o admin pode fazer isto.',

  // Shown when the ⚽ golos/assistências feature is switched off (GOLOS_ENABLED=false).
  golosOff: '⚽ A contagem de golos e assistências está desativada de momento.',

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
  errBadGoals: '⚠️ Os golos têm de ser números inteiros (0 ou mais).',
  gameAlreadyActive: '⚠️ Já existe um jogo ativo. Usa `/cancelar` antes de abrir outro.',
  noActiveGame: 'Não há nenhum jogo ativo. Abre um com `/novojogo`.',
  noTeamGame: 'Não há nenhum jogo com equipas. Fecha as inscrições de um jogo primeiro.',

  tieAdminPrompt: '🤝 **Empate na votação!** Admin, escolhe o horário.',
  tieResolvedNote: (label: string) => `✅ Horário escolhido: **${esc(label)}**`,
  votingExpired: '⏰ Todos os horários desta votação já passaram. Jogo cancelado — nova sondagem em breve.',

  promoted: (who: string, when: string, loc: string) =>
    `${who}, abriu uma vaga — **estás dentro** para ${when}! 📍 ${esc(loc)}`,

  gameOn: (n: number, when: string, loc: string) =>
    `**Temos jogo!** ${n} confirmados para **${when}**. 📍 ${esc(loc)}`,

  shortWarn: (missing: number, inCount: number, min: number, when: string) =>
    `⚠️ Faltam **${missing}** para ${when} (${inCount}/${min}). Confirmem presença.`,

  nonRespPing: (mentions: string, when: string) =>
    `Ainda não responderam: ${mentions}. Vão jogar **${when}**? Carreguem no botão.`,

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
    tieFooter: 'O admin vai escolher o horário.',
  },

  // ---- RSVP live-message fragments ----
  rsvp: {
    markedTitle: (when: string) => `✅ **Jogo marcado — ${when}**`,
    lockedTitle: (when: string) => `🔒 **Jogo confirmado — ${when}**`,
    cancelledTitle: (when: string) => `❌ **Jogo cancelado — ${when}**`,
    prompt: 'Vais? Carrega num botão.',
    confirmed: (n: number, cap: number) => `🟢 **Confirmados (${n}/${cap})**`,
    waitlist: (n: number) => `📋 **Lista de espera (${n})**`,
    maybe: (n: number) => `🤔 **Talvez (${n})**`,
    out: (n: number) => `🔴 **Não vão (${n})**`,
    empty: '— ainda ninguém —',
    needMore: (missing: number, inCount: number, min: number) =>
      `⚠️ Faltam **${missing}** para confirmar o jogo (${inCount}/${min}).`,
    confirmedLine: (inCount: number, min: number) => `Jogo confirmado! (${inCount}/${min})`,
    closesAt: (when: string) => `⏳ Inscrições fecham ${when}`,
    buttons: { in: '✅ Vou', out: '❌ Não vou', maybe: '🤔 Talvez' },
  },

  // ---- Short toasts shown to the tapper (ephemeral interaction reply) ----
  cb: {
    votingClosed: 'A votação já fechou.',
    rsvpIn: 'Estás dentro! ✅',
    rsvpWait: 'Estás na lista de espera 📋',
    rsvpOut: 'Marcado: não vais ❌',
    rsvpMaybe: 'Marcado: talvez 🤔',
    rsvpClosed: 'As inscrições já fecharam.',
    onlyAdmin: 'Só o admin pode escolher.',
    tieResolved: 'Horário escolhido ✅',
    tiePastSlot: '⚠️ Esse horário já passou. Escolhe outro.',
    tieAlreadyResolved: 'Este desempate já não está ativo.',
    checkinDone: 'Boa! Ficaste registado ✅',
    checkinAlready: 'Já estavas registado ✅',
    checkinClosed: 'O check-in já fechou.',
    checkinNotInList: 'Não estavas na lista deste jogo 🤔',
    ghostCleared: 'Corrigido — já não é fantasma ✅',
    teamsNeedBoth: '⚠️ Precisas de pelo menos um jogador em cada equipa.',
    teamsPublished: 'Equipas publicadas no canal ✅',
    resultNoTeams: '⚠️ Este jogo ainda não tem equipas fechadas.',
    resultSaved: 'Resultado registado ✅',
    error: 'Algo correu mal 😬',
  },

  // ---- Check-in board (kickoff → +window): "Cheguei ✅" ----
  checkin: {
    title: (when: string) => `🟢 **Hora do jogo — ${when}**`,
    ping: (mentions: string) => `${mentions}\nChegaram ao campo? Carreguem em **Cheguei**.`,
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
    noGhosts: 'Zero fantasmas esta semana — toda a gente apareceu!',
    clearHint: '*Admin: alguém jogou mas esqueceu-se de carregar? Toca no nome para corrigir.*',
    footer: '📊 Ranking completo em `/stats`',
    ghostButton: (name: string) => `✅ ${name} jogou`,
    empty: '— ninguém —',
  },

  // ---- ⚔️ Equipas (team formation) ----
  teams: {
    // Public placeholder, auto-posted when the squad is confirmed. Flips to the board below.
    placeholderTitle: '⚔️ **Equipas a caminho**',
    placeholderBody: 'O admin vai montar as equipas para este jogo.',
    placeholderButton: '⚙️ Montar equipas (admin)',
    // The private (ephemeral) panel only the admin sees while choosing.
    panelTitle: '⚙️ **Montar equipas** *(só tu vês isto)*',
    panelHint: 'Escolhe quem fica em cada equipa. Quem deixares de fora não jogou.',
    selectAlphaPlaceholder: 'Escolher a Equipa Alpha…',
    selectBetaPlaceholder: 'Escolher a Equipa Beta…',
    lockButton: '🔒 Fechar equipas',
    // The published public board (everyone sees the teams).
    boardTitle: '⚔️ **Equipas**',
    alpha: (n: number) => `🅰️ **Alpha (${n})**`,
    beta: (n: number) => `🅱️ **Beta (${n})**`,
    out: (n: number) => `🪑 **De fora (${n})**`,
    empty: '— ninguém —',
    publishedHint: '*Admin: edita as equipas ou mete o resultado quando o jogo acabar.*',
    editButton: '✏️ Editar equipas',
    resultButton: '📊 Inserir resultado',
    captureButton: '⚽ Golos & assists',
  },

  // ---- 📊 Resultado (score + result card) ----
  result: {
    modalTitle: 'Resultado do jogo',
    fieldAlpha: 'Golos da Equipa Alpha',
    fieldBeta: 'Golos da Equipa Beta',
    cardTitle: (day: string) => (day ? `📊 **Resultado — ${day}**` : '📊 **Resultado**'),
    score: (ga: number, gb: number) => `🅰️ **Alpha  ${ga} – ${gb}  Beta** 🅱️`,
    winAlpha: 'Vitória da **Alpha**!',
    winBeta: 'Vitória da **Beta**!',
    draw: '🤝 **Empate**',
    footer: '📊 Já conta para as estatísticas — `/stats`',
  },

  // ---- ⚽ Captura de golos/assistências (painel ephemeral, só admin) ----
  capture: {
    title: (day: string) => (day ? `⚽ **Golos & Assistências — ${day}**` : '⚽ **Golos & Assistências**'),
    score: (ga: number, gb: number) => `🅰️ ${ga}–${gb} 🅱️`,
    tally: (assigned: number, total: number) => `golos atribuídos: ${assigned}/${total}`,
    hint: '*Escolhe quem marcou/assistiu — cada escolha soma +1. Enganaste-te? "Anular" tira o último.*',
    empty: '*Ainda sem golos nem assistências. Escolhe o marcador no menu.*',
    // one line per player with at least one event: "• Tester 1  ⚽×2  🅰️×1"
    playerLine: (name: string, goals: number, assists: number) =>
      `• ${name}${goals > 0 ? `  ⚽×${goals}` : ''}${assists > 0 ? `  🅰️×${assists}` : ''}`,
    goalSelect: '⚽ Marcar golo…',
    assistSelect: '🅰️ Marcar assistência…',
    undoGoal: '↩️ Anular golo',
    undoAssist: '↩️ Anular assist',
    done: '✅ Concluir',
    // shown after "Concluir" (read-only, no buttons)
    doneTitle: (day: string) => (day ? `⚽ **Golos & Assistências — ${day}**` : '⚽ **Golos & Assistências**'),
    doneFooter: '📊 Já conta para as estatísticas — `/stats`',
  },

  // ---- 💶 Pagamentos (quadro público + painel ephemeral, só admin) ----
  pay: {
    // shown when the 💶 pagamentos feature is switched off (PAGAMENTOS_ENABLED=false)
    off: '💶 Os pagamentos estão desativados de momento.',
    noGame: 'Não há nenhum jogo com inscrições fechadas para gerir pagamentos. Fecha as inscrições de um jogo primeiro.',
    posted: 'Feito — o quadro de pagamentos está no canal 👇',
    // ---- public board ----
    boardTitle: (day: string) => (day ? `💶 **Pagamentos — ${day}**` : '💶 **Pagamentos**'),
    priceUnset: '*Preço por definir — o admin define em 💶 Gerir pagamentos.*',
    priceLine: (v: string) => `💶 **${v}** por pessoa`,
    totalsLine: (got: string, exp: string, left: string, n: number, total: number) =>
      `Recebido: **${got}** de ${exp} · falta **${left}** *(${n}/${total} pagaram)*`,
    paidHeader: (n: number) => `✅ **Já pagaram (${n})**`,
    oweHeader: (n: number) => `⏳ **Em falta (${n})**`,
    empty: '— ninguém —',
    boardFooter: '*Admin: carrega em 💶 Gerir pagamentos para marcar quem pagou.*',
    manageButton: '💶 Gerir pagamentos',
    // ---- ephemeral admin panel ----
    panelTitle: '💶 **Gerir pagamentos** *(só tu vês isto)*',
    panelHint: 'Marca no menu quem já pagou. Usa 💶 Definir preço para o valor por pessoa.',
    selectPlaceholder: 'Quem já pagou…',
    priceButton: '💶 Definir preço',
    doneButton: '✅ Concluir',
    panelDone: '✅ Pagamentos atualizados. O quadro está no canal.',
    // ---- 💶 price modal ----
    priceModalTitle: 'Preço por pessoa',
    priceField: 'Preço por pessoa (€) — ex.: 5 ou 5,50',
    errBadPrice: '⚠️ Preço inválido. Usa um número como `5` ou `5,50`.',
  },

  // ---- 🧪 /testjogo (test-channel-only seed) ----
  test: {
    disabled: '🔒 O `/testjogo` está desativado. Define `TEST_CHANNEL_ID` para o ativar.',
    wrongChannel: '🔒 O `/testjogo` só corre no canal de testes.',
    created: (n: number) => `🧪 Jogo de teste criado com ${n} jogadores confirmados. As equipas estão no canal.`,
    createdMany: (n: number) => `🧪 ${n} jogos de teste criados (com equipas e resultado). Folheia com \`/historico\`.`,
  },

  // ---- /stats group leaderboard ----
  stats: {
    title: '📊 **Estatísticas FUTbol**',
    since: (when: string) => `*desde ${when}*`,
    totalGames: (n: number) => `${n} ${n === 1 ? 'jogo jogado' : 'jogos jogados'}`,
    none: 'Ainda não há jogos jogados. As estatísticas aparecem depois do primeiro jogo.',
    reliableTitle: `🏅 **Mais fiáveis** *(mín. ${MIN_GAMES_TO_RANK} jogos)*`,
    reliableLine: (pct: number, shown: number, total: number) => `${pct}% *(${shown}/${total})*`,
    reliableEmpty: '*ainda ninguém com jogos suficientes — a aquecer*',
    appearancesTitle: '👟 **Mais presenças**',
    appearancesLine: (n: number) => `${n} ${n === 1 ? 'jogo' : 'jogos'}`,
    streakTitle: '🔥 **Em sequência**',
    streakLine: (n: number) => `${n} seguidos`,
    ghostsTitle: '👻 **Mais fantasma**',
    ghostsLine: (n: number) => `${n} ${n === 1 ? 'falta' : 'faltas'}`,
    ghostsEmpty: '*sem fantasmas — grupo de confiança*',
    // ---- "Este mês" highlight ----
    monthTitle: (month: string) => `📅 **Este mês — ${month}**`,
    monthNone: '*ainda sem jogos este mês — o primeiro já conta*',
    motmLine: (name: string, games: number, pct: number | null, streak: number) =>
      `Jogador do Mês: **${name}** — ${games} ${games === 1 ? 'jogo' : 'jogos'}` +
      `${pct != null ? ` · ${pct}%` : ''}${streak > 1 ? ` · ${streak} seguidos` : ''}`,
    monthAppearancesTitle: '👟 **Presenças do mês**',
    // ---- new all-time boards ----
    bestStreakTitle: '📈 **Maior sequência de sempre**',
    bestStreakLine: (n: number) => `${n} seguidos`,
    earlyBirdTitle: '🐦 **Early bird** *(primeiro a dizer "Vou")*',
    earlyBirdLine: (n: number) => `${n} ${n === 1 ? 'vez' : 'vezes'}`,
    perfectTitle: `💯 **Registo perfeito** *(100% em ≥${PERFECT_RECORD_MIN_GAMES} jogos)*`,
    perfectLine: (n: number) => `${n} ${n === 1 ? 'jogo' : 'jogos'}`,
    // ---- result boards (V/E/D) ----
    winsTitle: '🏆 **Mais vitórias**',
    winsLine: (n: number) => `${n} ${n === 1 ? 'vitória' : 'vitórias'}`,
    winPctTitle: `🎯 **Melhor % de vitórias** *(mín. ${MIN_GAMES_FOR_WINRATE} jogos)*`,
    winPctLine: (pct: number, w: number, d: number, l: number) => `${pct}% *(${w}-${d}-${l})*`,
    winStreakTitle: '🔝 **Maior série de vitórias**',
    winStreakLine: (n: number) => `${n} seguidas`,
    // ---- ⚽ goleadores / 🅰️ assistências (boards separadas) ----
    goalsTitle: '⚽ **Goleadores**',
    goalsLine: (n: number) => `${n} ${n === 1 ? 'golo' : 'golos'}`,
    assistsTitle: '🅰️ **Assistências**',
    assistsLine: (n: number) => `${n} ${n === 1 ? 'assistência' : 'assistências'}`,
    // ---- /topmarcadores (só os dois quadros, à parte do /stats cheio) ----
    topTitle: '⚽ **Marcadores & Assistências**',
    topNone: 'Ainda não há golos nem assistências registados. Aparecem aqui depois do primeiro jogo com marcadores.',
  },

  // ---- /eu personal card ----
  eu: {
    title: (name: string) => `📇 **${name}**`,
    appearances: (n: number) => `👟 Presenças: **${n}**`,
    reliability: (pct: number, shown: number, total: number) => `🏅 Fiabilidade: **${pct}%** *(${shown}/${total})*`,
    reliabilityWarming: (missing: number) =>
      `🏅 Fiabilidade: a aquecer *(faltam ${missing} ${missing === 1 ? 'jogo' : 'jogos'} p/ entrar no ranking)*`,
    streak: (cur: number, best: number) => `🔥 Sequência: **${cur}** *(melhor: ${best})*`,
    ghosts: (n: number) => `👻 Fantasma: **${n}** ${n === 1 ? 'vez' : 'vezes'}`,
    // ---- result lines ----
    wins: (w: number, d: number, l: number) => `🏆 Vitórias: **${w}** *(V-E-D ${w}-${d}-${l})*`,
    winPct: (pct: number) => `🎯 % de vitórias: **${pct}%**`,
    winStreak: (cur: number, best: number) => `🔝 Série de vitórias: **${cur}** *(melhor: ${best})*`,
    goals: (n: number) => `⚽ Golos: **${n}**`,
    assists: (n: number) => `🅰️ Assistências: **${n}**`,
    rankSuffix: (pos: number, total: number) => ` · ${pos}º de ${total}`,
    none: 'Ainda não tens jogos registados. Aparece num jogo e carrega em **Cheguei ✅**.',
  },

  comparar: {
    title: (a: string, b: string) => `⚔️ **${a}** vs **${b}**`,
    appearances: (a: string, b: string) => `👟 Presenças: ${a} — ${b}`,
    reliability: (a: string, b: string) => `🏅 Fiabilidade: ${a} — ${b}`,
    streak: (a: string, b: string, ba: number, bb: number) => `🔥 Sequência: ${a} — ${b} *(melhor: ${ba} — ${bb})*`,
    ghosts: (a: string, b: string) => `👻 Fantasma: ${a} — ${b}`,
    wins: (a: string, b: string) => `🏆 Vitórias: ${a} — ${b}`,
    winPct: (a: string, b: string) => `🎯 % vitórias: ${a} — ${b}`,
    winStreak: (a: string, b: string, ba: number, bb: number) =>
      `🔝 Série de vitórias: ${a} — ${b} *(melhor: ${ba} — ${bb})*`,
    goals: (a: string, b: string) => `⚽ Golos: ${a} — ${b}`,
    assists: (a: string, b: string) => `🅰️ Assistências: ${a} — ${b}`,
  },

  // ---- 📜 /historico (paginated game history) ----
  history: {
    title: '📜 **Histórico**',
    titlePerson: (name: string) => `📜 **Histórico — ${name}**`,
    none: 'Ainda não há jogos no histórico. Aparecem aqui depois do primeiro jogo.',
    nonePerson: (name: string) => `${name} ainda não tem jogos no histórico.`,
    noResult: '*(sem resultado)*',
    // global line: a game's Alpha–Beta score + the winner badge
    scoreGlobal: (a: number, b: number) => `🅰️ ${a}–${b} 🅱️`,
    winAlpha: '🏆 Alpha',
    winBeta: '🏆 Beta',
    draw: '🤝 Empate',
    // per-person line: the side they played + their own outcome (their goals first)
    side: (s: 'A' | 'B') => (s === 'A' ? '🅰️ Alpha' : '🅱️ Beta'),
    personWin: (mine: number, theirs: number) => `✅ Vitória (${mine}–${theirs})`,
    personLoss: (mine: number, theirs: number) => `❌ Derrota (${mine}–${theirs})`,
    personDraw: (mine: number, theirs: number) => `🤝 Empate (${mine}–${theirs})`,
    // golos: the game's top scorer (global view) / this player's own tally (per-person view)
    scorer: (name: string) => `⚽ ${name}`,
    personTally: (g: number, a: number) => [g > 0 ? `⚽${g}` : '', a > 0 ? `🅰️${a}` : ''].filter(Boolean).join(' '),
    // ◀️/▶️ pagination
    pageIndicator: (cur: number, total: number) => `Pág. ${cur}/${total}`,
    prev: '◀️',
    next: '▶️',
  },
};
