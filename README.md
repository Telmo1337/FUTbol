# ⚽ FUTbol — bot de Telegram para o futebol semanal

A Telegram bot that kills the weekly "qual é o dia? quem joga?" friction for a casual
football group. The admin opens a day-vote; everyone taps to vote and to confirm presence —
all inside the group chat. Waitlist, auto-promotion on dropouts, and automatic reminders
are handled for you. **European Portuguese (pt-PT)**, runs for **€0**.

## Como funciona (the weekly loop)

1. **🗳️ Votação** — o admin abre com `/novojogo` (2+ horários + local). Toda a gente carrega no(s) dia(s) em que pode.
2. **📅 Dia escolhido** — no fim do prazo, o bot fecha a votação e anuncia o vencedor.
3. **✅ Presenças** — o bot abre as inscrições: `✅ Vou / ❌ Não vou / 🤔 Talvez`.
4. **📋 Lista + lista de espera** — os primeiros até ao máximo ficam confirmados; o resto vai para a lista de espera e **sobe automaticamente** quando alguém desiste.
5. **🔔 Avisos automáticos** — "jogo confirmado", "faltam X", pings a quem não respondeu, e fecho das inscrições antes do jogo.
6. **🟢 Check-in (à hora do jogo)** — o bot abre um quadro `✅ Cheguei`. Quem aparece carrega; quem disse "Vou" e não carrega fica **fantasma 👻**. Os suplentes também podem carregar e contam presença. 5h depois fecha sozinho e sai um **resumo** (com botões para o admin corrigir falsos fantasmas).
7. **📊 Estatísticas** — `/stats` mostra os rankings (🏅 fiabilidade, 👟 presenças, 🔥 sequência, 👻 fantasma) e `/eu` mostra as tuas.

## Comandos

| Comando | O que faz |
|---|---|
| `/novojogo` | Abrir uma votação de dia *(só admin)* |
| `/jogo` | Ver / re-mostrar o jogo atual |
| `/fecharvotacao` | Fechar já a votação *(só admin)* |
| `/cancelar` | Cancelar o jogo atual *(só admin)* |
| `/stats` | Ranking de presenças e fiabilidade 📊 |
| `/eu` | As tuas estatísticas 📇 |
| `/euquem` | Ver o teu ID de Telegram |
| `/ajuda` | Ajuda |

### Formato do `/novojogo`

```
/novojogo
local: IPVC ESTG - campo 7x7
jogadores: 10-14
fecha: 13/06 21:00
dia: 14/06 20:00
dia: 18/06 21:00
dia: 20/06 18:00
```

`fecha` e `jogadores` são opcionais (default: 10-14, e a votação fecha 6h antes do horário mais cedo).

---

## 🛠️ Setup (primeira vez)

