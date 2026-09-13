# Fase 14 — E-mail transacional

**Status:** ⬜ pendente · **Pré-requisito humano:** conta no provedor de e-mail + domínio
verificado (SPF/DKIM) · **Depende de:** nada — pode ir em paralelo com 11–13

## Objetivo

Hoje **o projeto não envia e-mail nenhum**. Não é "falta a UI de recuperar senha": falta o
transporte. `sendMagicLink` é um `console.info`
([`authServer.ts:102`](../../../src/features/auth/server/authServer.ts)) e não há nenhuma
dependência de e-mail no `package.json`. Quem esquecer a senha não tem saída pela UI.

Um provedor destrava três coisas de uma vez: **recuperar senha**, **verificar e-mail** e
aviso de cobrança.

## Provedor

**Resend** para começar: sem custo inicial, faixa gratuita suficiente para um criador, e a
API é um POST. SES fica mais barato em escala e exige sair do sandbox; Postmark tem melhor
entregabilidade transacional e custa desde o primeiro e-mail. Nada aqui amarra: o envio vai
atrás de **uma** função (`src/server/email/send.ts`) e trocar provedor é trocar essa
função — a mesma forma do adapter de cobrança, pela mesma razão.

⚠️ **Domínio verificado não é detalhe.** Sem SPF/DKIM no domínio próprio, e-mail de
recuperação de senha cai em spam — e recuperação que não chega é igual a não ter
recuperação. O remetente não pode ser `@gmail`.

## Escopo

### 1. Recuperar senha — o fluxo de verdade, não o atalho

O `STATE` sugere magic link "porque é o caminho mais curto". **Não é o que o usuário
espera**: quem clicou em "esqueci minha senha" quer definir uma senha nova, e não receber
um link que entra sem senha e deixa a antiga valendo. Implemente
`requestPasswordReset` / `resetPassword` do Better Auth, com as duas telas
(`/auth/forgot` e `/auth/reset`).

🔴 **A resposta não pode revelar se o e-mail existe.** Pedido de recuperação responde
sempre igual, tenha conta ou não. É a mesma razão da decisão 17 do `STATE` (entrar e criar
conta são caminhos separados para não entregar a lista de cadastrados a quem testar um por
um) — jogar fora essa proteção aqui anularia a decisão lá.

🔴 **Rate limit por e-mail e por IP.** Sem isso a rota é uma máquina de spam apontada para
qualquer endereço, e a reputação do domínio vai junto. Não existe rate limit em nenhuma
rota do projeto hoje: esta é a primeira, então deixe o helper reutilizável.

Token de reset: curto (1 h), **uso único**, invalidado ao trocar a senha. Trocar senha
encerra as outras sessões — senão o invasor que causou a troca continua dentro.

### 2. Decidir o `magicLink`: implementar ou desregistrar

O plugin está registrado com um sender que só loga. Isso é exatamente o que a **decisão
18** proíbe: "botão que existe e quebra é pior que botão que avisa" — a regra foi escrita
para o provider social e vale igual aqui. Com o transporte pronto, implemente; se magic
link não é caminho desejado, **tire o plugin**. O que não pode é continuar registrado e
mudo.

### 3. Verificação de e-mail

`emailVerified` nasce `false` e ninguém olha. Antes de escrever código, decida **o que ele
protege** — campo que não gateia nada é campo que mente.

Recomendação: **não bloquear conteúdo** (isso já é papel da assinatura) e bloquear só o que
depende do endereço ser real — trocar e-mail e recuperar senha. Aviso no app, reenvio com
rate limit, e o link marca `emailVerified`.

### 4. Recibo de pagamento — não escreva

O Stripe envia recibo e fatura por e-mail, é uma opção no painel. Reimplementar isso seria
pior e mais frágil. Ligue lá e escreva no `deploy/` que está ligado, porque é o tipo de
configuração que ninguém acha depois.

Fica para este projeto o que o Stripe **não** manda: aviso de cobrança recusada com
instrução de atualizar cartão (o `invoice.payment_failed` da Fase 11 já chega ao servidor).

### 5. Os templates

HTML simples, inline, sem framework. ⚠️ **E-mail não tem token do Tamagui** — mas o hex do
âmbar não pode ser digitado à mão aqui: importe de uma constante única derivada de
`src/tamagui/brandAccent.ts`. É a invariante 6 valendo no único lugar onde ela não pode ser
aplicada literalmente.

Todo template com versão em texto puro. Cliente que não renderiza HTML existe, e link de
recuperação que chega ilegível é chamado de suporte.

## Verificação

1. Pedido de recuperação para conta existente → e-mail chega (caixa real, não log), o link
   abre `/auth/reset`, a senha nova entra, a antiga dá 401
2. Pedido para e-mail que não existe → **mesma resposta**, nenhum e-mail
3. Link usado duas vezes → o segundo falha. Link de 2 h atrás → falha
4. Trocar a senha derruba as outras sessões
5. Estourar o rate limit → 429, e o e-mail para de sair
6. `bun test:unit` cobrindo o que é função pura (expiração e uso único do token, resposta
   indistinguível). O envio em si vai mockado — teste que depende de caixa de entrada não
   roda na CI
7. `bun check types` limpo

## Não é desta fase

- Newsletter e aviso de post novo → Fase 16
- Mudança de e-mail com confirmação nos dois endereços
