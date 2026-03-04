'use client'

/**
 * VersionHistoryPanelWrapper
 * Client shell that wires VersionUploadPanel → VersionHistoryPanel.
 * When a new version is uploaded, the history panel refreshes automatically
 * via the shared `refreshKey` state.
 */

import { useState } from 'react'
import { VersionUploadPanel } from '@/components/VersionUploadPanel'
import { VersionHistoryPanel } from '@/components/VersionHistoryPanel'
import type { AppRole } from '@/types'

interface Props {
  fileId:       string
  userRole:     AppRole
  originalName?: string
}

export function VersionHistoryPanelWrapper({ fileId, userRole, originalName = '' }: Props) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-5">
      <VersionHistoryPanel
        fileId={fileId}
        userRole={userRole}
        externalRefreshKey={refreshKey}
      />

      <VersionUploadPanel
        fileId={fileId}
        originalName={originalName}
        userRole={userRole}
        onVersionUploaded={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  )
}
