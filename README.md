# ⚽ FUTbol — bot de Discord para o futebol semanal

A Discord bot that kills the weekly "qual é o dia? quem joga?" friction for a casual
football group. The admin opens a day-vote; everyone taps to vote and to confirm presence —
all inside one channel. Waitlist, auto-promotion on dropouts, and automatic reminders
are handled for you. **European Portuguese (pt-PT)**, runs for **€0**.

> Corre em **Cloudflare Workers + D1 + Cron** via **HTTP interactions** (slash commands,
> botões e um modal) — sem servidor sempre-a-correr, sem cartão de crédito.

## Como funciona (the weekly loop)

1. **🗳️ Votação** — o admin abre com `/novojogo` (preenche um formulário: 2+ horários + local). O bot publica o quadro e faz `@everyone`. Toda a gente carrega no(s) dia(s) em que pode.
2. **📅 Dia escolhido** — no fim do prazo, o bot fecha a votação e anuncia o vencedor.
3. **✅ Presenças** — o bot abre as inscrições: `✅ Vou / ❌ Não vou / 🤔 Talvez`.
4. **📋 Lista + lista de espera** — os primeiros até ao máximo ficam confirmados; o resto vai para a lista de espera e **sobe automaticamente** quando alguém desiste.
5. **🔔 Avisos automáticos** — "jogo confirmado", "faltam X", pings a quem não respondeu, e fecho das inscrições antes do jogo.
6. **🟢 Check-in (à hora do jogo)** — o bot abre um quadro `✅ Cheguei`. Quem aparece carrega; quem disse "Vou" e não carrega fica **fantasma 👻**. Os suplentes também podem carregar e contam presença. 5h depois fecha sozinho e sai um **resumo** (com botões para o admin corrigir falsos fantasmas).
7. **⚔️ Equipas + resultado** — quando as inscrições fecham, o bot abre sozinho um quadro **Equipas**. O admin monta **Team Alpha vs Team Beta** num **painel privado** (escolhe quem fica em cada equipa; quem deixa de fora não jogou) e publica — só aí os jogadores veem as equipas. Acabado o jogo, mete o placar (`📊 Inserir resultado` ou `/resultado`) → vira **V/E/D + vitórias**.
8. **📊 Estatísticas** — `/stats` mostra os rankings (🏅 fiabilidade, 👟 presenças, 🔥 sequência, 👻 fantasma, 🏆 vitórias, 🎯 % de vitórias, 🔝 série de vitórias) e `/eu` mostra as tuas.

## Comandos

| Comando | O que faz |
|---|---|
| `/novojogo` | Abrir uma votação de dia *(só admin — abre um formulário)* |
| `/jogo` | Re-mostrar o jogo atual no canal |
| `/fecharvotacao` | Fechar já a votação *(só admin)* |
| `/cancelar` | Cancelar o jogo atual *(só admin)* |
| `/equipas` | Montar/editar as equipas do jogo num painel privado *(só admin)* ⚔️ |
| `/resultado` | Registar o placar do último jogo *(só admin)* 📊 |
| `/stats` | Rankings do grupo 📊; `/stats jogador:@X` mostra o cartão de um jogador *(público)* |
| `/eu` | As tuas estatísticas 📇, com a tua posição em cada ranking *(só tu vês)* |
| `/comparar` | Comparar dois jogadores lado a lado ⚔️ *(`/comparar a:@X b:@Y`)* |
| `/meuid` | Ver o teu ID de Discord |
| `/ajuda` | Ajuda |

### O formulário do `/novojogo`

`/novojogo` abre um popup com 4 campos:
- **Horários** — uma opção por linha, no formato `DD/MM HH:MM` (mete 2 ou mais).
- **Local** — onde se joga *(opcional)*.
- **Jogadores** — mínimo-máximo, ex. `10-14` *(opcional, default 10-14)*.
- **Fecho da votação** — `DD/MM HH:MM` *(opcional; default = 6h antes do horário mais cedo)*.

---

## 🛠️ Setup (primeira vez)

### 1. Criar a aplicação/bot no Developer Portal (só email, sem SMS)
1. Vai a **https://discord.com/developers/applications** → **New Application** → dá-lhe um nome (ex.: *FUTbol*).
2. **General Information**: copia o **Application ID** e a **Public Key**.
3. **Bot** (menu lateral) → **Reset Token** → copia o **token** (só aparece uma vez). Desliga **Public Bot**.
4. **Installation** (ou **OAuth2 → URL Generator**): scopes **`bot`** + **`applications.commands`**; permissões **Send Messages** e **Mention Everyone**. Abre o URL gerado e **adiciona o bot ao teu servidor**.
5. No Discord, ativa o **Modo de Programador** (Definições → Avançado). Clica-direito no **canal → Copiar ID do canal**, no **servidor → Copiar ID do servidor**, e no **teu nome → Copiar ID de utilizador**.

