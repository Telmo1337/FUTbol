# Modelo de segurança

O bot é exposto à internet por um webhook (o Interactions Endpoint do Discord) e lê uma API
externa pública (field.pt). Esta página descreve os controlos que mantêm isso seguro.

## Verificação das interactions (Ed25519)

Todo o pedido que chega ao Worker é assinado pelo Discord com Ed25519. Antes de qualquer
processamento, `src/index.ts` chama `verifyInteraction` (`src/discord/verify.ts`), que:

1. Exige os headers `X-Signature-Ed25519` e `X-Signature-Timestamp`; sem eles, rejeita.
2. Verifica a assinatura sobre a mensagem `timestamp + body` (o corpo tem de ser o texto em
   bruto, não o JSON re-serializado), usando a `DISCORD_PUBLIC_KEY` e a Web Crypto API nativa
   do runtime (sem dependências).
3. Um pedido que não verifique recebe `401`.

Sem assinatura válida, nada é executado — não há caminho que contorne esta verificação.

## Replay protection

A assinatura já cobre o timestamp, por isso este não pode ser forjado. Mas um pedido
genuíno-mas-antigo podia ser reenviado (replay). Para travar isso, `verify.ts` rejeita pedidos
cujo timestamp esteja fora de uma janela de ±5 minutos (`SIGNATURE_MAX_AGE_MS`), folga
suficiente para o desvio de relógio normal entre o bot e o Discord.

## Gestão de secrets

- Os valores secretos (`DISCORD_BOT_TOKEN` e afins) são definidos com `wrangler secret put` e
  nunca entram no repositório.
- O `.dev.vars` (desenvolvimento local) está no `.gitignore`; o repositório só tem o
  `.dev.vars.example` com os nomes das variáveis, sem valores.
- Alguns valores que parecem secretos são públicos por design: a `FIELD_API_KEY` é uma Firebase
  web API key cujo único poder é ler um Firestore com regras de leitura pública. Está em
  `src/config.ts` propositadamente, com um comentário a explicá-lo. A `DISCORD_PUBLIC_KEY`
  também é pública (serve para verificar, não para assinar).

## Escaping de input do utilizador

Nomes e locais escritos por utilizadores passam por `esc()` (`src/util.ts`) antes de entrarem
numa mensagem: faz backslash-escape dos caracteres de markdown inline — incluindo `[ ] ( )`,
para que um nickname não consiga formar um link mascarado (`[texto](url)`) num embed público —
e neutraliza `@` e `<` com um zero-width space, para que um nome como `@everyone` ou `<@123>`
nunca se torne uma menção real. Os ids que chegam em `custom_id` de botões (por exemplo o do
"X jogou") são validados como dígitos antes de serem usados num mention.

## Autorização de admin

Os comandos de admin levam `default_member_permissions = '0'`, o que os esconde do picker de
comandos para quem não é admin do servidor. Por cima disso, o bot valida o autor contra o
conjunto de `ADMIN_IDS` (`parseAdminIds` em `src/util.ts`), por isso a autorização não depende
apenas da UI do Discord.

## Menções controladas

Cada mensagem define o seu `allowed_mentions` (`src/discord/rest.ts`); o default é só `users`.
A única mensagem que menciona o grupo é a abertura de uma sondagem, que pinga o cargo Jogador
na forma `<@&ROLE_ID>` com `allowed_mentions` a incluir `roles`. Isto evita depender da
permissão MENTION_EVERYONE do bot (que era fácil de ficar desligada); o fallback `` `@everyone` ``
só entra se `GROUP_ROLE_ID` estiver vazio. O cargo tem de estar marcado como mencionável por
todos no Discord.

Nota de higiene, fora do código: ao escrever documentação ou mensagens de commit, nunca usar
`@nome` em texto plano — no GitHub e no Discord isso cria uma menção real. A sintaxe de menção
neste repositório aparece sempre dentro de code spans.

## Rate limiting

O cliente REST (`src/discord/rest.ts`) trata o `429` da Discord API: lê o `retry-after`, espera
e tenta de novo uma vez. Os erros de envio são registados e propagados para não passarem
despercebidos.

## Secret scanning (gitleaks)

Para impedir que um segredo real (sobretudo o `DISCORD_BOT_TOKEN`) seja commitado por engano, o
repositório corre o [gitleaks](https://github.com/gitleaks/gitleaks):

- **Configuração** — `.gitleaks.toml` na raiz estende as regras default e tem uma allowlist dos
  valores que são públicos por design, para não gerar falsos positivos: a `FIELD_API_KEY` e o
  ficheiro `.dev.vars.example`.
- **CI** — o workflow `.github/workflows/ci.yml` tem um job `gitleaks` que corre em cada push e
  pull request, a par do typecheck e do selftest.
- **Local** — antes de commitar, `gitleaks protect --staged`; para varrer o repositório todo,
  `gitleaks detect --source .`. Instruções de instalação em [development.md](development.md).

A `DISCORD_PUBLIC_KEY`, por ser pública, não precisa de allowlist (não tem o formato de um
segredo); os segredos reais vivem só em `wrangler secret put` e nunca no repositório.

## Superfície e limites

O bot não tem login de utilizador nem sessões: a única autenticação de entrada é a assinatura do
Discord. A persistência é uma base de dados D1 privada do Worker. A leitura do field.pt é só
leitura, anónima, a um Firestore público. As stats são por canal, por isso o canal de teste
(`TEST_CHANNEL_ID`) nunca contamina os números do grupo real.
