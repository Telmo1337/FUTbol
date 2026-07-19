# Configuração

Como o bot é configurado: variáveis de ambiente, secrets, feature flags e os valores afináveis
do código.

## Variáveis e secrets

Os valores não-secretos vivem em `wrangler.toml` (`[vars]`); os secretos são definidos com
`wrangler secret put` e ficam fora do repositório. Em desenvolvimento, tudo isto vai para
`.dev.vars` (gitignored) — ver [development.md](development.md).

| Nome | Tipo | Efeito |
|---|---|---|
| `TZ` | var | Timezone; sempre `Europe/Lisbon` |
| `DISCORD_BOT_TOKEN` | secret | Autenticação na Discord REST API (envio de mensagens, registo) |
| `DISCORD_PUBLIC_KEY` | var/secret | Verificação Ed25519 das interactions recebidas |
| `DISCORD_APPLICATION_ID` | var (.dev.vars) | Registo dos slash commands |
| `DISCORD_GUILD_ID` | var (.dev.vars) | Servidor onde os comandos são registados |
| `ADMIN_IDS` | var | Discord user ids separados por vírgula; quem pode usar comandos de admin |
| `GAME_CHANNEL_ID` | var | Canal do auto-jogo; vazio desliga a feature |
| `TEST_CHANNEL_ID` | var | Canal onde `/testjogo` é permitido; vazio desliga o comando |
| `GOLOS_ENABLED` | var | Feature flag de golos/assistências |
| `ASSISTS_ENABLED` | var | Sub-flag só das assistências |
| `PAGAMENTOS_ENABLED` | var | Feature flag de pagamentos |

`DISCORD_APPLICATION_ID` e `DISCORD_GUILD_ID` só são precisos localmente, para o
`npm run register`. Os tipos do `Env` estão em `src/types.ts`.

## Feature flags

As flags são lidas em runtime a partir do `env` por funções em `src/util.ts`
(`golosEnabled`, `assistsEnabled`, `pagamentosEnabled`). A semântica do gate é a mesma para
todas: ligado por omissão, e só fica desligado se o valor for explicitamente `false`, `0`,
`off` ou `no` (sem distinção de maiúsculas).

| Flag | Valor no `wrangler.toml` | Notas |
|---|---|---|
| `GOLOS_ENABLED` | `"true"` | Master switch de golos/assistências (painel de captura, boards, `/topmarcadores`) |
| `ASSISTS_ENABLED` | `"false"` | Só as assistências; em produção está desligada (golos sim, assists não) |
| `PAGAMENTOS_ENABLED` | `"true"` | Board e painel de pagamentos |

Dois pontos a reter:

- A flag de assistências tem de ser sempre conjugada com a de golos no ponto de uso: as
  assistências fazem parte da feature de golos, por isso golos-off implica assists-off.
- Desligar uma flag esconde a UI mas **não apaga dados**. Os eventos e pagamentos já gravados
  sobrevivem e voltam a aparecer quando a flag é religada.

## Valores afináveis (src/config.ts)

Constantes do domínio, todas num único ficheiro para serem fáceis de afinar. Durações em
milissegundos.

### Jogo e janelas de tempo

| Constante | Valor | Significado |
|---|---|---|
| `DEFAULT_MIN_PLAYERS` / `DEFAULT_CAP_PLAYERS` | 14 / 14 | Futebol-7: 14 em campo, por isso o jogo só confirma com 14 |
| `RSVP_CLOSE_BEFORE_KICKOFF_MS` | 3h | As inscrições fecham 3h antes do jogo |
| `CHECKIN_WINDOW_MS` | 5h | Quanto tempo o quadro "Cheguei" fica aberto antes de atribuir fantasmas |
| `VOTE_LEAD_BEFORE_EARLIEST_MS` | 6h | Default do fecho da votação, se o admin não der um |
| `SHORT_WARN_BEFORE_CLOSE_MS` | 6h | Aviso "faltam X" antes do fecho das inscrições |
| `NONRESP_PING_BEFORE_CLOSE_MS` | 12h | Ping a quem não respondeu antes do fecho |

### Estatísticas

| Constante | Valor | Significado |
|---|---|---|
| `MIN_GAMES_TO_RANK` | 3 | Jogos confirmados mínimos para entrar no board de fiabilidade |
| `MIN_GAMES_FOR_WINRATE` | 3 | Jogos-com-resultado mínimos para o board de win rate |
| `LEADERBOARD_TOP_N` | 5 | Nomes por board no `/stats` |
| `MONTH_TOP_N` | 3 | Nomes no mini-board "Este mês" |
| `HISTORY_PAGE_SIZE` | 5 | Jogos por página no `/historico` |
| `PERFECT_RECORD_MIN_GAMES` | 5 | Jogos confirmados mínimos para o registo perfeito (100%) |
| `MOTM_W_APPEARANCE` / `MOTM_W_STREAK` / `MOTM_W_RELIABILITY` / `MOTM_W_GHOST` | 10 / 3 / 5 / 4 | Pesos do Jogador do Mês |
| `MIN_GAMES_FOR_MOTM` | 2 | Jogos no mês mínimos para atribuir Jogador do Mês |
| `MOTM_MIN_APPEARANCES` | 2 | Presenças mínimas do vencedor |

### Auto-jogo e field.pt

| Constante | Valor | Significado |
|---|---|---|
| `AUTO_OPEN_START_HOUR` / `AUTO_OPEN_END_HOUR` | 9 / 23 | Janela diurna (Lisbon) em que o auto-jogo pode abrir |
| `AUTO_OPEN_COOLDOWN_MS` | 12h | Intervalo mínimo entre auto-jogos |
| `AVAIL_DAYS_AHEAD` | 8 | Dias à frente na procura de slots livres |
| `AVAIL_EARLIEST_HOUR` / `AVAIL_LATEST_HOUR` | 18 / 24 | Janela horária dos kickoffs (exceto Sábado) |
| `AVAIL_ANY_HOUR_DOWS` | `[6]` | Dias em que qualquer hora aberta vale (Sábado) |
| `WEEKLY_EXCLUDED_DOWS` | `[5, 7]` | Dias que o grupo nunca joga (Sexta + Domingo) |
| `AVAIL_MAX_SLOTS` | 25 | Máximo de slots (limite de botões do Discord) |
| `WEEKLY_LOCATION_NOTE` | `IPVC ESE - campo 7x7` | Local do auto-jogo |
| `FIELD_API_KEY` | (Firebase web key) | **Pública por design** — ver [security.md](security.md) |
| `FIRESTORE_BASE` / `FIELD_ID` | ids do field.pt | Documentos a ler no Firestore |

### Ping do grupo

A abertura de uma sondagem menciona o cargo Jogador (forma `<@&ROLE_ID>`), definido por
`GROUP_ROLE_ID` em `src/config.ts`, com `allowed_mentions` a incluir `roles`. Isto notifica o
grupo sem precisar da permissão MENTION_EVERYONE no bot — basta o cargo estar marcado como
mencionável por todos no Discord. Se `GROUP_ROLE_ID` ficar vazio, cai no `@everyone` (que só
pinga se o bot tiver MENTION_EVERYONE no canal). Detalhe em [security.md](security.md).
