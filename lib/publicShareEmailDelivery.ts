import { Resend } from 'resend'

type PublicShareEmailOptions = {
  html: string
  subject: string
  to: string | string[]
}

export type PublicShareEmailResult = {
  ok: boolean
  error?: string
}

const FROM_ADDRESS = process.env.FROM_EMAIL ?? 'noreply@cmmschristhood.org'
const FROM_NAME = process.env.FROM_NAME ?? 'CMMS Platform'
const FROM = FROM_ADDRESS.includes('<')
  ? FROM_ADDRESS
  : `${FROM_NAME} <${FROM_ADDRESS}>`

function normalizeEmailErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown email error')

  if (raw.includes('You can only send testing emails to your own email address')) {
    return 'Email sending is still in Resend test mode. Verify your domain in Resend and set FROM_EMAIL to an address on that verified domain before sending to external recipients.'
  }

  return raw
}

export async function sendPublicShareEmail({
  to,
  subject,
  html,
}: PublicShareEmailOptions): Promise<PublicShareEmailResult> {
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      error: 'RESEND_API_KEY is not configured on this server.',
    }
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    })

    if (error) {
      throw new Error((error as { message?: string }).message ?? JSON.stringify(error))
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: normalizeEmailErrorMessage(error),
    }
  }
}
