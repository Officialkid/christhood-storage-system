import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/prisma'
import { sendEmail }                 from '@/lib/email'

const SHARE_BASE = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmmschristhood.org'

function formatBytes(bytes: bigint): string {
  const n = Number(bytes)
  if (n < 1024)        return n + ' B'
  if (n < 1024 ** 2)  return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 ** 3)  return (n / 1024 ** 2).toFixed(1) + ' MB'
  return (n / 1024 ** 3).toFixed(2) + ' GB'
}

export async function POST(req: NextRequest) {
  let body: { recipientEmail?: unknown; tokens?: unknown; senderTitle?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const { recipientEmail, tokens, senderTitle } = body

  if (typeof recipientEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'Valid recipientEmail is required.' }, { status: 400 })
  }
  if (!Array.isArray(tokens) || tokens.length === 0 || tokens.length > 20) {
    return NextResponse.json({ error: 'tokens must be a non-empty array (max 20).' }, { status: 400 })
  }
  if (!tokens.every((t: unknown) => typeof t === 'string')) {
    return NextResponse.json({ error: 'Each token must be a string.' }, { status: 400 })
  }

  const records = await prisma.publicShareUpload.findMany({
    where: {
      token:     { in: tokens as string[] },
      isReady:   true,
      expiresAt: { gt: new Date() },
    },
    select: { token: true, originalName: true, fileSize: true, title: true, message: true, expiresAt: true },
  })

  if (records.length === 0) {
    return NextResponse.json({ error: 'No ready share records found for those tokens.' }, { status: 404 })
  }

  const label    = typeof senderTitle === 'string' && senderTitle.trim() ? senderTitle.trim() : 'Someone'
  const expiry   = records[0].expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const noun     = records.length > 1 ? `${records.length} files` : 'a file'
  const batchUrl = records.length > 1
    ? SHARE_BASE + '/public-share/batch?tokens=' + records.map(r => r.token).join(',')
    : null

  // Individual file rows — just use the filename (no title prefix)
  const fileRows = records.map(r => {
    const url = SHARE_BASE + '/public-share/' + r.token
    return [
      '<tr>',
      '  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">',
      '    <span style="display:block;font-size:14px;font-weight:600;color:#111827;">' + r.originalName + '</span>',
      '    <span style="font-size:12px;color:#9ca3af;">' + formatBytes(r.fileSize) + '</span>',
      '  </td>',
      '  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;text-align:right;">',
      '    <a href="' + url + '" style="display:inline-block;background:#4f46e5;color:white;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;">Download</a>',
      '  </td>',
      '</tr>',
    ].join('')
  }).join('')

  const message = (records[0].message ?? '') as string
  const msgHtml = message
    ? '<div style="background:#f8fafc;border-left:3px solid #4f46e5;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:24px;">'
      + '<p style="color:#374151;font-size:14px;margin:0;line-height:1.5;">' + message + '</p></div>'
    : ''

  // "Download All" CTA — only shown when there are multiple files
  const batchCta = batchUrl
    ? '<div style="text-align:center;margin:0 0 28px;">'
      + '<a href="' + batchUrl + '" style="display:inline-block;background:#4f46e5;color:white;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:-0.01em;">'
      + '&#8595; Download all ' + records.length + ' files</a>'
      + '<p style="margin:10px 0 0;color:#9ca3af;font-size:12px;">Or download files individually below</p>'
      + '</div>'
    : ''

  const html = [
    '<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>',
    '<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,sans-serif;">',
    '  <div style="max-width:560px;margin:40px auto;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden;">',
    '    <div style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:32px 40px;text-align:center;">',
    '      <p style="margin:0 0 6px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Christhood ShareLink</p>',
    '      <div style="font-size:36px;margin-bottom:10px;">&#128193;</div>',
    '      <h1 style="margin:0;color:white;font-size:22px;font-weight:700;line-height:1.3;">' + label + ' shared ' + noun + ' with you</h1>',
    '    </div>',
    '    <div style="padding:32px 40px;">',
    '      ' + msgHtml,
    '      ' + batchCta,
    '      <table style="width:100%;border-collapse:collapse;">' + fileRows + '</table>',
    '      <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">Links expire on <strong>' + expiry + '</strong>. Files are permanently deleted after that.</p>',
    '    </div>',
    '    <div style="background:#f3f4f6;padding:20px 40px;text-align:center;">',
    '      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent via <a href="' + SHARE_BASE + '/public-share" style="color:#4f46e5;font-weight:600;">Christhood ShareLink</a></p>',
    '    </div>',
    '  </div>',
    '</body></html>',
  ].join('')

  await sendEmail({
    to:      recipientEmail,
    subject: label + ' shared ' + noun + ' with you',
    html,
  })

  return NextResponse.json({ ok: true, sent: records.length })
}
