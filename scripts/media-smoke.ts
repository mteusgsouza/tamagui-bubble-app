#!/usr/bin/env bun

/**
 * @description Teste ponta a ponta da mídia (Fase 5): upload no R2 e o 403 do paywall.
 *
 * Faz o que a UI vai fazer, sem UI: entra com e-mail/senha, pede a URL assinada, manda
 * o arquivo direto ao bucket, confirma e chama a rota de playback.
 *
 * Subir um arquivo como criador:
 *   bun scripts/media-smoke.ts ./foto.jpg
 *
 * Checar o playback com outra conta (é este o teste que prova o paywall):
 *   bun scripts/media-smoke.ts --check <mediaId> \
 *     --email teste@bubble.local --password teste123456 --expect 403
 *
 * Precisa do `bun dev` no ar e das credenciais do R2 em `.env.local`.
 */

import { basename, extname } from 'node:path'

const DEFAULT_SERVER = 'http://localhost:8081'
const DEFAULT_EMAIL = 'demo@takeout.tamagui.dev'
const DEFAULT_PASSWORD = 'demopassword123'

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
}

// --- args ---

const VALUE_FLAGS = ['server', 'email', 'password', 'check', 'expect'] as const

const argv = process.argv.slice(2)
const flags: Record<string, string> = {}
const positional: string[] = []

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]!
  if (!arg.startsWith('--')) {
    positional.push(arg)
    continue
  }
  const name = arg.slice(2)
  if ((VALUE_FLAGS as readonly string[]).includes(name)) {
    flags[name] = argv[i + 1] || ''
    i++
  } else {
    console.warn(`flag desconhecida ignorada: ${arg}`)
  }
}

const server = (flags.server || DEFAULT_SERVER).replace(/\/$/, '')
const email = flags.email || DEFAULT_EMAIL
const password = flags.password || DEFAULT_PASSWORD
const checkOnly = flags.check
const expected = flags.expect ? Number(flags.expect) : undefined
const filePath = positional[0]

const die = (message: string): never => {
  console.error(`\n❌ ${message}`)
  process.exit(1)
}

const ok = (message: string) => console.info(`✅ ${message}`)

// --- preflight ---

/**
 * O script não sobe nada: ele fala com o `bun dev`. Sem esta checagem, servidor fora do
 * ar vira um `ConnectionRefused` cru no meio do login.
 */
async function preflight() {
  try {
    const res = await fetch(`${server}/api/health`)
    if (!res.ok) die(`${server}/api/health respondeu ${res.status}`)
  } catch {
    die(
      `não consegui falar com ${server}\n` +
        '   Suba o app em outro terminal e espere o "Server running":\n' +
        '     bun dev\n' +
        '   (e o backend antes dele, se não estiver rodando: bun backend)',
    )
  }
  ok(`servidor no ar em ${server}`)
}

// --- auth ---

async function signIn() {
  const res = await fetch(`${server}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    die(`login falhou para ${email}: ${res.status} ${await res.text()}`)
  }

  // o plugin `bearer()` do better-auth devolve o token de sessão neste header
  const token = res.headers.get('set-auth-token')
  if (!token) {
    die('login OK mas sem `set-auth-token` no header — o plugin bearer está ligado?')
  }

  ok(`autenticado como ${email}`)
  return token!
}

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

// --- playback ---

async function checkPlayback(token: string, mediaId: string) {
  // `redirect: 'manual'` para ver o 302 em vez de seguir para o R2
  const res = await fetch(`${server}/api/media/${mediaId}/play`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  })

  const location = res.headers.get('location')
  const body = res.status >= 400 ? await res.text() : ''

  console.info(`\n→ GET /api/media/${mediaId}/play`)
  console.info(`  status: ${res.status}`)
  if (location) console.info(`  location: ${location.slice(0, 110)}…`)
  if (body) console.info(`  body: ${body}`)

  if (expected !== undefined) {
    if (res.status !== expected) {
      die(`esperava ${expected}, veio ${res.status}`)
    }
    ok(`status ${res.status} como esperado`)
  } else if (res.status === 302) {
    ok('302 para a URL assinada — playback liberado')
  } else {
    die(`playback recusado: ${res.status}`)
  }

  return res.status
}

// --- upload ---

async function uploadFile(token: string, path: string) {
  const file = Bun.file(path)
  if (!(await file.exists())) die(`arquivo não encontrado: ${path}`)

  const ext = extname(path).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) die(`extensão não suportada: ${ext || '(sem extensão)'}`)

  const bytes = await file.arrayBuffer()
  const id = crypto.randomUUID()

  console.info(
    `\n→ POST /api/media/upload-url (${basename(path)}, ${mime}, ${bytes.byteLength}B)`,
  )

  const signRes = await fetch(`${server}/api/media/upload-url`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ id, mime, sizeBytes: bytes.byteLength }),
  })

  if (!signRes.ok) die(`upload-url ${signRes.status}: ${await signRes.text()}`)

  const signed = (await signRes.json()) as {
    mediaId: string
    storageKey: string
    upload: { url: string; method: string; headers: Record<string, string> }
  }
  ok(`assinado — storageKey: ${signed.storageKey}`)

  console.info('\n→ PUT direto no R2')
  const putRes = await fetch(signed.upload.url, {
    method: signed.upload.method,
    headers: signed.upload.headers,
    body: bytes,
  })

  if (!putRes.ok) {
    die(
      `o R2 recusou o PUT: ${putRes.status} ${await putRes.text()}\n` +
        '   403 aqui costuma ser credencial errada ou Content-Type diferente do assinado.',
    )
  }
  ok(`objeto gravado (${putRes.status})`)

  console.info('\n→ POST /api/media/complete')
  const doneRes = await fetch(`${server}/api/media/complete`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ id }),
  })

  if (!doneRes.ok) die(`complete ${doneRes.status}: ${await doneRes.text()}`)
  ok(`mídia pronta: ${JSON.stringify(await doneRes.json())}`)

  return id
}

// --- main ---

await preflight()

const token = await signIn()

if (checkOnly) {
  await checkPlayback(token, checkOnly)
} else {
  if (!filePath) {
    die(
      'informe um arquivo: bun scripts/media-smoke.ts ./foto.jpg\n' +
        '   (ou use --check <mediaId> para só testar o playback)',
    )
  }
  const mediaId = await uploadFile(token, filePath!)
  await checkPlayback(token, mediaId)
  console.info(`\nmediaId: ${mediaId}`)
  console.info(
    'Para o teste do paywall, prenda essa mídia a um post pago e rode de novo com\n' +
      '--check <mediaId> --email <outra conta> --expect 403.',
  )
}
