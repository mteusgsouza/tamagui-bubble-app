# Fase 10 — Auth (cadastro pela UI + Google OAuth)

## Objetivo

Fechar o buraco que a fase apontava: **não existia cadastro pela UI**, e não existia
login social. Sem isso o app tem exatamente as contas que alguém criar à mão no banco.

## Feito

| Arquivo | O que é |
|---|---|
| [`passwordSignup.ts`](../../../src/features/auth/client/passwordSignup.ts) | `signUp.email` + tradução dos erros; `MIN_PASSWORD_LENGTH` |
| [`passwordLogin.ts`](../../../src/features/auth/client/passwordLogin.ts) | exporta `PasswordResult`, mensagens em português |
| [`auth/login.tsx`](../../../app/(app)/auth/login.tsx) | **dois caminhos**: "Entrar com e-mail" e "Criar conta"; botão do Google ligado de verdade |
| [`auth/signup/[method].tsx`](../../../app/(app)/auth/signup/%5Bmethod%5D.tsx) | coleta o e-mail e carrega o `intent` |
| [`auth/login/password.tsx`](../../../app/(app)/auth/login/password.tsx) | serve às duas intenções; no cadastro pede **nome** e confere o tamanho da senha |
| [`authServer.ts`](../../../src/features/auth/server/authServer.ts) | `socialProviders.google` condicional + `EXTRA_TRUSTED_ORIGINS` |

`package.json`, `env-server.ts` e `ci.yml` ganharam `EXTRA_TRUSTED_ORIGINS`,
`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` (via `bun env:update`).

## Decisões

**1. Entrar e criar conta são botões separados.** Não é preferência de layout. A tela
antiga tinha um botão só que sempre terminava em `signIn.email` — e-mail novo dava
`INVALID_EMAIL_OR_PASSWORD`. Trocar simplesmente por `signUp` traria o problema inverso:
**e-mail digitado errado viraria conta nova** em vez de "senha incorreta". O `intent`
(`login` | `signup`) sai da escolha do usuário e atravessa as duas telas seguintes.

**2. O app não pergunta ao servidor se a conta existe.** Seria a UX mais bonita — um
campo de e-mail que decide sozinho para onde ir — e entregaria a lista de e-mails
cadastrados a quem testasse um por um.

**3. Google só é registrado quando as duas credenciais existem.** Registrar o provider
sem `clientId` faz o Better Auth responder 500 no `/sign-in/social`: **botão que existe e
quebra é pior que botão que avisa**. Com `socialProviders: {}`, o cliente recebe erro e a
tela mostra "ainda não configurado". Quem decide é o servidor — nada de flag duplicada no
cliente que possa discordar dele.

**4. Origem confiável extra por env, não string fixa.** `EXTRA_TRUSTED_ORIGINS` (separada
por vírgula) entra em `trustedOrigins`. É isto que faz o app abrir no **celular físico**:
pelo IP de rede, todo POST de auth voltava 403 `INVALID_ORIGIN`, e o IP da WSL muda a cada
reinício.

**5. Textos novos em português.** As telas de auth eram as últimas em inglês no caminho
principal. A decisão de i18n continua aberta (ver STATE), mas manter metade da tela em
inglês enquanto se reescreve a outra metade não ajudaria ninguém.

## Verificado

`bun check types` limpo · `bun test:unit` 92 testes.

Cadastro exercido contra o servidor de dev, com conta nova (`novo.teste@bubble.local`),
apagada no fim:

| Caso | Resultado |
|---|---|
| `POST /api/auth/sign-up/email` com e-mail novo | **200** |
| linhas criadas | `user` · `userPublic` · `userState` · `account` — **as 4** |
| login com senha errada | 401 |
| login com senha certa | 200 |
| cadastro com e-mail repetido **+ senha certa** | 200 (o servidor cai para sign-in) |
| cadastro com e-mail repetido **+ senha errada** | 401 |
| senha de 4 caracteres | 400 `PASSWORD_TOO_SHORT` |

Os três últimos casos são exatamente o que `passwordSignup.ts` traduz — as mensagens
foram escritas contra esse comportamento medido, não suposto.

