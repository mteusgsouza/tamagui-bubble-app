// we need to make this into a module not only for easy re-use, but also
// to workaround the issue of imports being hoisted above other code, so
// something like this can work:
//
// ```
// import '~/native/install-expo-crypto'
// import * as utils from '@better-auth/utils' // a module that is using crypto from global scope
// ```
//
// while this cannot:
//
// ```
// import * as Crypto from 'expo-crypto'
// if (typeof crypto === 'undefined') {
//  globalThis.crypto = Crypto
// }
// import * as utils from '@better-auth/utils' // a module that is using crypto from global scope
// ```
//
// since the above code will be transformed to something equivalent to:
//
// ```
// import * as Crypto from 'expo-crypto'
// import * as utils from '@better-auth/utils' // a module that is using crypto from global scope
// if (typeof crypto === 'undefined') {
//  globalThis.crypto = Crypto
// }
// ```

import * as Crypto from 'expo-crypto'

if (typeof crypto === 'undefined') {
  // polyfill crypto for better-auth
  globalThis.crypto = Crypto as any
} else if (typeof crypto.randomUUID !== 'function') {
  // hermes ships a partial `crypto` that has getRandomValues but not randomUUID, so
  // the check above doesn't catch it. patch only the missing function instead of
  // replacing the global, to keep whatever the runtime already provides.
  globalThis.crypto.randomUUID = Crypto.randomUUID as any
}
