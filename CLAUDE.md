# Bubble App

Plataforma de conteúdo de **um criador só**: feed (texto/foto/vídeo/áudio), cursos,
conteúdo liberado por assinatura, e um admin web. Web + iOS + Android.

Stack: Takeout Free v2-beta (Tamagui 2.0-rc) · One (rotas por arquivo, `app/api/*+api.ts`)
· React Query · Better Auth · Drizzle + Postgres · Bun.

## Documentação

`docs/build-log/` — leia **`STATE.md` primeiro**: ambiente, decisões acumuladas e
pendências. `INDEX.md` mapeia as 10 fases; `handoffs/NN-*.md` conta o que cada uma
entregou e por quê. Este arquivo é só o essencial que se repete; o detalhe está lá.

`deploy/` — produção. `fly-app.toml` (referência), `aws/` (banco, app e proxy). Topologia e as
armadilhas de deploy estão em **`STATE.md` → Produção**.

## Ambiente

O projeto vive em `F:\apps\bubble-app\mobile-bubble-app` e **roda da WSL**
(`/mnt/f/apps/bubble-app/mobile-bubble-app`). Portas: app **8081**, Postgres **5533**.

```bash
bun backend    # docker: pgdb + migrate
bun dev        # app em :8081
```

🔴 **File watching NÃO funciona** (o projeto está em `/mnt/f`, disco Windows). Toda
edição exige reiniciar o `bun dev`. Sem isso o servidor continua servindo o módulo antigo
e você depura um fantasma.

### Reiniciar o dev server — três armadilhas que já custaram horas

1. **`pkill -f "one dev"` não mata nada.** O processo se chama `Onejs:dev`. O pkill
   falha, o novo `bun dev` morre com a porta ocupada, e **o servidor antigo continua
   servindo**. Use `pkill -f "Onejs:dev"` e confira com `ss -ltn | grep 8081`.
2. **`export PATH=$HOME/.bun/bin:$PATH` quebra**: o PATH do Windows entra na WSL com
   espaços e o export sem aspas vira erro de sintaxe. Use o caminho completo
   (`/home/mateus/.bun/bin/bun`) ou `PATH="..." bun ...` numa linha só.
3. **`setsid nohup ... &` não segura o servidor**: se nenhum outro processo mantiver a
   distro WSL viva, ela encerra junto. Rode em tarefa de background que fique viva.

**Diagnóstico de módulo velho:** o mesmo arquivo pedido com query volta novo e sem query
volta antigo → é servidor zumbi.

```bash
curl -s "http://localhost:8081/src/features/app/AppNav.tsx" | grep -c AppBottomBar
```

### Comandos

| | |
|---|---|
| `bun check types` | typecheck. **`bun check` sozinho não roda nada** |
| `bun test:unit` | 92 testes |
| `bun run:dev scripts/x.ts` | script com env. **Sem um segundo `bun`** — `bun run:dev` já embute |
| `bun env:update` | propaga o bloco `env` do package.json |
| ~~`bun check lint`~~ | **quebrado**: `panic: unknown rule` (versão do oxlint-tsgolint no starter) |

Contas: `demo@takeout.tamagui.dev` / `demopassword123` (é o criador, `role = admin`) e
`teste@bubble.local` / `teste123456`.

## Invariantes — quebrar qualquer uma vira bug silencioso

1. **`payment` é tabela privada** (`schema-private.ts`). Só o servidor a lê — nenhuma
   rota devolve pagamento para o cliente.
2. **FKs de conteúdo apontam para `userPublic`**, não para `user`. Conta sem `userPublic`
   não recebe assinatura — o hook `afterCreateUser` cria a linha.
3. **O gate de assinatura é decidido no servidor**, nunca por claim de JWT: o token dura
   3 anos. `src/server/access/contentAccess.ts` é o único lugar que decide, e
   `loadViewer` relê `user.role` do Postgres a cada requisição.
4. **Cor da marca é token** (`$accent*`, `$accentBackground`/`$accentColor`). Hex dentro
   de componente é bug — ver `src/tamagui/brandAccent.ts`.
5. **Bytes de mídia não passam pelo servidor do app**: PUT direto no R2 com URL assinada,
   leitura por 302. A tela nunca monta URL de R2.
6. **Uma variável de ambiente mora em UM arquivo só.** Os três carregadores (bun, vxrn,
   dotenvx) discordam da ordem, então chave repetida resolve diferente conforme o
   comando. Mapa completo em `.env.local.example`.
7. **Na web, layout usa `<Slot/>`** — nunca `Stack`/`Tabs` do react-navigation, que
   resetam a rota no carregamento direto de URL.
8. **Guard de rota nunca devolve `null`.** Desmontar a árvore faz o roteador
   reinicializar na primeira rota do grupo em ordem alfabética (hoje `/admin`). Pelo
   mesmo motivo, **nada de `key={userId}` no `QueryClientProvider`** — a separação por
   usuário vai na query key (`src/data/client/keys.ts`), não na árvore. Ver
   `app/(app)/_layout.tsx`.
9. **Campo de senha usa `type`, nunca `secureTextEntry`.** O `Input` **web** do Tamagui
   descarta `secureTextEntry` — a fonte dele lista a prop sob *"Native-only props
   (ignored on web)"*. O sintoma é senha digitada **em texto puro**, sem erro e sem
   typecheck reclamando. O nativo faz o inverso e deriva o mascaramento de `type`
   (`Input.native.tsx`, "Convert web type to native props"). Já quebrou uma vez.
10. 🔴 **Spinner só com `isPending`, nunca com `isFetching`.** É a linha que separa
   "instantâneo" de "pisca a cada volta": revalidação em segundo plano não pode aparecer
   na tela quando já existe dado em cache. Detalhe em `src/data/client/hooks.ts`.
11. 🔴 **Timestamp do banco chega como string sem fuso, e é UTC.** `src/database/pgTypes.ts`
   desliga o parser do `pg` de propósito: sem isso o driver interpreta como hora **local**
   do processo, e numa máquina fora do UTC todo `createdAt` volta deslocado — em produção
   (UTC) o defeito some por acaso. Converter é `toEpoch`, e o contrato com a tela é
   **epoch em milissegundos**.
12. **Endpoint gasta número constante de queries.** Busca os pais, `inArray` para cada
   coleção filha, costura com `Map` em JS. Query dentro de laço é regressão — foi o N+1
   do sync que a migração veio resolver. Confira com `DB_LOG=1`.

## Verificação

**Caminho de navegador só se prova no navegador.** Duas vezes nesta base um teste por
Node passou enquanto o app estava quebrado: o upload pro R2 (era CORS) e o cadastro. Se a
mudança envolve o navegador, abra o navegador.

Ao terminar uma fase: **comitar a versão funcionando**, com uma seção "Conhecido e NÃO
resolvido" na mensagem. Bug escrito é dívida; bug não escrito é armadilha.

## Idioma

Interface e comentários em **português**. O que veio do Takeout ainda está em inglês em
alguns cantos; ao mexer num arquivo, traduza o que tocar. Não há i18n — decisão em aberto
registrada no `STATE.md`.