### 2. Configurar segredos
```bash
cp .dev.vars.example .dev.vars
```
Edita `.dev.vars` e mete: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`,
`DISCORD_GUILD_ID` (= id do servidor) e `ADMIN_IDS` (= o teu id de utilizador).

### 3. Registar os comandos no servidor
```bash
npm install                 # (já feito)
npm run register            # cria os slash commands no teu servidor (instantâneo)
```
Corre isto outra vez sempre que mudares a lista de comandos.

### 4. Migrar a base de dados local + verificar o motor
```bash
npm run db:migrate:local    # cria as tabelas na D1 local
npm run selftest            # simula o ciclo todo (sem tocar no Discord)
```

> Bots de HTTP interactions não correm "localmente" como um long-poll: o Discord precisa de
> um URL público para te chamar. O `selftest` valida toda a lógica; o teste com o Discord real
> faz-se com o deploy (abaixo) — grátis e sem cartão.

---

## ☁️ Deploy à Cloudflare (sempre ligado, €0, sem cartão)

> O plano gratuito do Workers **não pede cartão** e **não cobra**: se passasses os limites
> (não vais — são ~100k pedidos/dia), ele simplesmente pára de servir, nunca fatura.

```bash
npx wrangler login                          # abre o browser para autenticar
npx wrangler d1 create futbol-db            # copia o "database_id" que aparece
```
1. Cola o `database_id` no `wrangler.toml`.
2. Migrar a base de dados de produção: `npm run db:migrate:remote`.
3. Variáveis (não-secretas) no `wrangler.toml [vars]`: `ADMIN_IDS`, `DISCORD_APPLICATION_ID`,
   `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID`.
4. Segredo (o token): `npx wrangler secret put DISCORD_BOT_TOKEN`.
5. Deploy: `npm run deploy` → copia o URL do Worker (`https://futbol-bot.<subdomínio>.workers.dev`).
6. No **Developer Portal → General Information → Interactions Endpoint URL**: cola esse URL e
   **Save**. O Discord envia um PING para validar; o bot responde sozinho. ✅

O cron (no `wrangler.toml`) trata dos avisos e prazos a cada minuto. Os comandos já foram
registados no passo 3 (se mudares a lista, corre `npm run register` de novo).

---

## 🧪 Testar o motor (sem Discord)

```bash
npm run selftest      # simula votação → vencedor → presenças → lista de espera → promoção → fecho → check-in → equipas → resultado
npm run typecheck     # verifica os tipos
```

### Testar o fluxo de equipas/resultado no Discord (canal de teste)

Para experimentar o `⚔️ Equipas` + `📊 Resultado` a sério sem precisar de 14 pessoas: define
`TEST_CHANNEL_ID` (o id de um canal `#bot-tester`) e corre **`/testjogo`** nesse canal — cria um
jogo já confirmado com jogadores falsos e abre o quadro das equipas. As estatísticas são **por
canal**, por isso isto nunca toca nos números do grupo. Sem `TEST_CHANNEL_ID` o comando fica
desativado.

---

## 📁 Estrutura

```
src/
  index.ts        Workers entry (interactions endpoint + cron)
  discord/        adapter Discord: verify (ed25519), rest (cliente), components,
                  commands, novojogo + teams (modais), interactions (router)
  core/           lógica pura (sem Discord/DB): votação, presenças, avisos, datas, stats
  db/             schema (Drizzle) + repo (único sítio com SQL)
  render/         construção do texto das mensagens (markdown)
  services/       games.ts (orquestração) + tick.ts (relógio) + stats.ts + teams.ts + testseed.ts
  messages.ts     TODAS as frases (pt-PT) — muda aqui o texto
migrations/       SQL aplicado ao D1 (local e remoto)
scripts/          selftest.ts · register-commands.ts
```

> **Ids:** começou em Telegram, por isso os campos chamam-se `tgUserId` / `chatId` / `*MsgId` —
> mas guardam **ids de Discord** (snowflakes de 64 bits), por isso são **strings** (colunas `TEXT`).

## 🗺️ A seguir (já pensado, sem reescrever o que está feito)

- ✅ **v2 — Estatísticas** automáticas: presenças, fiabilidade, sequências, fantasma 👻. *(feito — ver `docs/v2-plan.md`)*
- ✅ **v3 — Equipas + resultados** manuais: Team Alpha vs Beta + placar → V/E/D, % de vitórias e série de vitórias. *(feito)*
- **Golos/assistências individuais** — MVP do jogo, com fluxo próprio.
- **Repartir a conta** do campo (quem pagou / quem deve).
- **Embeds** mais bonitos para os quadros (já dá para fazer, é polimento visual).
- **Painel web** de estatísticas (Cloudflare Pages).
