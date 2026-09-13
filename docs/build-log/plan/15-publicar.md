# Fase 15 — Publicar (web + Android)

**Status:** ⬜ pendente · **Pré-requisito humano:** Google Play (US$ 25, uma vez) ·
**Depende de:** 11–13 (não se publica app que não vende) e 14 (recuperar senha)

## Objetivo

Ficar publicável. iOS **não** entra aqui — ver "Por que Android primeiro".

## Por que Android primeiro

Custo e regra. Google Play são US$ 25 uma vez; Apple são US$ 99/ano, todo ano, antes do
primeiro assinante. E o Brasil, desde 18/06/2026, permite link externo de pagamento no iOS
— mas com 10–15% para a Apple e entitlement a pedir. Nada disso impede o iOS depois;
impede pagar por ele agora.

⚠️ **A conta pessoal do Google Play criada depois de 13/11/2023 exige teste fechado com 12
testadores por 14 dias corridos** antes de liberar produção. Não é dinheiro, é calendário:
comece isso **antes** de tudo estar pronto. Conta de organização não cai nessa regra.

## Escopo

### 1. Exclusão de conta — e o `deleteAccount` herdado não serve

Exigência das lojas e da LGPD. Existe
[`userActions.ts:73`](../../../src/data/server/actions/userActions.ts) vindo do Takeout,
sem UI e **não auditado contra este schema**. Usá-lo como está destrói dado que não pode
ser destruído:

- as FKs de conteúdo apontam para `userPublic` com `onDelete: cascade`, então apagar a
  linha **arrasta assinaturas, comentários, reações e mídia**
- `payment` referencia `user` (privada) e é **registro financeiro** — apagar junto é
  problema fiscal, não de privacidade

🔴 **O desenho certo é anonimizar, não deletar.** Apagar tudo é a leitura preguiçosa de
"direito ao esquecimento"; a LGPD ressalva o que a lei obriga a guardar. Então:

1. **cancelar a assinatura no Stripe primeiro** — conta apagada que continua sendo cobrada
   é o pior resultado possível, e é o resultado default se ninguém pensar nisso
2. anonimizar `userPublic` (nome, `username`, `image`) — os comentários continuam existindo
   sem dono identificável, e as respostas penduradas neles não quebram
3. apagar credenciais e sessões (`user`, `account`, `session`) — é o que efetivamente
   encerra o acesso
4. **preservar `payment`**, com o vínculo que a obrigação fiscal exige
5. registrar o pedido e a data

Comportamento irreversível: confirmação que exige digitar algo, não um "ok". E documente no
código o que sobrevive e por quê — a próxima pessoa vai ler isso durante um pedido de
titular.

### 2. Privacidade e termos

Não existe nem rota nem texto. As lojas exigem **URL pública**, alcançável sem login — e
`app/index+ssg.tsx` hoje redireciona `/` para `/auth/login`, então as rotas legais têm que
ficar **fora do guard** de `(app)`. Verifique isso abrindo em janela anônima; é o tipo de
erro que só aparece no formulário de revisão da loja.

Conteúdo mínimo honesto: que dado é coletado (e-mail, nome, foto opcional), onde mora
(Neon, R2, Stripe — cada um é um subprocessador que precisa ser nomeado), retenção, e
contato do controlador.

### 3. Uma landing pública

Consequência do item 2 e da conversão: hoje **o site inteiro está atrás do login**. Quem
recebe o link não vê o que é o produto nem o preço. Uma página em `/` com proposta, amostra
do que é público e os planos — e os links legais no rodapé, que é onde a loja vai procurar.

### 4. Validar o build nativo em device de verdade

Ele empacota desde 07/09/2026 e **nunca rodou em aparelho**. Roteiro mínimo, cada item
capaz de estar quebrado sozinho:

| | por que pode falhar só no nativo |
|---|---|
| login por e-mail e senha | `trustedOrigins`; e `EXTRA_TRUSTED_ORIGINS` existe justamente porque o IP quebrava o login |
| feed com foto, vídeo e áudio | `MediaView.native.tsx` usa `expo-video`/`expo-audio`, caminho distinto do web |
| upload do celular | `pickFile.native.ts`, outro caminho que o do navegador |
| aula com retomada | `useLessonProgress` e o throttle de 10 s contra o limite de 30 mutations/min |
| CTA de assinar | abre navegador externo no Android — sem IAP, é link, e link para fora precisa voltar funcionando |
| deep link | carregamento direto de rota é o problema que a invariante 10 descreve |

### 5. Ícone, splash e ficha da loja

`scripts/gen-icons.ts` existe — conferir se o que ele gera cobre as densidades que o Play
exige. Ficha: descrição, capturas, classificação de conteúdo e política de dados. A
classificação tem que declarar conteúdo de criador; errar isso é remoção depois, não
recusa agora.

## Verificação

- Exclusão: criar conta de teste com assinatura ativa, excluir, e conferir **no painel do
  Stripe** que a cobrança parou; `payment` preservado; `userPublic` anônimo; login antigo
  falha
- `/legal/privacidade` e `/legal/termos` abrem **em janela anônima**, sem redirect para
  login
- APK de preview instalado em aparelho físico, o roteiro do item 4 inteiro
- `bun check types` limpo, `bun test:unit` passando

## Não é desta fase

- **iOS.** Vale a pena quando a receita pagar a anuidade. Aí entram, juntos: Sign in with
  Apple (obrigatório por existir login Google — hoje é um toast em
  `app/(app)/auth/login.tsx:47`), o entitlement de link externo, e a decisão de IAP com
  RevenueCat (grátis até US$ 2.500/mês). O `providers/` já é o lugar certo para isso
  entrar sem reescrever o gate
- Hot update (`hot-updater.config.ts` está no repo, sem uso)
