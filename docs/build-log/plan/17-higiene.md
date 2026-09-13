# Fase 17 — Higiene e observabilidade

**Status:** ⬜ pendente · **Pré-requisito humano:** — · **Depende de:** nada

## Objetivo

As pendências que não são feature e que ficam mais caras quanto mais tarde. Nenhuma
precisa de fase inteira; juntas precisam de uma.

⚠️ **A primeira delas provavelmente está vermelha agora.**

### 1. CI — está falhando em todo push

`.github/workflows/ci.yml` roda `bun check:all` → `scripts/check/lint.ts`, e
`.oxlintrc.json:64` liga `typescript/no-unnecessary-type-conversion`, regra que o
`oxlint-tsgolint` instalado não conhece (`panic: unknown rule`). Não é o código do app: é
descasamento de versão vindo do starter.

Duas saídas — **subir o `oxlint-tsgolint` é a certa**; apagar a linha do `.oxlintrc.json`
é a que desliga uma verificação para calar um erro de versão. Se a subida não resolver,
apague a linha **com comentário dizendo por quê**, senão alguém religa em seis meses.

Efeito colateral que confunde: com o lint quebrado, `bun zero:generate` **sai com código 1
mesmo tendo gerado tudo** (o `--after 'bun lint:fix'` é que falha). Parece falha de
geração e não é.

O job `integration` também precisa dos secrets do R2 no repositório, ou ele falha por
configuração e ninguém olha mais para a CI — CI vermelha crônica é o mesmo que não ter CI.

### 2. Observabilidade — hoje erro em produção é invisível

`analyticsActions.ts` é `console.log` só em dev. `_middleware.ts` intercepta resposta ≥ 400
e **loga apenas em desenvolvimento**. Em produção, erro de usuário não deixa rastro.

O middleware já é o ponto de entrada certo — falta um destino. Sentry (ou equivalente) no
servidor **e** no cliente, com a release marcada por `APP_VERSION` de
`src/constants/app.ts` — sem isso não se sabe qual build quebrou, que é metade da utilidade.

⚠️ **Não mande PII para o rastreador.** E-mail de usuário em breadcrumb é vazamento por
descuido, e a política de privacidade da Fase 15 passa a mentir.

Substitua o stub de `analyticsActions` ou apague-o. Função que finge medir é pior que
ausência: quem lê o código acha que existe métrica.

### 3. Órfãos e mentiras no repo

| | |
|---|---|
| `app/(app)/home/(tabs)/settings/blocked-users.tsx` | rota órfã, em inglês, do Takeout. Se a Fase 16 não a adotou, **apague** |
| `analyticsActions.ts` | ver item 2 |
| `package.json` → `"my-bubble-app"` | resto da Fase 1, nunca executada |
| `DOMAIN = 'takeout.tamagui.dev'` (`src/constants/app.ts`) | 🔴 **não troque sozinho**: `DEMO_EMAIL` deriva dele e a conta demo do banco é `demo@takeout.tamagui.dev`. Trocar quebra o login de demonstração — é mudança de duas pontas |
| `TWITTER_URL` / `GITHUB_URL` apontam para a Tamagui | aparecem em Ajustes |
| `(p: any)` em `app/(app)/admin/index.tsx` | tipar a partir dos models, não aumentar a conta |

### 4. `exists` dentro de `exists` nunca foi exercido

`canAccessLesson` e `canAccessComment` aninham `exists`, e isso **nunca rodou em runtime**
(pendência aberta desde a Fase 4). Se o zero-cache reclamar, o plano B é desnormalizar
`feedOwnerId`/`visibility` na `lesson`. Prove lendo a CVR com uma aula de curso pago; é uma
tarde de trabalho se falhar, e uma surpresa em produção se ninguém olhar.

### 5. Idioma — decidir, não adiar

Metade da UI é português literal, o que veio do Takeout é inglês. **Cada fase de UI encarece
essa decisão** e as Fases 12–16 são de UI. Duas opções honestas: assumir pt-BR e traduzir
o que restou (mais barato, e é o que o `CLAUDE.md` já manda ao tocar um arquivo), ou adotar
i18n de verdade porque existe intenção de vender fora.

Escolher "depois" é escolher o retrabalho — registre a decisão no `STATE`, qualquer que seja.

### 6. `STATE.md` está desatualizado

Ele diz que `APP_NAME` ainda é `'Takeout'` e já é `'Bubble'`; a seção de pendências carrega
itens fechados. `STATE.md` é a primeira leitura obrigatória de todo agente — desatualizado,
ele manda a próxima pessoa consertar o que está certo. Reconcilie contra o código.

## Verificação

1. `bun check:all` verde localmente **e** na CI, num push de teste
2. Erro forçado em produção aparece no rastreador, com a release certa e **sem e-mail de
   usuário** no payload
3. `grep` por `blocked-users`, `analyticsActions`, `my-bubble-app` não acha nada vivo
4. CVR de uma aula de curso pago provando o `exists` aninhado nos três estados
5. `bun check types` limpo; `bun test:unit` passando
