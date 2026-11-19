// A conta demo **pública**: o botão "Entrar com a conta demo" da tela de login.
//
// 🔴 **Não confundir com o `DEMO_EMAIL` de `~/constants/app`.** Aquele é o Criador
// (`demo-user-id`, dono do feed em dev), herdado do Takeout e com senha escrita no repo.
// Esta é outra conta, criada para quem testa o app em produção sem cadastro, e enxerga o
// app como um visitante: logado, sem assinatura, batendo no paywall.
//
// Por que ela não tem senha: a entrada é só pelo endpoint `/sign-in/demo` do plugin
// `demoLogin` (`server/demoLogin.ts`), ligado por `DEMO_LOGIN_ENABLED=1` no servidor.
// Sem conta de credencial, ninguém entra nela pelo formulário de e-mail, e ninguém troca a
// senha e tranca os outros testadores para fora — que é o primeiro estrago que uma conta
// compartilhada com senha conhecida sofre.
//
// Este arquivo é importado pelo cliente: nada de segredo aqui.

/** `.local` de propósito: domínio que não entrega e-mail para ninguém. */
export const DEMO_ACCOUNT_EMAIL = 'conta-demo@bubble.local'
export const DEMO_ACCOUNT_NAME = 'Conta demo'

export const isDemoAccountEmail = (email: string | null | undefined) =>
  email?.toLowerCase() === DEMO_ACCOUNT_EMAIL
