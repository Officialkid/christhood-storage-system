import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { prisma }   from '@/lib/prisma'

export async function PATCH(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: unknown; phone?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const updates: { name?: string; phone?: string | null } = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }
    if (body.name.trim().length > 80) {
      return NextResponse.json({ error: 'Name must be 80 characters or fewer' }, { status: 400 })
    }
    updates.name = body.name.trim()
  }

  if ('phone' in body) {
    if (body.phone === null || body.phone === '') {
      updates.phone = null
    } else if (typeof body.phone === 'string') {
      const clean = body.phone.trim()
      if (clean.length > 30) {
        return NextResponse.json({ error: 'Phone must be 30 characters or fewer' }, { status: 400 })
      }
      updates.phone = clean || null
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where:  { id: token.id as string },
    data:   updates,
    select: { id: true, name: true, phone: true },
  })

  return NextResponse.json(user)
}
