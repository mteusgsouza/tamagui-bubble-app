/**
 * Gera todos os ícones do app a partir da marca do Bubble.
 *
 *   bun run:dev scripts/gen-icons.ts
 *
 * A marca é a mesma de `src/interface/app/LogoIcon.tsx`, que veio do mock
 * (`docs/design/Main.dc.html`): quadrado arredondado âmbar com duas bolhas escuras.
 * Aqui ela é redesenhada em código em vez de redimensionar um PNG — assim cada tamanho
 * sai nítido, e trocar a marca é mexer nas constantes abaixo e rodar de novo.
 *
 * Sem dependência de imagem: o PNG é montado à mão (zlib do Node) porque o `sharp` deste
 * projeto é um stub (ver `resolutions` no package.json).
 */

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// ---------------------------------------------------------------------------
// a marca, no mesmo sistema de coordenadas do SVG (viewBox 24)
// ---------------------------------------------------------------------------

const BRAND: RGB = [0xe5, 0xa3, 0x3a] // $accentBackground
const INK: RGB = [0x14, 0x14, 0x14] // $accentColor

const SQUARE = { x: 2.2, y: 2.2, w: 19.6, h: 19.6, r: 6 }
const BUBBLES = [
  { cx: 9.6, cy: 10, r: 3.3 },
  { cx: 15.4, cy: 15, r: 2.1 },
]

/** Caixa que envolve as duas bolhas — usada para centralizar quando só elas aparecem. */
const BUBBLE_BOX = (() => {
  const xs = BUBBLES.flatMap((b) => [b.cx - b.r, b.cx + b.r])
  const ys = BUBBLES.flatMap((b) => [b.cy - b.r, b.cy + b.r])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX }
})()

type RGB = [number, number, number]
type Sampler = (u: number, v: number) => { rgb: RGB; a: number } | null

// ---------------------------------------------------------------------------
// geometria (cobertura 0..1, com antialias por supersampling)
// ---------------------------------------------------------------------------

const inCircle = (u: number, v: number, cx: number, cy: number, r: number) =>
  (u - cx) ** 2 + (v - cy) ** 2 <= r * r

function inRoundedRect(u: number, v: number, x: number, y: number, w: number, h: number, r: number) {
  if (u < x || u > x + w || v < y || v > y + h) return false
  const dx = Math.max(x + r - u, 0, u - (x + w - r))
  const dy = Math.max(y + r - v, 0, v - (y + h - r))
  return dx * dx + dy * dy <= r * r
}

const bubbleAt = (u: number, v: number) =>
  BUBBLES.some((b) => inCircle(u, v, b.cx, b.cy, b.r))

// ---------------------------------------------------------------------------
// desenho
// ---------------------------------------------------------------------------

/** 4×4 amostras por pixel: o suficiente para a borda do círculo não serrilhar. */
const SUPERSAMPLE = 4

function render(size: number, toUnit: (t: number) => number, sample: Sampler): Uint8Array {
  const out = new Uint8Array(size * size * 4)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const u = toUnit((px + (sx + 0.5) / SUPERSAMPLE) / size)
          const v = toUnit((py + (sy + 0.5) / SUPERSAMPLE) / size)
          const hit = sample(u, v)
          if (hit) {
            r += hit.rgb[0] * hit.a
            g += hit.rgb[1] * hit.a
            b += hit.rgb[2] * hit.a
            a += hit.a
          }
        }
      }

      const n = SUPERSAMPLE * SUPERSAMPLE
      const i = (py * size + px) * 4
      // cor já vem multiplicada pelo alfa; desfaz para o PNG (não-premultiplicado)
      out[i] = a > 0 ? Math.round(r / a) : 0
      out[i + 1] = a > 0 ? Math.round(g / a) : 0
      out[i + 2] = a > 0 ? Math.round(b / a) : 0
      out[i + 3] = Math.round((a / n) * 255)
    }
  }

  return out
}

