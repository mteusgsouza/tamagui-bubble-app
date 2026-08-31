# Build log — Bubble App

Plano de construção fatiado em 9 fases, uma por agente. Cada agente começa com contexto
limpo; o handoff é a única ponte entre eles.

## Se você é o agente da vez, leia nesta ordem

1. **[`STATE.md`](./STATE.md)** — onde estamos, ambiente, decisões acumuladas, pendências
2. **[`plan/00-contexto.md`](./plan/00-contexto.md)** — produto, stack, contrato de execução
3. **`plan/NN-<sua-fase>.md`** — só a sua
4. **`handoffs/<fase anterior>.md`** — o que o agente anterior deixou

Não leia o plano das outras fases. Se precisar de algo que está lá, é sinal de que o
handoff anterior ficou incompleto — registre isso no seu.

## Fases

| | Fase | Plano | Handoff | Pré-requisito humano |
|---|---|---|---|---|
| ⏭️ | 1 — Repositório | [plano](./plan/01-repositorio.md) | — | — |
| ✅ | 2 — Limpar demo + `id.ts` | [plano](./plan/02-limpar-demo.md) | [handoff](./handoffs/02-limpar-demo.md) | — |
| ✅ | 3 — Schema + migrations | [plano](./plan/03-modelo-de-dados.md) | [handoff](./handoffs/03-modelo-de-dados.md) | — |
| ✅ | 4 — Camada Zero | [plano](./plan/04-camada-zero.md) | [handoff](./handoffs/04-camada-zero.md) | — |
| ✅ | 5 — Mídia R2 | [plano](./plan/05-midia-r2.md) | [handoff](./handoffs/05-midia-r2.md) | ⚠️ conta Cloudflare R2 |
| ✅ | 6 — Feed UI | [plano](./plan/06-feed.md) | [handoff](./handoffs/06-feed.md) | — |
| ✅ | 7 — Cursos UI | [plano](./plan/07-cursos.md) | [handoff](./handoffs/07-cursos.md) | — |
| ✅ | 8 — Admin | [plano](./plan/08-admin.md) | [handoff](./handoffs/08-admin.md) | — |
| ✅ | 9 — Billing | [plano](./plan/09-billing.md) | [handoff](./handoffs/09-billing.md) | — |
| ✅ | 10 — Auth (cadastro + Google OAuth) | [plano](./plan/10-auth.md) | [handoff](./handoffs/10-auth.md) | ⚠️ credenciais Google Cloud (só para o Google; o cadastro por e-mail está pronto) |

✅ concluída · ⬜ pendente · ⏭️ pulada

## Ao terminar sua fase

1. Escrever `handoffs/NN-<fase>.md` no formato de `plan/00-contexto.md`
2. Atualizar `STATE.md`
3. **Corrigir `plan/NN+1`** com o que você descobriu — o plano é documento vivo, não
   contrato imutável. Se você achou arquivos, APIs ou obstáculos que a próxima fase não
   previa, escreva lá antes de parar
4. Marcar a linha desta tabela como ✅ e linkar o handoff
5. 🔴 **COMITAR A VERSÃO FUNCIONANDO.** Obrigatório, antes de parar.
   - Pré-condições, todas verdes: `bun check types` limpo, `bun test:unit` passando, e
     o app subindo (`bun dev`) sem erro novo no console.
   - Mensagem no formato do commit da Fase 7: o que a fase entregou, as correções que
     saíram no caminho, e uma seção **"Conhecido e NÃO resolvido"** com o que ficou
     quebrado. Bug conhecido e escrito é dívida; bug não escrito é armadilha.
   - Se algo está quebrado e sem conserto à vista, **comite mesmo assim** — o valor é
     ter um ponto de retorno. Reverta o que piorou antes de comitar (foi o que aconteceu
     na Fase 7: uma tentativa de corrigir o deep link tornou o comportamento
     intermitente e foi revertida ao original do starter antes do commit).
   - *Por que isso virou regra:* as Fases 2 a 6 ficaram **inteiras** sem commit. Um
     `bun backend:clean` ou um experimento malsucedido teria levado tudo junto.
6. Parar. Não avançar para a próxima fase

## Quem roda os comandos

**O usuário.** Nenhum agente executa `bun install`, `backend`, `dev`, `migrate`,
`zero:generate` ou build nativo — cada handoff entrega a lista exata de comandos, em
ordem, com o resultado esperado de cada um.
