import { notFound }       from 'next/navigation'
import { cookies }        from 'next/headers'
import { createHmac }     from 'node:crypto'
import { prisma }         from '@/lib/prisma'
import { getGalleryPublicUrl } from '@/lib/gallery/gallery-r2'
import { GalleryView }    from './GalleryView'
import type { Metadata }  from 'next'

export const dynamic = 'force-dynamic'

interface Props { params: { slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gallery = await prisma.publicGallery.findUnique({
    where: { slug: params.slug, status: 'PUBLISHED' },
    select: { title: true, description: true, coverImageKey: true },
  })
  if (!gallery) return { title: 'Gallery not found' }
  return {
    title: `${gallery.title} — Christhood`,
    description: gallery.description ?? `Photo gallery from Christhood`,
    openGraph: {
      images: gallery.coverImageKey
        ? [getGalleryPublicUrl(gallery.coverImageKey)]
        : [],
    },
  }
}

/** Build the deterministic password-access token for this gallery */
function buildGalleryToken(galleryId: string): string {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET!)
    .update(galleryId)
    .digest('hex')
}

export default async function GallerySlugPage({ params }: Props) {
  const gallery = await prisma.publicGallery.findUnique({
    where: { slug: params.slug, status: 'PUBLISHED' },
    include: {
      sections: {
        orderBy: { sortOrder: 'asc' },
        include: {
          files: {
            where:   { isVisible: true, fileType: 'PHOTO' },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
  })
  if (!gallery) notFound()

  // ── Password verification ──────────────────────────────────────────────────
  let passwordVerified = !gallery.isPasswordProtected
  if (gallery.isPasswordProtected) {
    const jar   = cookies()
    const token = jar.get(`g_${gallery.id}`)?.value
    const expected = buildGalleryToken(gallery.id)
    passwordVerified = token === expected
  }

  // ── Serialize (only send file data if password is verified) ───────────────
  const serializeFiles = (files: typeof gallery.sections[0]['files']) =>
    passwordVerified
      ? files.map(f => ({
          id:           f.id,
          originalName: f.originalName,
          thumbnailUrl: getGalleryPublicUrl(f.thumbnailKey),
          previewUrl:   getGalleryPublicUrl(f.previewKey),
          width:        f.width,
          height:       f.height,
        }))
      : []

  const serialized = {
    id:                     gallery.id,
    slug:                   gallery.slug,
    title:                  gallery.title,
    description:            gallery.description,
    coverUrl:               gallery.coverImageKey
                              ? getGalleryPublicUrl(gallery.coverImageKey)
                              : null,
    allowDownload:          gallery.allowDownload,
    requireNameForDownload: gallery.requireNameForDownload,
    isPasswordProtected:    gallery.isPasswordProtected,
    totalPhotos:            gallery.totalPhotos,
    sections: gallery.sections.map(s => ({
      id:         s.id,
      title:      s.title,
      date:       s.date?.toISOString() ?? null,
      photoCount: s.photoCount,
      files:      serializeFiles(s.files),
    })),
  }

  return (
    <GalleryView
      gallery={serialized}
      passwordVerified={passwordVerified}
    />
  )
}
