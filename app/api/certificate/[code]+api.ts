// GET /api/certificate/<code> — verificação pública de um certificado.
//
// 🔴 **Sem sessão, de propósito.** Quem confere um certificado não tem conta neste app.
// Devolve só nome, curso, data e aulas (`PublicCertificateDTO`) — nada de e-mail nem id
// interno. Não reaproveite o endpoint do curso: ele responde com DTO cheio e checa sessão.

import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadPublicCertificate } from '~/server/content/certificates'

import type { Endpoint } from 'one'

const CODE_FROM_PATH = /\/api\/certificate\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const code = pathParam(request, CODE_FROM_PATH)
  if (!code) return fail(400, 'invalid-code', 'Código inválido.')

  try {
    const found = await loadPublicCertificate(decodeURIComponent(code).toUpperCase())
    if (!found) return FAIL.notFound('Certificado não encontrado.')
    return Response.json({ certificate: found })
  } catch (error) {
    console.error('[certificate] falhou', error)
    return fail(500, 'certificate-failed', 'Não deu para verificar o certificado.')
  }
}
