# Handoff — APK Android (parte da Fase 15, item 4)

Atualizado: 2026-10-12. Sessão que fez: 07/10 a 12/10/2026. O detalhe de cada causa está
no `STATE.md` → **"Build nativo — Android (07/10/2026)"**; aqui fica só o que a próxima
sessão precisa para continuar.

## Objetivo

Um APK que funcione no celular de ponta a ponta contra a produção
(`https://bubble.mateusgsouza.com.br`). iOS fora de escopo (decisão 19 do `STATE.md`).

## Onde estamos

✅ **O APK abre.** Build `e1522615` do EAS (commit `cf4cb3f`), perfil `preview`, 8,9 min,
instalado pelo usuário em 12/10. É o primeiro que passa do splash. Artefato:
`eas build:list --platform android --limit 1`.

🔴 **Dois defeitos vistos pelo usuário no aparelho — são o próximo trabalho:**

1. **Abre carregando o conteúdo da home, não a tela de login** (sem sessão).
2. **Login com Google não funciona no app.** O usuário não disse a mensagem/toast que
   apareceu — pergunte antes de investigar.

## O que foi corrigido para chegar aqui (todos commitados na `main`, sem push)

| defeito | conserto | onde |
|---|---|---|
| Hermes recusava `import("expo-network")` cru | `expo-network` instalado | `package.json` |
| fallback do servidor para `takeout.tamagui.dev` | removido; app para com erro | `src/constants/urls.ts` |
| servidor/criador fora do repo | perfil `release-base` + trava `https` | `eas.json`, `app.config.ts` |
| splash eterno: 513 worklets sem transformar | liga `enableReanimated` no compilador **do vxrn** | `react-native.config.cjs` |
| `setupNative.ts` (e `pgTypes.ts` no servidor!) apagados pelo tree-shaking | `sideEffects` explícito | `package.json` (invariante 13) |
| EAS cortando o build em 45 min (*Canceled*) | observador do Tamagui desligado + `pkill -P` na saída | `tamagui.build.ts`, `react-native.config.cjs` |
| logout nativo sem sessão | `authClient.$fetch` no nativo | `src/features/auth/useLogout.ts` |

Ferramenta nova: **`bun check native-bundle`** (WSL, ~2 min) reproduz o passo do Gradle
que mais quebra. Rode antes de todo `eas build`.

## Pistas para os dois defeitos (não verificadas)

**1. Home em vez de login.** O guard é `app/(app)/_layout.tsx`: só redireciona **depois**
que `useAuth().state` sai de `loading`; enquanto isso o `<Stack>` nativo mostra a primeira
tela, `home`. Hipóteses, nesta ordem:
- a sessão nunca resolve no nativo (`state` preso em `loading`) — o `get-session` do
  `@take-out/better-auth-utils` falhando ou pendurado no APK. O splash some sozinho no
  primeiro conteúdo (`CONTENT_APPEARED`), então ele não denuncia isso;
- resolve como `logged-out`, mas o `<Redirect>` dentro do `Stack` nativo não navega;
- as telas da home disparam queries sem sessão antes do redirect (cosmético se o
  redirect acontecer).
Comece pelo log: o primeiro passo é saber qual.

**2. Google.** No nativo, o `signIn.social` (`app/(app)/auth/login.tsx:53`) é interceptado
pelo `expoClient` (`src/features/auth/client/platformClient.native.ts`): abre o navegador
do sistema (`expo-web-browser`), o Google volta para
`<servidor>/api/auth/callback/google`, e o servidor redireciona para
`bubble:///home/feed?cookie=…`. Pode falhar em qualquer elo:
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ausentes **em produção** → toast "ainda não
  está configurado". Conferir com o usuário (`deploy/aws/app.env.example`); o Google
  **nunca foi exercido nem na web** (STATE, Fase 10);
- redirect URI no Google Cloud Console ≠ `https://bubble.mateusgsouza.com.br/api/auth/callback/google`;
- `callbackURL: '/home/feed'` vira `bubble:///home/feed`; o servidor precisa confiar em
  `bubble://` (`trustedOrigins` em `authServer.ts` — já confia) e o app precisa receber o
  deep link (scheme `bubble`, `app.config.ts`).

## Restrições do usuário

- **Não instalar Android Studio nem emulador.** O `adb` já existe:
  `C:\Users\mateu\AppData\Local\Android\Sdk\platform-tools\adb.exe`. Log do app: celular
  com depuração USB → `adb logcat -s ReactNativeJS ReactNative AndroidRuntime`.
- **Não disparar `eas build` sem o usuário pedir.** O plano é gratuito; cada build conta.
- Qualidade antes de atalho; decisão registrada com o porquê (memória do projeto).

## Já tentado, não funcionou (não refaça)

- Carregar o `vite.config.ts` no `react-native.config.cjs` → cria um segundo plugin do
  Tamagui; e foi uma conclusão errada achar que esse era o travamento (commits 67e19b8,
  524bebf). O vxrn já resolve o config sozinho.
- Testar o bundle sem `--sourcemap-output` → mais rápido que a corrida, esconde o
  travamento. Use os argumentos do `BundleHermesCTask`.
- Confiar no código de saída de `bun check <x>` → é 0 mesmo falhando. Leia a saída.
- `pkill -f "esbuild --service"` dentro de `bash -c '…'` mata o próprio shell; use
  `'esbuild --servic[e]'`.

## Pendências abertas desta frente (fora os dois defeitos)

- **Produção não tem o `pgTypes.ts`** até o próximo `bash scripts/deploy.sh`.
- Retorno do checkout do Stripe para o app não funciona (`returnUrl` duplicado; Stripe
  quer `https`, não `bubble://`) — STATE, mesma seção.
- Painel do EAS tem `ONE_SERVER_URL`/`VITE_MASTER_USER_ID` (redundantes com o `eas.json`)
  e 4 variáveis mortas. Apagar é decisão do usuário.
- `expo doctor` falha com `EOVERRIDE` (`react-native-reanimated` em `overrides` e em
  `dependencies`).
- Logout nativo corrigido mas nunca exercido no aparelho.

## Próximos passos

1. Perguntar ao usuário o que o botão do Google mostrou e se o celular pode ir no USB.
2. Com o `adb logcat`, abrir o app deslogado e ler o que acontece com a sessão (defeito 1).
3. Corrigir, `bun check native-bundle`, `bun check types` (lendo a saída), e só então
   propor um `eas build`.
