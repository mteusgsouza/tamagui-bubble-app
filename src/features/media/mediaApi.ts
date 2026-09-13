// Os nomes antigos do cliente HTTP, mantidos porque 15 pontos do app já os usam.
//
// A implementação mudou de casa para `~/helpers/apiFetch`: ela nunca foi só de mídia — o
// admin de pessoas já a usava, e a cobrança passou a usar também. Aqui ficam só os
// apelidos, então `instanceof MediaApiError` continua valendo (é a **mesma** classe).
//
// Em código novo, importe de `~/helpers/apiFetch`.

export { apiFetch as mediaApi, ApiError as MediaApiError } from '~/helpers/apiFetch'
