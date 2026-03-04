import { Resend } from 'resend'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const resend  = new Resend(process.env.RESEND_API_KEY)
const FROM    = process.env.FROM_EMAIL   ?? 'noreply@christhood.org'
const APP_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3001'
const APP     = 'Christhood CMMS'

// ─────────────────────────────────────────────────────────────────────────────
// Core send utility — NEVER throws; logs all failures internally
// ─────────────────────────────────────────────────────────────────────────────
interface SendOptions {
  to:      string | string[]
  subject: string
  html:    string
}

export async function sendEmail({ to, subject, html }: SendOptions): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY not set — skipping: "${subject}"`)
    return
  }

  try {
    const { error } = await resend.emails.send({
      from:    FROM,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
    })
    if (error) throw new Error((error as { message?: string }).message ?? JSON.stringify(error))
    console.log(`[email] ✓ "${subject}" → ${Array.isArray(to) ? to.join(', ') : to}`)
  } catch (err) {
    console.error(`[email] ✗ Failed to send "${subject}":`, err)
    // Never rethrow — email failures must not break the main application flow
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout wrapper (email-client–safe HTML)
// ─────────────────────────────────────────────────────────────────────────────
function layout(previewText: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${APP}</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
    table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;max-width:100%;}
    a{color:#6366f1;text-decoration:none;}
    a:hover{text-decoration:underline;}
  </style>
</head>
<body>
  <!-- Hidden preview text -->
  <span style="display:none;font-size:1px;color:#f1f5f9;max-height:0;max-width:0;opacity:0;overflow:hidden;">${previewText}&nbsp;&#847;</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">

      <!-- Card -->
      <table role="presentation" width="100%" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1e1b4b;padding:26px 36px;">
            <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${APP}</span>
            <span style="display:inline-block;margin-left:8px;padding:2px 8px;background:#4f46e5;border-radius:6px;font-size:11px;font-weight:600;color:#c7d2fe;letter-spacing:0.5px;vertical-align:middle;">MINISTRY MEDIA</span>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:36px 36px 28px;">${body}</td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 36px 26px;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
              This email was sent by <strong>${APP}</strong>. If you did not expect it, you can safely ignore it.<br>
              Do not reply — this address is unmonitored.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// Indigo CTA button
function btn(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;">
    <tr><td style="border-radius:8px;background:#4f46e5;">
      <a href="${href}" target="_blank"
         style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.1px;">${label}</a>
    </td></tr>
  </table>`
}

// Muted info/notice box
function infoBox(html: string): string {
  return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:18px 0;font-size:13px;color:#475569;line-height:1.7;">${html}</div>`
}

