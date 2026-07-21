# Features e referência

Especificação funcional do bot: o ciclo semanal, os comandos, os componentes interativos e cada
área de funcionalidade. Para o "como" interno ver [system-design.md](system-design.md).

## O ciclo semanal

1. **Votação** — abre por `/novojogo` (admin) ou pelo auto-jogo. O quadro lista os horários e o
   grupo carrega no(s) dia(s) em que pode (voto por aprovação). A abertura pinga o cargo Jogador.
2. **Dia escolhido** — a votação fecha assim que um horário junta o mínimo de votos (14, por
   omissão) e o bot anuncia o vencedor (ou abre um desempate se houver empate). Se nenhum
   horário lá chegar, a sondagem cancela-se ao fim de 7 dias e o auto-jogo abre uma nova.
3. **Presenças** — abrem as inscrições com os botões `Vou` / `Não vou` / `Talvez`.
4. **Lista + lista de espera** — os primeiros até ao máximo ficam confirmados; o resto fica em
   espera e sobe automaticamente quando alguém desiste.
5. **Avisos automáticos** — "jogo confirmado", "faltam X", ping a quem não respondeu, e fecho
   das inscrições antes do jogo.
6. **Check-in** — à hora de jogo abre o quadro "Cheguei". Quem aparece carrega; quem disse "Vou"
   e não carrega fica fantasma. Os suplentes também contam presença. A janela fecha sozinha e
   sai um recap (com botões para o admin corrigir falsos fantasmas).
7. **Equipas + resultado** — fechadas as inscrições, abre o quadro de Equipas. O admin monta
   Alpha vs Beta num painel privado e publica; depois insere o placar, que vira V/E/D.
8. **Estatísticas** — `/stats` mostra os rankings do grupo e `/eu` o cartão pessoal.

## Slash commands

Os comandos estão definidos em `src/discord/commands.ts` e registados por
`npm run register`. Os de admin levam `default_member_permissions = '0'`, o que os esconde do
picker para quem não é admin do servidor; o bot ainda valida `ADMIN_IDS` por cima disso.

| Comando | Acesso | O que faz |
|---|---|---|
| `/novojogo` | admin | Abre um modal para criar uma votação (horários, local, jogadores, fecho) |
| `/jogo` | todos | Repõe o jogo atual no fim do canal |
| `/fecharvotacao` | admin | Fecha já a votação |
| `/cancelar` | admin | Cancela o jogo atual |
| `/equipas` | admin | Painel privado para montar/editar Alpha e Beta |
| `/resultado` | admin | Modal para registar o placar |
| `/pagamentos` | admin | Publica o board de pagamentos e abre o painel de gestão |
| `/testjogo` | admin | Semeia jogo(s) de teste com jogadores falsos (só no canal de teste); opção `jogos` 1–12 |
| `/stats` | todos | Rankings do grupo; com a opção `jogador` mostra o cartão desse jogador |
| `/eu` | todos | O teu cartão de estatísticas (só tu vês) |
| `/topmarcadores` | todos | Melhores marcadores e assistentes |
| `/comparar` | todos | Compara dois jogadores lado a lado (opções `a` e `b`) |
| `/historico` | todos | Histórico de jogos, todos ou de um jogador (paginado) |
| `/meuid` | todos | Mostra o teu Discord user id |
| `/ajuda` | todos | Lista de comandos (varia para admin) |

### O modal do /novojogo

Quatro campos: **Horários** (uma opção por linha, formato `DD/MM HH:MM`, dois ou mais),
**Local** (opcional), **Jogadores** (mínimo-máximo, ex. `10-14`; default 14-14), e
**Fecho da votação** (opcional; default 7 dias após a abertura — fecha mais cedo se um horário
atingir o mínimo de votos).

## Componentes interativos

Os boards usam botões e selects cujo `custom_id` codifica a ação e o `gameId`. O encode/decode
está em `src/discord/components.ts` (`parseCb`).