/** A marca inteira: quadrado arredondado + bolhas, com fora transparente. */
const markSampler: Sampler = (u, v) => {
  if (!inRoundedRect(u, v, SQUARE.x, SQUARE.y, SQUARE.w, SQUARE.h, SQUARE.r)) return null
  return { rgb: bubbleAt(u, v) ? INK : BRAND, a: 1 }
}

/**
 * Ícone de app: âmbar de ponta a ponta, **sem** canto arredondado e **sem**
 * transparência. iOS e Android aplicam a própria máscara; entregar já arredondado
 * deixa borda escura no recorte deles.
 */
const appIconSampler: Sampler = (u, v) => ({ rgb: bubbleAt(u, v) ? INK : BRAND, a: 1 })

/** Só as bolhas, transparente: é o que o Android compõe sobre a cor de fundo. */
const bubblesSampler: Sampler = (u, v) => (bubbleAt(u, v) ? { rgb: INK, a: 1 } : null)

/** Mapeia o pixel para o espaço da marca (24 unidades). */
const fullSpace = (t: number) => t * 24

/** Mapeia de forma que o miolo do quadrado ocupe a tela toda (ícone sangrado). */
const insideSquare = (t: number) => SQUARE.x + t * SQUARE.w

/**
 * Centraliza as bolhas ocupando `frac` da tela.
 *
 * ⚠️ O ícone adaptativo do Android é recortado: só o **centro (~66%)** é garantido.
 * Por isso 0.55 — conteúdo maior que isso corre risco de ser cortado no launcher.
 */
const centeredBubbles = (frac: number) => (t: number) =>
  BUBBLE_BOX.cx + (t - 0.5) * (BUBBLE_BOX.w / frac)

// ---------------------------------------------------------------------------
// PNG à mão
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf: Buffer) {
  let c = 0xffffffff
  // `!` porque o índice é mascarado com 0xff: sempre cabe na tabela de 256
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  // 10..12 = compressão/filtro/entrelaçamento, todos 0

  // cada linha começa com o byte do filtro (0 = nenhum)
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** ICO com PNGs embutidos — aceito por todo navegador atual. */
function encodeIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // 1 = ícone
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries: Buffer[] = []

  for (const img of images) {
    const e = Buffer.alloc(16)
    e[0] = img.size >= 256 ? 0 : img.size // 0 significa 256
    e[1] = img.size >= 256 ? 0 : img.size
    e[2] = 0 // paleta
    e[3] = 0
    e.writeUInt16LE(1, 4) // planos
    e.writeUInt16LE(32, 6) // bits por pixel
    e.writeUInt32BE(0, 8)
    e.writeUInt32LE(img.png.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += img.png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
}

// ---------------------------------------------------------------------------

const write = (path: string, buf: Buffer) => {
  writeFileSync(path, buf)
  console.info(`  ${path.padEnd(30)} ${(buf.length / 1024).toFixed(1)} KB`)
}

const mark = (size: number) => encodePng(size, render(size, fullSpace, markSampler))

console.info('gerando ícones a partir da marca do Bubble\n')

write('assets/icon.png', encodePng(1024, render(1024, insideSquare, appIconSampler)))
write(
  'assets/adaptive-icon.png',
  encodePng(1024, render(1024, centeredBubbles(0.55), bubblesSampler))
)
write('assets/logo.png', mark(1024))
write('assets/favicon.png', mark(128))
write(
  'public/favicon.ico',
  encodeIco([16, 32, 48].map((size) => ({ size, png: mark(size) })))
)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <rect x="${SQUARE.x}" y="${SQUARE.y}" width="${SQUARE.w}" height="${SQUARE.h}" rx="${SQUARE.r}" fill="#${BRAND.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>
${BUBBLES.map((b) => `  <circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="#${INK.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>`).join('\n')}
</svg>
`

write('public/favicon.svg', Buffer.from(svg, 'utf8'))
write('public/brandmark.svg', Buffer.from(svg, 'utf8'))

console.info('\n✅ pronto')
