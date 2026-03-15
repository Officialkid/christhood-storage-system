import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { sendEmail }                  from '@/lib/email'

/**
 * POST /api/admin/test-email
 * Admin-only. Sends a test email to the requesting admin's own address.
 * Used to verify that RESEND_API_KEY and FROM_EMAIL are configured correctly.
 *
 * Optional body: { subject?: string }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'RESEND_API_KEY is not configured on this server.' },
      { status: 503 },
    )
  }

  const body    = await req.json().catch(() => ({}))
  const subject = typeof body?.subject === 'string' && body.subject.trim()
    ? body.subject.trim()
    : 'Christhood CMMS — Test Email'

  const toEmail = session.user.email
  if (!toEmail) {
    return NextResponse.json({ error: 'Admin account has no email address.' }, { status: 400 })
  }

  const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#4f46e5;padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;color:#a5b4fc;text-transform:uppercase;letter-spacing:1px;">
              Christhood CMMS
            </p>
            <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#ffffff;">
              ✅ Email Delivery Working
            </h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;line-height:1.6;">
              This is a test email confirming that your Resend integration is configured correctly.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#0f172a;border-radius:8px;padding:16px;margin:0 0 24px;">
              <tr>
                <td style="font-size:13px;color:#94a3b8;padding:4px 0;">
                  <strong style="color:#cbd5e1;">From:</strong>&nbsp; ${process.env.FROM_EMAIL ?? 'noreply@christhood.org'}
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#94a3b8;padding:4px 0;">
                  <strong style="color:#cbd5e1;">To:</strong>&nbsp; ${toEmail}
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#94a3b8;padding:4px 0;">
                  <strong style="color:#cbd5e1;">Sent by:</strong>&nbsp;
                  ${session.user.name ?? session.user.username ?? session.user.email}
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:14px;color:#64748b;">
              If you did not trigger this, no action is required — test emails are only available to admins.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 28px;border-top:1px solid #334155;">
            <p style="margin:0;font-size:12px;color:#475569;text-align:center;">
              <a href="${APP_URL}" style="color:#6366f1;text-decoration:none;">Christhood CMMS</a>
              &nbsp;·&nbsp; Admin Test Email
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await sendEmail({ to: toEmail, subject, html })

  return NextResponse.json({ ok: true, sentTo: toEmail })
}
