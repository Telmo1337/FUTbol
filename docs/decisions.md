# Decisões de arquitetura

Registo curto das escolhas estruturais do projeto, em formato ADR (Architecture Decision
Record): contexto, decisão e consequências. Servem para perceber porque é que o sistema é como
é, não só como é.

## ADR-1 — Cloudflare Workers + HTTP interactions

**Contexto.** Um grupo casual de futebol, sem orçamento e sem apetência por gerir
infraestrutura. Um bot de Discord pode receber eventos por gateway (uma ligação WebSocket
sempre aberta) ou por HTTP interactions (webhook).

**Decisão.** Correr num Cloudflare Worker e receber tudo por HTTP interactions.

**Consequências.** Não há servidor sempre-a-correr nem custo fixo; o plano gratuito chega de
sobra. Em troca, o bot só "acorda" a pedido, por isso o trabalho periódico tem de vir de um
Cron Trigger (ver ADR-3) e o estado não pode viver em memória (ver ADR-2). O Discord precisa de
um URL público, logo não há um modo "local" verdadeiro — daí o `selftest`.

## ADR-2 — D1 + Drizzle, com repository como único sítio com SQL

**Contexto.** O estado tem de sobreviver entre invocações sem servidor.

**Decisão.** Guardar tudo em Cloudflare D1 (SQLite), com Drizzle ORM para tipos, e concentrar
todas as queries em `src/db/repo.ts`.

**Consequências.** O acesso a dados fica num único módulo, fácil de auditar e de trocar; a
lógica de domínio (`src/core/`) nunca toca em SQL e é testável sem I/O. O squad confirmado é
derivado das linhas de RSVP em vez de materializado, o que evita corridas pelo último lugar.
Os ids de Discord são guardados como TEXT por causa da precisão numérica do JavaScript.

## ADR-3 — State machine movida por um cron de 1 minuto

**Contexto.** Há trabalho que depende do tempo (fechar votações, mandar avisos, abrir o
check-in) e o Worker não corre sozinho.

**Decisão.** Um Cron Trigger corre `runTick()` a cada minuto; o tick lê `now`, compara com os
deadlines guardados e avança as transições.

**Consequências.** Toda a lógica temporal está num sítio e é idempotente — as transições
dependem do estado e os avisos têm flags exactly-once, por isso repetir o tick não duplica nada.
A granularidade é de um minuto, o que é mais do que suficiente para este domínio.

## ADR-4 — Migração de Telegram para Discord

**Contexto.** O bot começou em Telegram; o grupo passou a usar Discord.

**Decisão.** Migrar para Discord mantendo o domínio e o esquema, sem renomear os campos de id.

**Consequências.** Os campos ainda se chamam `tgUserId`, `chatId` e `*MsgId`, mas guardam ids de
Discord. A documentação e os comentários no código explicam-no para não confundir quem chega
agora. A camada de adapter (`src/discord/`) isola o que é específico do Discord.

## ADR-5 — Auto-jogo event-driven em vez de horário fixo

**Contexto.** A sondagem do jogo seguinte abria num horário fixo. Isso desperdiçava
antecedência: se um jogo acabava cedo, o grupo só era consultado dias depois.

**Decisão.** Abrir a sondagem assim que não há jogo ativo no canal — logo que o anterior foi
jogado ou cancelado — com guardas de horário diurno (`09:00`–`23:00`), cooldown de 12h e dedup.

**Consequências.** O grupo recebe o máximo de antecedência sem pings de madrugada. Reutiliza o
`createGame` e o carregamento de slots já existentes; a única lógica nova é a guarda de quando
abrir (`maybeOpenNextGame`) e uma query do último jogo aberto.

## ADR-6 — Pingar o cargo Jogador em vez de `@everyone`

**Contexto.** A abertura da sondagem deve notificar o grupo. Mencionar todos exigia a permissão
MENTION_EVERYONE no bot, que ficava facilmente desativada.

**Decisão.** Mencionar um cargo dedicado (Jogador) na forma `<@&ROLE_ID>`, com o
`allowed_mentions` a incluir `roles`. O cargo é marcado como mencionável por todos no Discord.

**Consequências.** O grupo é notificado sem o bot precisar de MENTION_EVERYONE. O `@everyone`
fica apenas como fallback, ativo só se o id do cargo for removido da config. Quem recebe o ping
é quem tem o cargo, gerido no Discord sem mexer no código.

## ADR-7 — Ler a disponibilidade do field.pt do Firestore público

**Contexto.** O campo é reservado pelo getfield.app, uma app Firebase cujo Firestore tem regras
de leitura pública.

**Decisão.** Ler a disponibilidade diretamente do Firestore com a web API key pública, sem
login, e calcular os slots livres localmente (`src/core/availability.ts`).

**Consequências.** O auto-jogo propõe horários reais sem integração privada nem credenciais
secretas. A `FIELD_API_KEY` está no código com um comentário a clarificar que é pública por
design; o gitleaks tem-na em allowlist. O risco é a app de terceiros mudar o formato — mitigado
por o parsing e o cálculo serem puros e cobertos pelo `selftest`.

## ADR-8 — Feature flags para golos/assists e pagamentos

**Contexto.** Funcionalidades novas (golos/assistências, pagamentos) precisavam de ser
ativadas/desativadas em produção sem redeploy de código e sem perder dados.

**Decisão.** Gates por variável de ambiente (`GOLOS_ENABLED`, `ASSISTS_ENABLED`,
`PAGAMENTOS_ENABLED`), ligados por omissão e desligáveis com `false`/`0`/`off`/`no`.

**Consequências.** Esconder uma feature é mudar uma var, não o código; os dados já gravados
sobrevivem e reaparecem quando se religa. As assistências são uma sub-flag dos golos (e são
conjugadas com elas no ponto de uso), porque um golo é objetivo e uma assistência é uma decisão
manual subjetiva.