**O elo com a Fase 9 foi fechado:** a conta criada por esse caminho recebeu assinatura
pelo `/api/admin/people` (`200`, `reused: false`). Era o risco que o plano apontava — a
FK de `subscription` aponta para `userPublic`, e conta sem perfil público nunca
conseguiria assinar. O hook `afterCreateUser` cria a linha, e ele está em
`databaseHooks.user.create.after`, ou seja, **vale também para o OAuth**.

### ⚠️ O que NÃO deu para verificar aqui, e por quê

**A navegação clicando pelas telas.** O navegador de automação desta sessão roda com a
aba `document.hidden === true`, e aí `requestAnimationFrame` **não dispara**. O Tamagui
usa **duplo rAF** para tirar o `enterStyle` (`createComponent.tsx`, "Animation enter
state machine"), então todo componente com `enterStyle` — que na tela de login são todos
os botões — fica parado em `opacity: 0` com a classe `t_unmounted`.

**Isso é artefato do ambiente, não bug do app.** Se você for testar por ferramenta
automatizada e vir a tela de login "vazia", confira `document.hidden` antes de caçar
fantasma. Some-se a isso o bug de deep link (STATE): carregar
`/auth/signup/email?intent=signup` direto cai em `/admin`.

**Consequência prática: o fluxo de cadastro precisa ser clicado por um humano**, no
navegador de verdade. O roteiro está abaixo.

## Não feito

- **Google OAuth não foi exercido de verdade** — falta o pré-requisito humano
  (credenciais). O código está escrito e inerte: sem `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET`, o provider não é registrado e o botão avisa.
- **Apple Sign-In** continua só com aviso. Exige conta de desenvolvedor Apple, e a Apple
  passa a exigi-lo na App Store quando existir outro login social.
- **Sem recuperação de senha.** Quem esquecer a senha não tem saída pela UI. O
  `magicLink` já está ligado no `authServer` — é o caminho mais curto.
- **Sem verificação de e-mail.** `emailVerified` nasce `false` e ninguém olha.
- **`APP_NAME` ainda é `'Takeout'`**, então a tela diz "Entrar no Takeout". Trocar é uma
  linha em `src/constants/app.ts`; **não mexa em `DOMAIN`** junto: `DEMO_EMAIL` deriva
  dele e a conta demo do banco é `demo@takeout.tamagui.dev`.

## Como ligar o Google (pré-requisito humano)

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID**,
   tipo **Web application**.
2. Authorized redirect URI: `http://localhost:8081/api/auth/callback/google` (e a de
   produção, com o domínio real).
3. Pôr as duas chaves no `.env.local` (que é gitignored **e** lido pelo `bun dev`):

   ```
   GOOGLE_CLIENT_ID="..."
   GOOGLE_CLIENT_SECRET="..."
   ```

4. Reiniciar o `bun dev`. O botão do Google passa a funcionar sem mais nenhuma mudança
   de código.

## Roteiro para o usuário validar

Com `bun backend` e `bun dev` no ar, em `http://localhost:8081` (**não** pelo IP):

1. Sair da conta atual e abrir `/auth/login` → devem aparecer **dois** botões:
   "Entrar com e-mail" e "Criar conta".
2. **Criar conta** → digitar um e-mail novo → a tela seguinte pede **nome e senha** e o
   botão diz "Criar conta". Senha com menos de 8 caracteres mostra quantos faltam e o
   botão fica desabilitado.
3. Concluir → deve cair no feed já logado.
4. Conferir no banco que nasceram as 4 linhas:

   ```bash
   docker compose exec pgdb psql -U user -d postgres -c "select u.email, up.name from \"user\" u join \"userPublic\" up on up.id = u.id order by u.\"createdAt\" desc limit 3"
   ```

5. **Entrar com e-mail**, com o mesmo e-mail e senha errada → a mensagem deve falar em
   "E-mail ou senha incorretos", não em criar conta.
6. Comentar num post com a conta nova — é o que prova, pela UI, que a `userPublic`
   existe.

Para testar no **celular físico**: pegar o IP que o `bun dev` imprime como "Network",
pôr em `.env.local` como
`EXTRA_TRUSTED_ORIGINS="http://<ip>:8081"` e reiniciar o dev. Sem isso, todo login volta
403 `INVALID_ORIGIN`.