| Padrão `custom_id` | Componente | Ação |
|---|---|---|
| `v:<game>:<slot>` | botão | Votar num horário |
| `r:<game>:<I\|O\|M>` | botão | Confirmar presença: IN / OUT / MAYBE |
| `tb:<game>:<slot>` | botão | Admin resolve o desempate |
| `ci:<game>` | botão | "Cheguei" (check-in) |
| `ug:<game>:<userId>` | botão | Admin limpa um falso fantasma no recap |
| `topen:<game>` | botão | Admin abre o painel de equipas a partir do placeholder |
| `tA:<game>` / `tB:<game>` | select | Admin escolhe quem fica em Alpha / Beta |
| `tlock:<game>` | botão | Admin publica as equipas |
| `tedit:<game>` | botão | Admin reabre o painel a partir do board público |
| `ropen:<game>` | botão | Admin abre o modal de resultado |
| `ggopen:<game>` | botão | Admin abre o painel de golos/assists |
| `ggG:<game>` / `ggA:<game>` | select | Admin marca golo / assistência (+1) |
| `gguG:<game>` / `gguA:<game>` | botão | Admin anula o último golo / assistência |
| `ggdone:<game>` | botão | Admin fecha o painel de captura num resumo |
| `pgmanage:<game>` | botão | Admin abre o painel de pagamentos |
| `pgtog:<game>` | select | Admin marca quem pagou (multi-select) |
| `pgprice:<game>` | botão | Admin abre o modal de preço por pessoa |
| `pgdone:<game>` | botão | Admin fecha o painel e atualiza o board |
| `hg:<page>` / `hp:<page>:<userId>` | botão | Paginação do `/historico` (global / por jogador) |

Modais (interação tipo 5): `novojogo`, `result:<game>` (golos A/B) e `pgpricem:<game>` (preço).

## Áreas de funcionalidade

### Votação por aprovação
Cada jogador pode votar em vários horários. O quadro re-renderiza a contagem a cada voto. A
sondagem fecha assim que um horário junta `min_players` votos (o fecho antecipado): ganha esse
slot; em caso de empate o jogo passa a `TIEBREAK` e o admin escolhe. Sem nenhum horário no
mínimo, a sondagem cancela-se no prazo (7 dias após a abertura, por omissão) e o auto-jogo
relança uma nova — incluindo depois de um `/cancelar` do admin, que também não trava o
relançamento. O `/fecharvotacao` do admin fecha já e apura o vencedor, independentemente das
contagens.

### RSVP e lista de espera
Os botões registam IN/OUT/MAYBE. O squad confirmado é os IN ordenados por hora de chegada
(`rank_at`) até ao máximo; o resto fica em lista de espera e sobe automaticamente quando um
confirmado desiste. A lógica está em `src/core/rsvp.ts`.

### Check-in e fantasmas
À hora de jogo abre o quadro "Cheguei". Quem carrega fica presente (`source = self`); um
confirmado que não carregue até ao fecho da janela fica fantasma. Os suplentes que apareçam
também ganham presença. No recap, cada fantasma tem um botão "X jogou" que o admin pode
carregar para corrigir um falso fantasma (`source = admin`).

### Equipas Alpha vs Beta
No painel privado (`/equipas`), o admin distribui o squad por dois selects (Alpha e Beta) e
publica. Só nessa altura os jogadores veem as equipas no board público. Quem fica de fora não
jogou. Dados em `result_teams`.

### Resultados
Pelo botão de resultado ou `/resultado`, o admin insere o placar (golos de Alpha e Beta). O
resultado vira V/E/D para os jogadores de cada equipa e alimenta os rankings de vitórias.

### Golos e assistências
Se a feature estiver ligada, ao registar o resultado abre um painel de captura: o admin escolhe
o marcador (e, se as assistências estiverem ligadas, o assistente) por select; cada escolha é
+1. Os botões "anular último" desfazem o último evento. Os dados ficam em `game_events` e
alimentam `/topmarcadores` e os boards de goleadores/assistências. Controlado pelas flags
`GOLOS_ENABLED` e `ASSISTS_ENABLED` (ver [configuration.md](configuration.md)).

### Pagamentos
Pelo `/pagamentos`, o admin publica um board público e abre um painel onde marca, por
multi-select, quem já pagou, e define o preço por pessoa. O board mostra quem pagou e quem
deve. Controlado pela flag `PAGAMENTOS_ENABLED`. Dados em `payments` e em
`games.price_per_person_cents`.

### Integração field.pt
O auto-jogo lê a disponibilidade do campo no field.pt e propõe os horários livres
automaticamente. Detalhe em [system-design.md](system-design.md).

### Estatísticas
`/stats`, `/eu`, `/comparar`, `/topmarcadores` e `/historico` mostram as métricas agregadas
(presenças, fiabilidade, sequências, fantasmas, early-birds, V/E/D, win rate, golos, assists) e
o Jogador do Mês. Definições e fórmula em [system-design.md](system-design.md).
