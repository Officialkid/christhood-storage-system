import { NextRequest, NextResponse } from 'next/server'
import { getServerSession }          from 'next-auth'
import { authOptions }               from '@/lib/auth'
import { prisma }                    from '@/lib/prisma'

/**
 * GET /api/admin/share-links
 * Admin-only: list all share links across all creators.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Optional filter by revocation status
  const showRevoked = req.nextUrl.searchParams.get('showRevoked') === 'true'

  const links = await prisma.shareLink.findMany({
    where: showRevoked ? {} : { isRevoked: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, token: true, linkType: true, title: true,
      maxDownloads: true, downloadCount: true,
      expiresAt: true, isRevoked: true, createdAt: true,
      pinHash: true,
      createdBy: { select: { id: true, username: true, name: true, email: true } },
      _count: { select: { accesses: true } },
    },
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return NextResponse.json({
    links: links.map(({ pinHash, _count, ...l }) => ({
      ...l,
      hasPin:      !!pinHash,
      url:         `${appUrl}/share/${l.token}`,
      accessCount: _count.accesses,
      isExpired:   l.expiresAt < new Date(),
    })),
  })
}