### 1. Criar o bot no @BotFather
1. Fala com [@BotFather](https://t.me/BotFather) → `/newbot` → escolhe nome e username → copia o **token**.
2. `/setprivacy` → escolhe o bot → **Disable** (para o bot ver os comandos no grupo).
3. `/setcommands` → escolhe o bot → cola:
   ```
   novojogo - Abrir votação de dia (admin)
   jogo - Ver o jogo atual
   fecharvotacao - Fechar já a votação (admin)
   cancelar - Cancelar o jogo atual (admin)
   stats - Ranking de presenças e fiabilidade
   eu - As minhas estatísticas
   euquem - Ver o meu ID de Telegram
   ajuda - Ajuda
   ```

### 2. Configurar segredos
```bash
cp .dev.vars.example .dev.vars
```
Edita `.dev.vars` e mete o teu `BOT_TOKEN`. Deixa `ADMIN_IDS` vazio por agora.

### 3. Correr localmente
```bash
npm install                 # (já feito)
npm run db:migrate:local    # cria as tabelas na base de dados local
npm run local               # arranca o bot (long polling)
```

### 4. Tornar-te admin
- Manda `/euquem` ao bot (em privado ou no grupo) → copia o teu ID.
- Mete-o no `.dev.vars`: `ADMIN_IDS=123456789`
- Pára o bot (Ctrl+C) e `npm run local` outra vez.

### 5. Adicionar ao grupo e testar
- Adiciona o bot ao grupo de Telegram do futebol.
- Faz `/novojogo` com datas daqui a uns minutos para veres o ciclo todo. Dica de teste:
  mete o `fecha` para daqui a 2 min e vê a votação fechar sozinha (o tick corre a cada 30s em local).

> O bot só está vivo enquanto `npm run local` estiver a correr. Para estar **sempre ligado** (mesmo com o PC desligado), faz o deploy à Cloudflare — passo abaixo.

---

## ☁️ Deploy à Cloudflare (sempre ligado, €0, sem cartão)

> O plano gratuito do Workers **não pede cartão** e **não cobra**: se passasses os limites (não vais — são ~100k pedidos/dia), ele simplesmente pára de servir, nunca fatura.

```bash
npx wrangler login                          # abre o browser para autenticar
npx wrangler d1 create futbol-db            # copia o "database_id" que aparece
```
1. Cola o `database_id` no `wrangler.toml` (campo `database_id`).
2. Migrar a base de dados de produção:
   ```bash
   npm run db:migrate:remote
   ```
3. Segredos e variáveis:
   ```bash
   npx wrangler secret put BOT_TOKEN        # cola o token
   npx wrangler secret put WEBHOOK_SECRET   # cola uma string aleatória (openssl rand -hex 32)
   ```
   No `wrangler.toml [vars]`: mete o teu `ADMIN_IDS = "123456789"` e o `BOT_INFO`
   (resultado de `curl https://api.telegram.org/bot<TOKEN>/getMe`, entre **plicas**:
   `BOT_INFO = '{"ok":true,"result":{...}}'`).
4. Deploy:
   ```bash
   npm run deploy
   ```
5. Apontar o Telegram ao Worker (substitui `<TOKEN>`, o URL do Worker e o `<SECRET>`):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://futbol-bot.<o-teu-subdominio>.workers.dev/&secret_token=<WEBHOOK_SECRET>"
   ```
   O cron (definido no `wrangler.toml`) trata dos avisos e prazos a cada minuto.

> ⚠️ Webhook e long polling não podem estar ativos ao mesmo tempo. Depois do `setWebhook`,
> não corras o `npm run local` com o mesmo token (ou apaga o webhook com `deleteWebhook`).

---

## 🧪 Testar o motor (sem Telegram)

```bash
npm run selftest
```
Simula o ciclo todo (votação → vencedor → presenças → lista de espera → promoção → fecho)
contra a base de dados local, com uma API de Telegram falsa. Útil depois de mexeres no código.

```bash
npm run typecheck     # verifica os tipos
```

---

## 📁 Estrutura

```
src/
  index.ts        Workers entry (webhook + cron)
  local.ts        Local entry (long polling + tick por timer)
  bot/            grammY wiring: comandos, callbacks, admin guard
  core/           lógica pura (sem grammY/DB): votação, presenças, avisos, datas
  db/             schema (Drizzle) + repo (único sítio com SQL)
  render/         construção das mensagens + teclados
  services/       games.ts (orquestração) + tick.ts (relógio)
  messages.ts     TODAS as frases (pt-PT) — muda aqui o texto
migrations/       SQL aplicado ao D1 (local e remoto)
scripts/selftest.ts
```

## 🗺️ A seguir (já pensado, sem reescrever o que está feito)

- ✅ **v2 — Estatísticas** automáticas: presenças, fiabilidade, sequências, "o mais fiável" 🏅, fantasma 👻. *(feito — ver `docs/v2-plan.md`)*
- **v3 — Vitórias/derrotas + MVP** com um toque depois do jogo.
- **Repartir a conta** do campo (quem pagou / quem deve).
- **Painel web** de estatísticas (Cloudflare Pages + Telegram Mini App, abre dentro do Telegram, sem login).
