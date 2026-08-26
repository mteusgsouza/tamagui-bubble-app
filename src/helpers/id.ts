import { randomUUID } from 'expo-crypto'

/**
 * generates an id on the client.
 *
 * zero mutations run on both client and server and must converge, so ids have to be
 * generated once by the caller and passed in — never inside the mutation. see the
 * "convergence" section in docs/zero.md.
 *
 * we don't use `crypto.randomUUID()` directly: on web it only exists in a secure
 * context (https or localhost), so it's missing when testing over the LAN, and on
 * native hermes defines a partial `crypto` without it.
 */
export const newId = () => randomUUID()
