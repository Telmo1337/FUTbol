# FUTbol — bot de Discord para o futebol semanal

Bot de Discord que tira a fricção do "qual é o dia? quem joga?" de um grupo casual de futebol.
O admin abre uma votação de dia; toda a gente vota e confirma presença no mesmo canal. Lista de
espera, promoção automática quando alguém desiste, avisos, check-in à hora do jogo, equipas,
resultados e estatísticas — tudo tratado pelo bot, em português europeu.

`Cloudflare Workers` · `D1` · `Cron` · `TypeScript` · HTTP interactions — sem servidor
sempre-a-correr, sem cartão de crédito.

## Como funciona

1. **Votação** — o admin abre com `/novojogo` (ou abre sozinho pelo auto-jogo). O bot publica o
   quadro e pinga o cargo Jogador. Toda a gente carrega no(s) dia(s) em que pode.
2. **Dia escolhido** — no fim do prazo, a votação fecha e sai o vencedor (ou um desempate).
3. **Presenças** — abrem as inscrições: `Vou` / `Não vou` / `Talvez`.
4. **Lista + lista de espera** — os primeiros até ao máximo ficam confirmados; o resto fica em
   espera e sobe automaticamente quando alguém desiste.
5. **Avisos automáticos** — "jogo confirmado", "faltam X", ping a quem não respondeu, e fecho
   das inscrições antes do jogo.
6. **Check-in** — à hora do jogo abre o quadro "Cheguei". Quem aparece carrega; quem disse "Vou"
   e não carrega fica fantasma. A janela fecha sozinha e sai um recap.
7. **Equipas e resultado** — o admin monta Alpha vs Beta num painel privado, publica, e depois
   mete o placar, que vira V/E/D.
8. **Estatísticas** — `/stats` mostra os rankings do grupo; `/eu` mostra os teus.

## Comandos

| Comando | O que faz |
|---|---|
| `/novojogo` | Abrir uma votação de dia (só admin) |
| `/jogo` | Repor o jogo atual no canal |
| `/fecharvotacao` | Fechar já a votação (só admin) |
| `/cancelar` | Cancelar o jogo atual (só admin) |
| `/equipas` | Montar/editar as equipas num painel privado (só admin) |
| `/resultado` | Registar o placar do último jogo (só admin) |
| `/pagamentos` | Gerir quem já pagou (só admin) |
| `/stats` | Rankings do grupo; `/stats jogador:@X` mostra o cartão de um jogador |
| `/eu` | As tuas estatísticas (só tu vês) |
| `/topmarcadores` | Melhores marcadores e assistentes |
| `/comparar` | Comparar dois jogadores lado a lado |
| `/historico` | Histórico de jogos (todos ou de um jogador) |
| `/meuid` | Ver o teu Discord user id |
| `/ajuda` | Lista de comandos |

O `/novojogo` abre um formulário com 4 campos: **Horários** (uma opção por linha, `DD/MM HH:MM`,
duas ou mais), **Local** (opcional), **Jogadores** (mínimo-máximo, default 14-14) e **Fecho da
votação** (opcional; default 6h antes do horário mais cedo).

## Quickstart

```bash
cp .dev.vars.example .dev.vars     # preencher com os valores reais (gitignored)
npm install
npm run register                   # cria os slash commands no servidor
npm run db:migrate:local           # cria as tabelas na D1 local
npm run selftest                   # simula o ciclo todo, sem tocar no Discord
npm run deploy                     # publica o Worker na Cloudflare
```

Depois do deploy, cola o URL do Worker no Developer Portal do Discord (General Information ->
Interactions Endpoint URL). O passo a passo completo está em
[docs/development.md](docs/development.md).

## Estrutura

```
src/
  index.ts        entry point do Worker (interactions + cron)
  discord/        adapter Discord: verify (Ed25519), rest, components, commands, interactions
  core/           lógica pura (sem Discord/DB): votação, presenças, avisos, datas, stats
  db/             schema (Drizzle) + repo (único sítio com SQL)
  render/         construção do texto das mensagens
  services/       games.ts (orquestração) + tick.ts (relógio) + weekly.ts + stats.ts + ...
  messages.ts     todas as frases (pt-PT)
migrations/       SQL aplicado à D1 (local e remoto)
scripts/          selftest.ts · register-commands.ts · print-availability.ts
docs/             documentação de arquitetura e design
```

Os campos de id chamam-se `tgUserId` / `chatId` / `*MsgId` (herança de quando o bot era de
Telegram), mas guardam ids de Discord (snowflakes de 64 bits), por isso são strings (colunas
`TEXT`).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Stack, modelo de execução, camadas, fluxos HTTP e cron |
| [docs/system-design.md](docs/system-design.md) | State machine, tick, auto-jogo, nudges, motor de stats |
| [docs/data-model.md](docs/data-model.md) | Tabelas, diagrama ER, ids, migrações |
| [docs/features.md](docs/features.md) | Ciclo semanal, comandos e componentes, feature a feature |
| [docs/configuration.md](docs/configuration.md) | Variáveis, secrets, feature flags, valores afináveis |
| [docs/security.md](docs/security.md) | Assinatura Ed25519, secrets, escaping, gitleaks |
| [docs/development.md](docs/development.md) | Setup, testes, CI, release flow, deploy |
| [docs/decisions.md](docs/decisions.md) | Decisões de arquitetura (ADRs) |
| [docs/roadmap.md](docs/roadmap.md) | Histórico de versões e próximos passos |

## Segurança

As interactions são verificadas por assinatura Ed25519 com replay protection; os secrets vivem
em `wrangler secret put` e nunca no repositório; o input de utilizador é neutralizado para não
injetar menções. O secret scanning é feito com [gitleaks](https://github.com/gitleaks/gitleaks)
(local e na CI). Detalhe em [docs/security.md](docs/security.md).
