// O envio de e-mail, atrás de **uma** função.
//
// ⚠️ Esta é a versão mínima que a Fase 22 precisou — a Fase 14 (recuperar senha,
// verificar e-mail, rate limit, domínio com SPF/DKIM) continua pendente e é quem deve
// engordar este arquivo. Trocar de provedor é trocar `sendEmail`, e só ela.
//
// Sem `RESEND_API_KEY` o envio **não finge**: devolve `{ ok: false, reason: 'no-provider' }`
// e o job não conta como enviado o que ficou no log.

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
}

export type SendResult = { ok: true } | { ok: false; reason: 'no-provider' | 'failed' }

export const emailConfigured = () =>
  Boolean(process.env['RESEND_API_KEY'] && process.env['EMAIL_FROM'])

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const key = process.env['RESEND_API_KEY']
  const from = process.env['EMAIL_FROM']
  if (!key || !from) return { ok: false, reason: 'no-provider' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    })
    if (!res.ok) {
      console.error(`[email] provedor recusou (${res.status})`)
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  } catch (error) {
    console.error('[email] falhou', error)
    return { ok: false, reason: 'failed' }
  }
}