// Escape HTML to prevent injection in dynamic content
function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Account Created — admin-created account with "set your password" link
// ─────────────────────────────────────────────────────────────────────────────
export async function sendAccountCreatedEmail(
  toEmail:          string,
  username:         string,
  role:             string,
  setPasswordToken: string,
): Promise<void> {
  const link      = `${APP_URL}/auth/reset-password?token=${setPasswordToken}`
  const roleLabel = role.charAt(0) + role.slice(1).toLowerCase()

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.6px;">Welcome</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">Your account is ready</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      Hi <strong>${username}</strong>, an administrator has created a <strong>${APP}</strong> account for you.
    </p>
    ${infoBox(`
      <strong>Username:</strong>&nbsp;${esc(username)}<br>
      <strong>Email:</strong>&nbsp;${esc(toEmail)}<br>
      <strong>Role:</strong>&nbsp;${esc(roleLabel)}
    `)}
    <p style="margin:0 0 4px;font-size:15px;color:#334155;line-height:1.6;">
      Click below to set your password and access the system.
      This link expires in <strong>24&nbsp;hours</strong>.
    </p>
    ${btn('Set my password →', link)}
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">
      Or copy and paste this URL:<br>
      <a href="${link}" style="color:#6366f1;word-break:break-all;">${link}</a>
    </p>`

  await sendEmail({
    to:      toEmail,
    subject: `Welcome to ${APP} — set your password`,
    html:    layout(`Your ${APP} account is ready. Set your password to get started.`, body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1b. Welcome — self-registered user (password already set)
// ─────────────────────────────────────────────────────────────────────────────
export async function sendWelcomeEmail(
  toEmail:  string,
  username: string,
): Promise<void> {
  const link = `${APP_URL}/login`

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.6px;">Welcome</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">Account created</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      Hi <strong>${username}</strong>, your <strong>${APP}</strong> account has been created.
      You can now sign in and start uploading media.
    </p>
    ${btn('Sign in →', link)}
    ${infoBox('If you did not create this account, please contact your system administrator immediately.')}
  `

  await sendEmail({
    to:      toEmail,
    subject: `Welcome to ${APP}`,
    html:    layout(`Your ${APP} account is ready. Sign in to get started.`, body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Password Reset
// ─────────────────────────────────────────────────────────────────────────────
export async function sendPasswordResetEmail(
  toEmail:  string,
  username: string,
  token:    string,
): Promise<void> {
  const link = `${APP_URL}/auth/reset-password?token=${token}`

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.6px;">Security</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">Password reset request</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      Hi <strong>${esc(username)}</strong>, we received a request to reset the password for your
      <strong>${APP}</strong> account. Click below to choose a new password.
      This link expires in <strong>24&nbsp;hours</strong>.
    </p>
    ${btn('Reset my password →', link)}
    ${infoBox("<strong>Didn't request this?</strong> You can safely ignore this email. Your password will not change unless you click the link above.")}
    <p style="margin:0;font-size:12px;color:#94a3b8;">
      Or copy and paste this URL:<br>
      <a href="${link}" style="color:#6366f1;word-break:break-all;">${link}</a>
    </p>`

  await sendEmail({
    to:      toEmail,
    subject: `Reset your ${APP} password`,
    html:    layout('A password reset was requested for your account.', body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin Purge Alert — batch summary sent to all admins after cron purge
// ─────────────────────────────────────────────────────────────────────────────
export interface PurgedFileInfo {
  fileName:  string
  eventName: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Weekly Digest — sent every Monday to all ADMIN + EDITOR staff
// ─────────────────────────────────────────────────────────────────────────────
export interface DigestUploadItem {
  originalName: string
  fileType:     string
  createdAt:    Date
  uploader?:    { username: string | null; email: string } | null
  event?:       { name: string } | null
}

export async function sendWeeklyDigestEmail(
  recipientEmails: string[],
  uploads:         DigestUploadItem[],
  since:           Date,
): Promise<void> {
  if (recipientEmails.length === 0 || uploads.length === 0) return

  const count    = uploads.length
  const fromDate = since.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const toDate   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const rows = uploads.slice(0, 50).map(u => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${esc(u.originalName)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${esc(u.event?.name ?? '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${esc(u.uploader?.username ?? u.uploader?.email ?? '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#94a3b8;">${new Date(u.createdAt).toLocaleDateString('en-GB')}</td>
    </tr>`).join('')

  const overflow = count > 50
    ? `<p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">…and ${count - 50} more. <a href="${APP_URL}/media" style="color:#6366f1;">View all →</a></p>`
    : ''

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.6px;">Weekly Digest</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">
      ${count}&nbsp;upload${count !== 1 ? 's' : ''} this week
    </h1>
    <p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.6;">
      Here's a summary of all media uploaded between <strong>${fromDate}</strong> and <strong>${toDate}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:0 0 6px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">File</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Event</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Uploaded by</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${overflow}
    ${btn('View Media Library →', `${APP_URL}/media`)}
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">You are receiving this because you are an admin or editor. Manage preferences at <a href="${APP_URL}/notifications" style="color:#6366f1;">${APP_URL}/notifications</a>.</p>`

  await sendEmail({
    to:      recipientEmails,
    subject: `[${APP}] Weekly Digest — ${count} upload${count !== 1 ? 's' : ''} (${fromDate} – ${toDate})`,
    html:    layout(`${count} file${count !== 1 ? 's' : ''} were uploaded this week on ${APP}.`, body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. File Published Alert — sent when a file is marked PUBLISHED
// ─────────────────────────────────────────────────────────────────────────────
export async function sendFilePublishedEmail(
  recipientEmails: string[],
  opts: {
    fileName: string
    fileId:   string
    eventName?: string
    publishedBy: string
  },
): Promise<void> {
  if (recipientEmails.length === 0) return

  const link = `${APP_URL}/media/${opts.fileId}`

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.6px;">File Published</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">A file has been published</h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      <strong>${esc(opts.publishedBy)}</strong> has marked a file as <strong>Published</strong>:
    </p>
    ${infoBox(`
      <strong>File:</strong>&nbsp;${esc(opts.fileName)}<br>
      ${opts.eventName ? `<strong>Event:</strong>&nbsp;${esc(opts.eventName)}<br>` : ''}
      <strong>Published by:</strong>&nbsp;${esc(opts.publishedBy)}
    `)}
    ${btn('View File →', link)}
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">Manage notification preferences at <a href="${APP_URL}/notifications" style="color:#6366f1;">${APP_URL}/notifications</a>.</p>`

  await sendEmail({
    to:      recipientEmails,
    subject: `[${APP}] File Published: ${opts.fileName}`,
    html:    layout(`"${opts.fileName}" has been published on ${APP}.`, body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Storage Threshold Alert — sent to admins when R2 usage crosses threshold
// ─────────────────────────────────────────────────────────────────────────────
export async function sendStorageThresholdEmail(
  adminEmails: string[],
  opts: {
    pct:          number
    totalGB:      number
    limitGB:      number
    thresholdPct: number
  },
): Promise<void> {
  if (adminEmails.length === 0) return

  const usedStr  = opts.totalGB.toFixed(2)
  const limitStr = opts.limitGB.toFixed(0)

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.6px;">Storage Alert</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">
      Storage at ${opts.pct}%
    </h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      R2 storage usage has crossed the <strong>${opts.thresholdPct}%</strong> threshold.
    </p>
    ${infoBox(`
      <strong>Used:</strong>&nbsp;${usedStr}&nbsp;GB<br>
      <strong>Limit:</strong>&nbsp;${limitStr}&nbsp;GB<br>
      <strong>Usage:</strong>&nbsp;${opts.pct}%
    `)}
    <p style="margin:0 0 18px;font-size:15px;color:#334155;line-height:1.6;">
      Consider purging old files from the Trash or archiving unused media to free up space.
    </p>
    ${btn('Go to Trash →', `${APP_URL}/admin/trash`)}
    <p style="margin:14px 0 0;font-size:12px;color:#94a3b8;">
      You can adjust the alert threshold via the <code>STORAGE_THRESHOLD_PERCENT</code> and
      <code>STORAGE_LIMIT_GB</code> environment variables.
    </p>`

  await sendEmail({
    to:      adminEmails,
    subject: `[${APP}] ⚠️ Storage Alert — ${opts.pct}% used`,
    html:    layout(`R2 storage is at ${opts.pct}% (${usedStr} GB / ${limitStr} GB).`, body),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Admin Purge Alert — batch summary sent to all admins after cron purge
// ─────────────────────────────────────────────────────────────────────────────
export async function sendAdminPurgeAlert(
  adminEmails: string[],
  purgedFiles: PurgedFileInfo[],
  ranAt:       Date,
): Promise<void> {
  if (adminEmails.length === 0 || purgedFiles.length === 0) return

  const count   = purgedFiles.length
  const dateStr = ranAt.toUTCString()

  const rows = purgedFiles.map(f => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">${esc(f.fileName)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;">${esc(f.eventName ?? '—')}</td>
    </tr>`).join('')

  const body = `
    <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.6px;">Automated Purge Report</p>
    <h1 style="margin:0 0 18px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">
      ${count}&nbsp;file${count !== 1 ? 's' : ''} permanently deleted
    </h1>
    <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
      The daily purge job ran on <strong>${esc(dateStr)}</strong> and permanently removed
      ${count}&nbsp;file${count !== 1 ? 's' : ''} from storage. These files had been in the
      Trash for over 30&nbsp;days. <strong>This cannot be undone.</strong>
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:0 0 18px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">File name</th>
          <th style="padding:9px 12px;text-align:left;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Event</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${infoBox(`Activity log entries for these files are retained permanently and can be reviewed in the <a href="${APP_URL}/admin/logs" style="color:#6366f1;">Activity Log</a>.`)}
    <p style="margin:0;font-size:13px;color:#94a3b8;">This is an automated report sent to all administrators.</p>`

  await sendEmail({
    to:      adminEmails,
    subject: `[${APP}] ${count} file${count !== 1 ? 's' : ''} permanently purged`,
    html:    layout(`${count} file${count !== 1 ? 's' : ''} were permanently removed from the trash.`, body),
  })
}
