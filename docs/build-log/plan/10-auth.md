# Fase 10 — Auth (cadastro pela UI + Google OAuth)

**Status:** ⬜ pendente · **Pré-requisito humano:** ⚠️ **credenciais OAuth do Google Cloud**

> Fase **acrescentada durante a execução**. O plano original não previa nada de
> autenticação — assumiu que o que vinha do Takeout bastava. Não basta.

## O buraco

O Takeout Free entrega login por e-mail/senha **e nada mais**:

- **Não existe cadastro pela UI.** `authClient.signUp.email` só é chamado pelo botão de
  demo (`src/features/auth/client/signInAsDemo.ts`). A rota `/auth/signup/email` coleta
  o e-mail e manda para a tela de senha, que chama `passwordLogin` → `signIn.email`.
  Com e-mail novo dá `INVALID_EMAIL_OR_PASSWORD`.
- **Não existe login social.** `src/features/auth/server/authServer.ts` configura
  `emailAndPassword`, `magicLink`, `admin`, `bearer` e `jwt`. Sem `socialProviders`.
- O servidor **já sabe** cadastrar: `src/features/auth/server/apiHandler.ts` intercepta
  `/api/auth/sign-up/email`, e no 422 (e-mail existente) cai sozinho para sign-in.
  Falta o cliente chamar.

## Escopo

1. **Separar login de cadastro.** Hoje as duas rotas caem na mesma tela de senha, e é
   por isso que não dá para simplesmente trocar `signIn` por `signUp` — e-mail digitado
   errado viraria conta nova em vez de "senha incorreta". Telas distintas, com o
   `method` decidindo qual chamada fazer.
2. **Google OAuth.** `socialProviders.google` no `authServer`, `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` no bloco `env` do `package.json`, botão na tela de login
   (o ícone já existe: `src/interface/icons/GoogleIcon.tsx`).
3. ~~Criar `userPublic` e `userState` no cadastro.~~ **Já resolvido:**
   `src/features/auth/server/afterCreateUser.ts` roda no hook
   `databaseHooks.user.create.after` e cria as duas linhas. Vale só conferir que o
   caminho do OAuth passa pelo mesmo hook.
4. Apple Sign-In se for publicar na App Store (a Apple exige quando há outro login
   social).

## Origens confiáveis (dev)

`trustedOrigins` (`authServer.ts:29`) tem só `localhost:8081`,
`host.docker.internal:8081`, o domínio de produção e o `APP_SCHEME`. Abrir o app pelo
**IP de rede** da WSL (ex.: `http://172.25.143.221:8081`, que o `bun dev` imprime como
"Network") faz todo login voltar **403 `INVALID_ORIGIN`**.

No navegador do desktop, basta usar `localhost`. Para testar em **celular físico** —
que é como o usuário valida — o IP tem que entrar na lista, e ele muda a cada reinício
da WSL. Resolver com env var, não com string fixa.

## [Fase 9] O que mudou desde que este plano foi escrito

- **Conta nova precisa de `userPublic` para poder assinar.** `grantSubscription`
  (`src/features/billing/server/subscriptionActions.ts`) devolve `no-public-profile` e
  **recusa** quando a linha não existe — a FK de `subscription` aponta para `userPublic`,
  não para `user`. O item 3 acima diz que o hook `afterCreateUser` já cria as duas
  linhas; **confirme que o caminho do OAuth passa por ele**, senão conta criada por
  Google nunca consegue assinar, e o erro só aparece na hora de pagar.
- **O criador (`demo-user-id`) agora é `role = 'admin'`.** Usuário novo continua nascendo
  `role = 'user'`, que é o certo.
- **`.env.development` ganhou `BILLING_WEBHOOK_SECRET` e `CRON_SECRET`** (valores de
  desenvolvimento). Se você mexer no bloco `env` do `package.json`, rode
  `bun env:update` para propagar em `src/server/env-server.ts` e no `ci.yml`.
- **A verificação abaixo ganhou um passo:** uma conta criada pela UI tem que conseguir
  **receber assinatura** pelo `/admin/people`. Se der `no-public-profile`, o cadastro
  ficou incompleto.

## Verificação

Cadastro por e-mail cria as 4 linhas (`user`, `account`, `userPublic`, `userState`).
Login com Google idem. Uma conta criada por qualquer um dos dois caminhos consegue
comentar num post — é o que prova que a `userPublic` foi criada.
