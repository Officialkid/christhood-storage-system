import { NextRequest, NextResponse } from 'next/server'

/** GET /api/push/vapid-key — returns the VAPID public key for the front-end */
export async function GET(_req: NextRequest) {
  const key = process.env.VAPID_PUBLIC_KEY
  if (!key) return NextResponse.json({ error: 'VAPID not configured' }, { status: 503 })
  return NextResponse.json({ publicKey: key })
}
