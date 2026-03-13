import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPresignedDownloadUrl } from '@/lib/r2'
import { StatusBadge } from '@/components/StatusBadge'
import { StatusChangeDropdown } from '@/components/StatusChangeDropdown'
import { VersionHistoryPanelWrapper } from '@/components/VersionHistoryPanelWrapper'
import { TagInput } from '@/components/TagInput'
import { TagPill } from '@/components/TagPill'
import type { AppRole } from '@/types'
import Link from 'next/link'
import ShareButton from '@/components/ShareButton'

/**
 * /media/[fileId] — File detail page
 * Shows preview, metadata, status control, version history.
 */
export default async function FileDetailPage({
  params,
}: {
  params: { fileId: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  const file = await prisma.mediaFile.findUnique({
    where:   { id: params.fileId },
    include: {
      uploader:  { select: { id: true, username: true, email: true } },
      event:     { select: { id: true, name: true } },
      subfolder: { select: { id: true, label: true } },
      tags:      { orderBy: { name: 'asc' } },
    },
  })

  if (!file) notFound()

  const [downloadUrl, versionCount, allTags] = await Promise.all([
    getPresignedDownloadUrl(file.r2Key),
    prisma.fileVersion.count({ where: { mediaFileId: file.id } }),
    prisma.tag.findMany({ orderBy: { name: 'asc' } }),
  ])

  const role    = session.user.role as AppRole
  const isVideo = file.fileType === 'VIDEO'
  const kb      = Number(file.fileSize) / 1024
  const size    = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`

  function fmtDate(d: Date) {
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Back link ── */}
      <Link
        href="/media"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200
                   transition-colors"
      >
        ← Back to Media Library
      </Link>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white truncate">{file.originalName}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {file.event?.name}
            {file.subfolder ? <> / {file.subfolder.label}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={file.status as string} size="md" />
          {role !== 'UPLOADER' && (
            <ShareButton
              linkType="FILE"
              fileId={file.id}
              defaultTitle={file.originalName}
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Left column: preview + meta ── */}
        <div className="space-y-5">
          {/* Preview */}
          <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800
                          aspect-video flex items-center justify-center">
            {isVideo ? (
              <video
                src={downloadUrl}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={downloadUrl}
                alt={file.originalName}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          {/* Meta table */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-800">
                {[
                  ['Type',       file.fileType],
                  ['Size',       size],
                  ['Status',     <StatusBadge key="s" status={file.status as string} size="sm" />],
                  ['Uploaded by', file.uploader.username ?? file.uploader.email],
                  ['Uploaded',   fmtDate(file.createdAt)],
                  ['Last updated', fmtDate(file.updatedAt)],
                  ['Versions',   versionCount === 0 ? 'Original only' : `${versionCount + 1} version${versionCount > 0 ? 's' : ''}`],
                ].map(([label, value]) => (
                  <tr key={String(label)} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-slate-500 w-36 font-medium">{label}</td>
                    <td className="px-4 py-2.5 text-slate-200">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tags panel */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Tags</p>
            {role === 'UPLOADER' ? (
              file.tags.length === 0
                ? <p className="text-xs text-slate-600 italic">No tags applied</p>
                : <div className="flex flex-wrap gap-1.5">
                    {file.tags.map((t) => <TagPill key={t.id} name={t.name} />)}
                  </div>
            ) : (
              <TagInput
                targetType="file"
                targetId={file.id}
                initialTags={file.tags.map((t) => ({ id: t.id, name: t.name }))}
                allTags={allTags.map((t) => ({ id: t.id, name: t.name }))}
                canEdit={true}
              />
            )}
          </div>

          {/* Status change — only for EDITOR/ADMIN */}
          {role !== 'UPLOADER' && (
            <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">
                Change Status
              </p>
              {/* We wrap in a div to make the dropdown layout wider on the detail page */}
              <div className="max-w-xs">
                <StatusChangeDropdown
                  fileId={file.id}
                  currentStatus={file.status as string}
                  userRole={role}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: version history + upload ── */}
        <div className="space-y-5">
          <VersionHistoryPanelWrapper
            fileId={file.id}
            userRole={role}
            originalName={file.originalName}
          />
        </div>
      </div>
    </div>
  )
}
