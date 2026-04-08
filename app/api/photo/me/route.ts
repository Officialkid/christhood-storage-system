import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGallerySession, createGalleryToken, setSessionCookie } from '@/lib/photo-gallery/session'

export async function GET(req: NextRequest) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.photoUser.findUnique({
    where:  { id: session.userId },
    select: {
      id:                true,
      username:          true,
      displayName:       true,
      email:             true,
      avatarUrl:         true,
      bio:               true,
      planTier:          true,
      isSuperAdmin:      true,
      storageUsedBytes:  true,
      storageLimitBytes: true,
      createdAt:         true,
      _count:            { select: { collections: true } },
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 })

  return NextResponse.json({ user })
}

export async function PUT(req: NextRequest) {
  const session = await getGallerySession(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { displayName, bio, avatarUrl } = await req.json() as {
    displayName?: string; bio?: string; avatarUrl?: string
  }

  const user = await prisma.photoUser.update({
    where: { id: session.userId },
    data: {
      ...(displayName !== undefined && { displayName: displayName.trim().slice(0, 60) }),
      ...(bio         !== undefined && { bio: bio.trim().slice(0, 300) }),
      ...(avatarUrl   !== undefined && { avatarUrl }),
    },
  })

  // Re-issue token with updated display info
  const newToken = await createGalleryToken({
    userId:       user.id,
    username:     user.username,
    email:        user.email,
    displayName:  user.displayName,
    planTier:     user.planTier,
    isSuperAdmin: user.isSuperAdmin,
    avatarUrl:    user.avatarUrl,
  })

  const res = NextResponse.json({
    user: {
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      avatarUrl:   user.avatarUrl,
      bio:         user.bio,
    },
  })
  setSessionCookie(res, newToken)
  return res
}
