// As contas de teste do ambiente local. **Só desenvolvimento.**
//
// Por que um arquivo com senha dentro: testar este produto exige olhar a mesma tela com
// três pessoas diferentes — quem publica, quem assina e quem não assina — e o paywall só
// se prova trocando de conta. Fazer isso digitando e-mail e senha a cada vez é a razão
// pela qual ninguém testava: as Fases 11 a 13 inteiras foram entregues sem um clique,
// e o `STATE.md` registra isso três vezes.
//
// 🔴 **Nada aqui vaza para produção.** `isDevAccountsEnabled` é `NODE_ENV ===
// 'development'`, que o bundler resolve em tempo de build: no build de produção a
// condição é literalmente `false` e o bloco inteiro sai no tree-shaking. É um gate mais
// apertado que o `isDemoMode` de propósito — aquele também liga com `VITE_DEMO_MODE=1`,
// e uma variável de ambiente não é lugar de decidir se um atalho de senha aparece.
//
// As senhas são descartáveis e valem só contra o Postgres do `docker compose` (porta
// 5533). Nenhuma delas abre nada fora desta máquina. Se um dia virarem reais, o erro foi
// reusar a senha, não escrevê-la aqui.

import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from './app'

export type DevAccount = {
  email: string
  password: string
  name: string
  /** rótulo do botão */
  label: string
  /** o que esta conta enxerga — é isso que faz escolher uma e não outra */
  detail: string
  /** `admin` destrava as abas Planos e Pessoas (`canManagePeople`) */
  role: 'admin' | 'user'
  /** plano que o seed concede, para a conta cair do lado de dentro do paywall */
  plan: string | null
}

/**
 * 🔴 **O criador é a conta semeada pelas migrations**, e o e-mail dela não é escolha:
 * `VITE_MASTER_USER_ID` aponta para `demo-user-id`, e é esse id que o feed usa como dono
 * (`feedOwnerId`). Trocar por outro e-mail aqui deixaria o feed vazio — o conteúdo
 * continuaria pendurado no dono antigo.
 */
export const DEV_ACCOUNTS: readonly DevAccount[] = [
  {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    name: DEMO_NAME,
    label: 'Criador',
    detail: 'publica e edita o conteúdo',
    role: 'user',
    plan: null,
  },
  {
    email: 'admin@bubble.local',
    password: 'admin123456',
    name: 'Admin de teste',
    label: 'Admin',
    detail: 'também mexe em planos e pessoas',
    role: 'admin',
    plan: null,
  },
  {
    email: 'assinante@bubble.local',
    password: 'assinante123',
    name: 'Assinante de teste',
    label: 'Assinante',
    detail: 'enxerga o conteúdo pago',
    role: 'user',
    plan: 'plan-mensal',
  },
  {
    email: 'visitante@bubble.local',
    password: 'visitante123',
    name: 'Visitante de teste',
    label: 'Visitante',
    detail: 'bate no paywall, como quem chega de fora',
    role: 'user',
    plan: null,
  },
]

/**
 * Gate do atalho. Constante de build: em produção vira `false` e o bloco do login some
 * do bundle junto com as senhas.
 */
export const isDevAccountsEnabled = process.env.NODE_ENV === 'development'
