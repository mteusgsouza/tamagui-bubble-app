#!/usr/bin/env bun

/**
 * @description Aplica a política de CORS no bucket R2 — sem isso o upload pelo navegador
 * é bloqueado.
 *
 *   bun run:dev scripts/r2-cors.ts                    # garante http://localhost:8081
 *   bun run:dev scripts/r2-cors.ts --get              # só mostra a política atual
 *   bun run:dev scripts/r2-cors.ts https://meuapp.com # acrescenta outra origem
 *   bun run:dev scripts/r2-cors.ts --replace https://so-essa.com   # descarta as atuais
 *
 * ⚠️ **Ele soma, não substitui.** O R2 aceita uma política por bucket, então um PUT
 * simples apagaria as origens que já estavam lá — rodar isto para consertar o dev
 * derrubaria o upload em produção, sem aviso. Por isso o padrão é ler a política atual e
 * unir. Para limpar de propósito, `--replace`.
 *
 * ⚠️ **Por que isto existe:** o `media-smoke.ts` sobe arquivo pelo Node, que não tem
 * CORS — então ele passa mesmo com o bucket fechado. O navegador não: o PUT assinado é
 * cross-origin (app em :8081, bucket em r2.cloudflarestorage.com) e o preflight morre
 * com "No 'Access-Control-Allow-Origin' header". Foi assim que a Fase 5 passou na
 * verificação e o upload real continuou quebrado.
 *
 * O SigV4 daqui usa autenticação por **cabeçalho** (com hash do corpo), diferente do
 * `src/server/storage/r2.ts`, que assina por query string e só serve para objeto.
 */

import { createHash, createHmac } from 'node:crypto'

const REGION = 'auto'
const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'

const ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT || ''
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || ''
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY || ''
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY || ''

if (!ENDPOINT || !BUCKET || !ACCESS_KEY || !SECRET_KEY) {
  console.error('❌ Credenciais do R2 ausentes no ambiente.')
  console.error('   Preencha `.env.local` (ver `.env.local.example`) e rode assim:')
  console.error('     bun run:dev scripts/r2-cors.ts')
  process.exit(1)
}

const argv = process.argv.slice(2)
const onlyGet = argv.includes('--get')
const replace = argv.includes('--replace')
const extraOrigins = argv.filter((a) => !a.startsWith('--'))

/** A origem pública, quando o ambiente souber qual é. */
const publicOrigin = process.env.VITE_WEB_HOSTNAME
  ? `https://${process.env.VITE_WEB_HOSTNAME}`
  : null

const wanted = [
  'http://localhost:8081',
  ...(publicOrigin ? [publicOrigin] : []),
  ...extraOrigins,
]

const sha256Hex = (data: string) =>
  createHash('sha256').update(data, 'utf8').digest('hex')
const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data, 'utf8').digest()

const toAmzDate = (date: Date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '')

function signingKey(dateStamp: string) {
  const kDate = hmac(`AWS4${SECRET_KEY}`, dateStamp)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

/** SigV4 por cabeçalho — o corpo entra na assinatura, ao contrário do presign. */
function signedRequest(method: 'PUT' | 'GET', query: string, body: string) {
  const endpoint = new URL(ENDPOINT)
  const host = endpoint.host
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  const canonicalUri = `${basePath}/${BUCKET}`

  const amzDate = toAmzDate(new Date())
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const payloadHash = sha256Hex(body)

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (body) headers['content-type'] = 'application/xml'

  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join('')
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const signature = hmac(signingKey(dateStamp), stringToSign).toString('hex')

  return {
    url: `${endpoint.protocol}//${host}${canonicalUri}?${query}`,
    headers: {
      ...headers,
      Authorization: `${ALGORITHM} Credential=${ACCESS_KEY}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  }
}

const corsXml = (origins: string[]) => {
  const rule = [
    ...origins.map((o) => `    <AllowedOrigin>${o}</AllowedOrigin>`),
    // PUT sobe o arquivo; GET e HEAD servem playback e a confirmação de upload
    '    <AllowedMethod>PUT</AllowedMethod>',
    '    <AllowedMethod>GET</AllowedMethod>',
    '    <AllowedMethod>HEAD</AllowedMethod>',
    // o `Content-Type` entra na assinatura do PUT, então o preflight precisa liberá-lo
    '    <AllowedHeader>content-type</AllowedHeader>',
    '    <ExposeHeader>etag</ExposeHeader>',
    '    <MaxAgeSeconds>3600</MaxAgeSeconds>',
  ].join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
${rule}
  </CORSRule>
</CORSConfiguration>`
}

async function getCors() {
  const { url, headers } = signedRequest('GET', 'cors=', '')
  const res = await fetch(url, { headers })
  const text = await res.text()
  return { status: res.status, text }
}

async function putCors(origins: string[]) {
  const body = corsXml(origins)
  const { url, headers } = signedRequest('PUT', 'cors=', body)
  const res = await fetch(url, { method: 'PUT', headers, body })
  return { status: res.status, text: res.ok ? '' : await res.text() }
}

if (onlyGet) {
  const current = await getCors()
  console.info(`GET /${BUCKET}?cors → ${current.status}`)
  console.info(current.text || '(sem política definida)')
  process.exit(current.status < 400 ? 0 : 1)
}

// une com o que já está no bucket, senão consertar uma origem apaga as outras
const existing = replace ? { status: 200, text: '' } : await getCors()
const already = [...existing.text.matchAll(/<AllowedOrigin>([^<]+)<\/AllowedOrigin>/g)].map(
  (m) => m[1]!
)
const ORIGINS = [...new Set([...already, ...wanted])]

const novas = ORIGINS.filter((o) => !already.includes(o))
if (already.length) {
  console.info(`política atual: ${already.join(', ')}`)
}
if (!novas.length && !replace) {
  console.info('✅ nada a fazer: as origens desejadas já estão no bucket')
  process.exit(0)
}

console.info(`→ PUT /${BUCKET}?cors  (acrescentando: ${novas.join(', ') || 'nenhuma'})`)
const result = await putCors(ORIGINS)

if (result.status >= 400) {
  console.error(`❌ o R2 recusou (${result.status}):`)
  console.error(result.text)
  console.error('\n   Se for 403, o token do R2 precisa de permissão de **admin** no')
  console.error('   bucket — ler/escrever objeto não basta para mudar configuração.')
  process.exit(1)
}

console.info(`✅ CORS aplicado: ${ORIGINS.join(', ')}`)
console.info('   métodos PUT, GET, HEAD')

// confere lendo de volta: PUT que devolve 200 sem persistir seria pior que erro
const check = await getCors()
if (check.status < 400 && ORIGINS.every((o) => check.text.includes(o))) {
  console.info('✅ conferido: a política está no bucket')
} else {
  console.warn(`⚠️ não consegui confirmar lendo de volta (GET ${check.status})`)
}
