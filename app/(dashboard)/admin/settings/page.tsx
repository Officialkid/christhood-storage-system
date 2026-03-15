'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession }   from 'next-auth/react'
import { useRouter }    from 'next/navigation'
import {
  Settings, Archive, Save, Check, Loader2, AlertTriangle, Info,
  HardDrive, Users, Bell, Bot, ArrowLeftRight, Wrench,
  Globe, Upload as UploadIcon, ShieldCheck, Mail, Zap,
  RefreshCw, Database, Trash2, Download, AlertOctagon,
  CheckCircle2, XCircle, Clock, Play, FileJson,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface AppSettings {
  // General
  system_name:              string
  system_tagline:           string
  organization_name:        string
  admin_contact_email:      string
  system_timezone:          string
  date_format:              string
  language:                 string
  logo_url:                 string
  // Storage
  archive_threshold_months: string
  trash_retention_days:     string
  max_file_size_mb:         string
  allowed_photo_types:      string
  allowed_video_types:      string
  allowed_doc_types:        string
  storage_warning_gb:       string
  duplicate_detection:      string
  auto_thumbnails:          string
  // User & Access
  default_role:               string
  allow_self_registration:    string
  session_timeout_minutes:    string
  max_login_attempts:         string
  lockout_duration_minutes:   string
  password_min_length:        string
  password_require_uppercase: string
  password_require_number:    string
  password_require_special:   string
  // Notifications
  from_email:            string
  from_name:             string
  reply_to_email:        string
  email_footer_text:     string
  weekly_digest_enabled: string
  digest_time:           string
  // AI
  zara_enabled:              string
  zara_conversation_logging: string
  zara_log_retention_days:   string
  zara_rate_limit_per_hour:  string
  zara_display_name:         string
  zara_greeting:             string
  // Transfers
  transfer_expiry_pending_days:   string
  transfer_expiry_completed_days: string
  max_transfer_size_gb:           string
  share_link_default_expiry_days: string
  share_link_max_downloads:       string
  [key: string]: string
}

type Tab = 'general' | 'storage' | 'access' | 'notifications' | 'ai' | 'transfers' | 'maintenance'

interface MaintenanceData {
  health: { db: boolean; r2: boolean; email: boolean; ai: boolean; push: boolean }
  stats:  { users: number; files: number; events: number; trashed: number; logs: number }
  jobs:   Record<string, { lastRun: string | null }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI helpers
// ─────────────────────────────────────────────────────────────────────────────

const FIELD = `w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-white
               placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/60
               focus:border-transparent transition`

const FIELD_SM = `w-28 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-transparent transition
                  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                  [&::-webkit-inner-spin-button]:appearance-none`

const SELECT = `bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                focus:outline-none focus:ring-2 focus:ring-indigo-500/60 focus:border-transparent transition`

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-400 mb-1.5">{children}</label>
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 mt-2 rounded-lg bg-slate-800/40 border border-slate-700/30 px-3 py-2.5">
      <Info className="w-3.5 h-3.5 text-slate-500 mt-0.5 shrink-0" />
      <p className="text-xs text-slate-500 leading-relaxed">{children}</p>
    </div>
  )
}

function SectionCard({ icon, title, desc, children }: {
  icon:     React.ReactNode
  title:    string
  desc:     string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
                  focus:outline-none focus:ring-2 focus:ring-indigo-500/60
                  ${value ? 'bg-indigo-600' : 'bg-slate-700'}
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
                    ${value ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

function SaveBtn({ saving, saved, label = 'Save Settings' }: { saving: boolean; saved: boolean; label?: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="submit"
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                   bg-gradient-to-r from-indigo-600 to-violet-600
                   hover:from-indigo-500 hover:to-violet-500
                   disabled:opacity-60 disabled:cursor-not-allowed
                   text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving…' : label}
      </button>
      {saved && (
        <span className="flex items-center gap-1.5 text-sm text-emerald-400">
          <Check className="w-4 h-4" /> Saved
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminSettingsPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [s,       setS]       = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('general')
  const [error,   setError]   = useState<string | null>(null)

  // per-tab save feedback
  const [saving, setSaving] = useState<Partial<Record<Tab, boolean>>>({})
  const [saved,  setSaved]  = useState<Partial<Record<Tab, boolean>>>({})

  // Maintenance data
  const [maint,       setMaint]       = useState<MaintenanceData | null>(null)
  const [maintLoading, setMaintLoading] = useState(false)
  const [jobRunning,  setJobRunning]  = useState<string | null>(null)
  const [jobResult,   setJobResult]   = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState<Record<string, string>>({})
  const [testEmailState, setTestEmailState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [testEmailMsg,   setTestEmailMsg]   = useState('')
  const [logoUploading,  setLogoUploading]  = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session?.user || session.user.role !== 'ADMIN') router.replace('/dashboard')
  }, [authStatus, session, router])

  // ── Load settings ─────────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/admin/settings')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setS(data.settings as AppSettings)
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  // ── Load maintenance data when on that tab ────────────────────────────────
  const fetchMaint = useCallback(async () => {
    setMaintLoading(true)
    try {
      const res  = await fetch('/api/admin/maintenance')
      const data = await res.json()
      if (res.ok) setMaint(data)
    } finally { setMaintLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'maintenance') fetchMaint() }, [tab, fetchMaint])

  // ── Generic save helper ───────────────────────────────────────────────────
  async function saveTab(t: Tab, patch: Record<string, string>) {
    setSaving(p => ({ ...p, [t]: true }))
    setError(null)
    try {
      const res  = await fetch('/api/admin/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      setS(data.settings)
      setSaved(p => ({ ...p, [t]: true }))
      setTimeout(() => setSaved(p => ({ ...p, [t]: false })), 3000)
    } catch (err: any) { setError(err.message) }
    finally { setSaving(p => ({ ...p, [t]: false })) }
  }

  function f(key: keyof AppSettings) { return s?.[key] ?? '' }
  function b(key: keyof AppSettings) { return f(key) !== 'false' }
  function set(key: keyof AppSettings, value: string) {
    setS(prev => prev ? { ...prev, [key]: value } : prev)
  }
  function toggle(key: keyof AppSettings) { set(key, b(key) ? 'false' : 'true') }

  // ── Logo upload ───────────────────────────────────────────────────────────
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res  = await fetch('/api/admin/settings/logo', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setS(prev => prev ? { ...prev, logo_url: data.url } : prev)
    } catch (err: any) { setError(err.message) }
    finally { setLogoUploading(false) }
  }

  // ── Test email ────────────────────────────────────────────────────────────
  async function sendTestEmail() {
    setTestEmailState('sending'); setTestEmailMsg('')
    try {
      const res  = await fetch('/api/admin/test-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setTestEmailState('ok'); setTestEmailMsg('Test email sent to your account.')
    } catch (err: any) { setTestEmailState('err'); setTestEmailMsg(err.message) }
  }

  // ── Run maintenance job ───────────────────────────────────────────────────
  async function runJob(action: string, label: string) {
    setJobRunning(action); setJobResult(null)
    try {
      const res  = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Job failed')
      const detail = data.purged !== undefined ? `Purged ${data.purged} item(s).`
                   : data.archived !== undefined ? `Archived ${data.archived} file(s).`
                   : data.expired !== undefined ? `Expired ${data.expired} transfer(s).`
                   : data.deleted !== undefined ? `Deleted ${data.deleted} log(s).`
                   : 'Done.'
      setJobResult(`✓ ${label}: ${detail}`)
      fetchMaint()
    } catch (err: any) { setJobResult(`✗ ${label} failed: ${err.message}`) }
    finally { setJobRunning(null) }
  }

  // ── Danger zone actions ───────────────────────────────────────────────────
  async function dangerAction(action: string, label: string) {
    const confirm = confirmText[action] ?? ''
    if (confirm !== 'CONFIRM') { setError('Type CONFIRM in the box before proceeding.'); return }
    setJobRunning(action); setJobResult(null); setError(null)
    try {
      const res  = await fetch('/api/admin/maintenance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, confirm }) })

      if (action === 'export_data' && res.ok) {
        const blob = await res.blob()
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a'); a.href = url; a.download = 'christhood-export.json'; a.click()
        URL.revokeObjectURL(url)
        setJobResult('✓ Export downloaded.')
      } else {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed')
        setJobResult(`✓ ${label} complete. Files: ${data.deletedFiles ?? 0}, Users: ${data.deletedUsers ?? 0}`)
        fetchMaint()
      }
    } catch (err: any) { setError(err.message) }
    finally { setJobRunning(null) }
  }

  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'loading' || !session?.user) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 text-slate-500 animate-spin" /></div>
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'general',       label: 'General',           icon: <Globe className="w-4 h-4" /> },
    { id: 'storage',       label: 'Storage & Files',   icon: <HardDrive className="w-4 h-4" /> },
    { id: 'access',        label: 'User & Access',     icon: <Users className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications',     icon: <Bell className="w-4 h-4" /> },
    { id: 'ai',            label: 'AI Assistant',      icon: <Bot className="w-4 h-4" /> },
    { id: 'transfers',     label: 'Transfers',         icon: <ArrowLeftRight className="w-4 h-4" /> },
    { id: 'maintenance',   label: 'Maintenance',       icon: <Wrench className="w-4 h-4" /> },
  ]

  return (
    <div className="max-w-4xl space-y-6">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
          <Settings className="w-5 h-5 text-slate-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">System Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Global configuration for Christhood CMMS</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300">✕</button>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-slate-900/60 border border-slate-800/60">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all
                        ${tab === t.id
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading settings…</span>
        </div>
      ) : (
        <>
          {/* ════════════════════════════════════════════════════════════════
              TAB 1 — GENERAL
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'general' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('general', {
              system_name:         f('system_name'),
              system_tagline:      f('system_tagline'),
              organization_name:   f('organization_name'),
              admin_contact_email: f('admin_contact_email'),
              system_timezone:     f('system_timezone'),
              date_format:         f('date_format'),
              language:            f('language'),
            })}} className="space-y-4">
              <SectionCard icon={<Globe className="w-4 h-4 text-indigo-400" />} title="System Identity" desc="Branding and display names shown throughout the app">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><Label>System Name</Label><input className={FIELD} value={f('system_name')} onChange={e=>set('system_name',e.target.value)} /></div>
                  <div><Label>System Tagline</Label><input className={FIELD} value={f('system_tagline')} onChange={e=>set('system_tagline',e.target.value)} /></div>
                  <div><Label>Organization Name</Label><input className={FIELD} value={f('organization_name')} onChange={e=>set('organization_name',e.target.value)} /></div>
                  <div><Label>Admin Contact Email</Label><input type="email" className={FIELD} placeholder="help@example.com" value={f('admin_contact_email')} onChange={e=>set('admin_contact_email',e.target.value)} /></div>
                </div>
              </SectionCard>

              <SectionCard icon={<Globe className="w-4 h-4 text-sky-400" />} title="Localisation" desc="Timezone, date format and language">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>System Timezone</Label>
                    <select className={SELECT + ' w-full'} value={f('system_timezone')} onChange={e=>set('system_timezone',e.target.value)}>
                      {['Africa/Nairobi','Africa/Lagos','Africa/Accra','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Kolkata','UTC'].map(tz=>(
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Date Format</Label>
                    <select className={SELECT + ' w-full'} value={f('date_format')} onChange={e=>set('date_format',e.target.value)}>
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div>
                    <Label>Language</Label>
                    <select className={SELECT + ' w-full'} value={f('language')} onChange={e=>set('language',e.target.value)}>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<UploadIcon className="w-4 h-4 text-violet-400" />} title="Logo" desc="Displayed on the login page and in email headers (PNG, JPG, WebP, SVG — max 2 MB)">
                <div className="flex items-center gap-4">
                  {f('logo_url') ? (
                    <img src={f('logo_url')} alt="Logo" className="h-14 w-auto rounded-lg object-contain bg-slate-800 px-2" />
                  ) : (
                    <div className="h-14 w-24 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-xs">No logo</div>
                  )}
                  <div>
                    <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={handleLogoUpload} />
                    <button type="button" onClick={() => logoRef.current?.click()} disabled={logoUploading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition disabled:opacity-50">
                      {logoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadIcon className="w-4 h-4" />}
                      {logoUploading ? 'Uploading…' : 'Upload Logo'}
                    </button>
                    {f('logo_url') && <p className="text-xs text-slate-500 mt-1">Upload a new file to replace the current logo.</p>}
                  </div>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.general} saved={!!saved.general} label="Save General Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 2 — STORAGE & FILES
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'storage' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('storage', {
              archive_threshold_months: f('archive_threshold_months'),
              trash_retention_days:     f('trash_retention_days'),
              max_file_size_mb:         f('max_file_size_mb'),
              allowed_photo_types:      f('allowed_photo_types'),
              allowed_video_types:      f('allowed_video_types'),
              allowed_doc_types:        f('allowed_doc_types'),
              storage_warning_gb:       f('storage_warning_gb'),
              duplicate_detection:      f('duplicate_detection'),
              auto_thumbnails:          f('auto_thumbnails'),
            })}} className="space-y-4">

              <SectionCard icon={<Archive className="w-4 h-4 text-amber-400" />} title="Retention Policies" desc="Control how long files stay before archiving or permanent deletion">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Archive Threshold (months)</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={120} className={FIELD_SM} value={f('archive_threshold_months')} onChange={e=>set('archive_threshold_months',e.target.value)} />
                      <span className="text-xs text-slate-500">months</span>
                    </div>
                    <Hint>PUBLISHED/EDITED files older than this are auto-archived daily.</Hint>
                  </div>
                  <div>
                    <Label>Trash Retention (days)</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={7} max={90} className={FIELD_SM} value={f('trash_retention_days')} onChange={e=>set('trash_retention_days',e.target.value)} />
                      <span className="text-xs text-slate-500">days</span>
                    </div>
                    <Hint>Files in Trash are permanently purged after this many days.</Hint>
                  </div>
                  <div>
                    <Label>Max File Size (MB)</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={5000} className={FIELD_SM} value={f('max_file_size_mb')} onChange={e=>set('max_file_size_mb',e.target.value)} />
                      <span className="text-xs text-slate-500">MB</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<HardDrive className="w-4 h-4 text-sky-400" />} title="Allowed File Types" desc="File extensions accepted for upload (comma-separated, lowercase)">
                {[
                  { key: 'allowed_photo_types', label: 'Photos', hint: 'e.g. jpg,png,heic,raw,tiff' },
                  { key: 'allowed_video_types', label: 'Videos', hint: 'e.g. mp4,mov,avi,mkv' },
                  { key: 'allowed_doc_types',   label: 'Documents', hint: 'e.g. pdf,docx,xlsx,pptx' },
                ].map(({ key, label, hint }) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <input className={FIELD} placeholder={hint} value={f(key as keyof AppSettings)} onChange={e=>set(key as keyof AppSettings,e.target.value)} />
                  </div>
                ))}
                <Hint>Separate extensions with commas. Do not include dots. These must also be allowed in your R2 CORS policy.</Hint>
              </SectionCard>

              <SectionCard icon={<Zap className="w-4 h-4 text-yellow-400" />} title="Storage Options" desc="Smart upload behaviours and notifications">
                <div className="space-y-3">
                  <div>
                    <Label>Storage Warning Threshold</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} className={FIELD_SM} value={f('storage_warning_gb')} onChange={e=>set('storage_warning_gb',e.target.value)} />
                      <span className="text-xs text-slate-500">GB — notify admin when R2 usage exceeds this</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Duplicate File Detection</p>
                      <p className="text-xs text-slate-400">Warn when a file with the same name already exists in the event</p>
                    </div>
                    <Toggle value={b('duplicate_detection')} onChange={v=>set('duplicate_detection',String(v))} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Auto-generate Thumbnails</p>
                      <p className="text-xs text-slate-400">Generate preview thumbnails for video uploads</p>
                    </div>
                    <Toggle value={b('auto_thumbnails')} onChange={v=>set('auto_thumbnails',String(v))} />
                  </div>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.storage} saved={!!saved.storage} label="Save Storage Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 3 — USER & ACCESS
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'access' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('access', {
              default_role:               f('default_role'),
              allow_self_registration:    f('allow_self_registration'),
              session_timeout_minutes:    f('session_timeout_minutes'),
              max_login_attempts:         f('max_login_attempts'),
              lockout_duration_minutes:   f('lockout_duration_minutes'),
              password_min_length:        f('password_min_length'),
              password_require_uppercase: f('password_require_uppercase'),
              password_require_number:    f('password_require_number'),
              password_require_special:   f('password_require_special'),
            })}} className="space-y-4">

              <SectionCard icon={<Users className="w-4 h-4 text-violet-400" />} title="Account Defaults" desc="Defaults for new user accounts">
                <div className="space-y-3">
                  <div>
                    <Label>Default Role for New Users</Label>
                    <select className={SELECT + ' w-40'} value={f('default_role')} onChange={e=>set('default_role',e.target.value)}>
                      <option value="UPLOADER">UPLOADER</option>
                      <option value="EDITOR">EDITOR</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Allow Self-Registration</p>
                      <p className="text-xs text-slate-400">Users can create their own accounts — currently off</p>
                    </div>
                    <Toggle value={b('allow_self_registration')} onChange={v=>set('allow_self_registration',String(v))} />
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />} title="Session & Lockout" desc="Security settings for active sessions and brute-force protection">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Session Timeout (minutes)</Label>
                    <input type="number" min={5} className={FIELD_SM} value={f('session_timeout_minutes')} onChange={e=>set('session_timeout_minutes',e.target.value)} />
                  </div>
                  <div>
                    <Label>Max Login Attempts</Label>
                    <input type="number" min={3} max={50} className={FIELD_SM} value={f('max_login_attempts')} onChange={e=>set('max_login_attempts',e.target.value)} />
                  </div>
                  <div>
                    <Label>Lockout Duration (minutes)</Label>
                    <input type="number" min={1} className={FIELD_SM} value={f('lockout_duration_minutes')} onChange={e=>set('lockout_duration_minutes',e.target.value)} />
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<ShieldCheck className="w-4 h-4 text-indigo-400" />} title="Password Requirements" desc="Rules enforced at registration and password change">
                <div className="space-y-3">
                  <div>
                    <Label>Minimum Length</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={6} max={32} className={FIELD_SM} value={f('password_min_length')} onChange={e=>set('password_min_length',e.target.value)} />
                      <span className="text-xs text-slate-500">characters</span>
                    </div>
                  </div>
                  {[
                    { key: 'password_require_uppercase', label: 'Require uppercase letter' },
                    { key: 'password_require_number',    label: 'Require at least one number' },
                    { key: 'password_require_special',   label: 'Require special character (!@#$…)' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <p className="text-sm text-white">{label}</p>
                      <Toggle value={b(key as keyof AppSettings)} onChange={v=>set(key as keyof AppSettings,String(v))} />
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard icon={<ShieldCheck className="w-4 h-4 text-amber-400" />} title="Two-Factor Authentication" desc="">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium">Coming Soon</span>
                  <p className="text-xs text-slate-400">TOTP-based 2FA will be available in a future update.</p>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.access} saved={!!saved.access} label="Save Access Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 4 — NOTIFICATIONS
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'notifications' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('notifications', {
              from_email:            f('from_email'),
              from_name:             f('from_name'),
              reply_to_email:        f('reply_to_email'),
              email_footer_text:     f('email_footer_text'),
              weekly_digest_enabled: f('weekly_digest_enabled'),
              digest_time:           f('digest_time'),
            })}} className="space-y-4">

              <SectionCard icon={<Mail className="w-4 h-4 text-indigo-400" />} title="Email Provider" desc="Resend is the configured email delivery service">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    {process.env['RESEND_API_KEY'] !== undefined || true /* always show status indicator */ ? (
                      <>
                        <div className="relative">
                          <Mail className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium">Resend</p>
                          <p className="text-xs text-slate-400">Transactional email delivery</p>
                        </div>
                        <span id="email-status-badge" className="text-xs px-2 py-1 rounded-full font-medium bg-slate-700 text-slate-400">
                          Status checked at runtime
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label>From Email</Label><input type="email" className={FIELD} placeholder="noreply@yourdomain.com" value={f('from_email')} onChange={e=>set('from_email',e.target.value)} /><Hint>Must be a verified sender in your Resend account.</Hint></div>
                    <div><Label>From Name</Label><input className={FIELD} value={f('from_name')} onChange={e=>set('from_name',e.target.value)} /></div>
                    <div><Label>Reply-To Email <span className="text-slate-600">(optional)</span></Label><input type="email" className={FIELD} placeholder="admin@yourdomain.com" value={f('reply_to_email')} onChange={e=>set('reply_to_email',e.target.value)} /></div>
                  </div>
                  <div>
                    <Label>Email Footer Text</Label>
                    <textarea rows={2} className={FIELD + ' resize-none'} placeholder="Christhood CMMS · Internal use only" value={f('email_footer_text')} onChange={e=>set('email_footer_text',e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={sendTestEmail} disabled={testEmailState === 'sending'}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-indigo-500/60 transition disabled:opacity-50">
                      {testEmailState === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      Send Test Email
                    </button>
                    {testEmailMsg && (
                      <span className={`text-xs flex items-center gap-1 ${testEmailState === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {testEmailState === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {testEmailMsg}
                      </span>
                    )}
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<Zap className="w-4 h-4 text-yellow-400" />} title="Push Notifications" desc="Web Push / VAPID configuration">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <div className="flex-1">
                      <p className="text-sm text-white font-medium">VAPID Keys</p>
                      <p className="text-xs text-slate-400">Set via VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables</p>
                    </div>
                  </div>
                  <Hint>To regenerate VAPID keys, update the environment variables and redeploy. Warning: doing so will invalidate all existing push subscriptions — users will need to re-subscribe.</Hint>
                </div>
              </SectionCard>

              <SectionCard icon={<Bell className="w-4 h-4 text-sky-400" />} title="Weekly Digest" desc="Scheduled summary email sent to all active users">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Weekly Digest Email</p>
                      <p className="text-xs text-slate-400">Sent every Monday morning to all active users</p>
                    </div>
                    <Toggle value={b('weekly_digest_enabled')} onChange={v=>set('weekly_digest_enabled',String(v))} />
                  </div>
                  <div>
                    <Label>Digest Time</Label>
                    <input type="time" className={SELECT + ' w-36'} value={f('digest_time')} onChange={e=>set('digest_time',e.target.value)} />
                  </div>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.notifications} saved={!!saved.notifications} label="Save Notification Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 5 — AI ASSISTANT (ZARA)
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'ai' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('ai', {
              zara_enabled:              f('zara_enabled'),
              zara_conversation_logging: f('zara_conversation_logging'),
              zara_log_retention_days:   f('zara_log_retention_days'),
              zara_rate_limit_per_hour:  f('zara_rate_limit_per_hour'),
              zara_display_name:         f('zara_display_name'),
              zara_greeting:             f('zara_greeting'),
            })}} className="space-y-4">

              <SectionCard icon={<Bot className="w-4 h-4 text-violet-400" />} title="Zara Configuration" desc="AI assistant powered by Google Gemini">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Enable Zara</p>
                      <p className="text-xs text-slate-400">Show the AI assistant widget to all users</p>
                    </div>
                    <Toggle value={b('zara_enabled')} onChange={v=>set('zara_enabled',String(v))} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/40">
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Model</p>
                      <p className="text-sm text-white font-medium">gemini-2.0-flash</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">Gemini API Key</p>
                      <p className="text-sm font-medium text-emerald-400">
                        {/* show configured/missing at runtime */}
                        Configured via GEMINI_API_KEY env var
                      </p>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<Bot className="w-4 h-4 text-indigo-400" />} title="Personality" desc="Display name and opening greeting">
                <div className="space-y-3">
                  <div>
                    <Label>Display Name</Label>
                    <input className={FIELD + ' max-w-xs'} value={f('zara_display_name')} onChange={e=>set('zara_display_name',e.target.value)} />
                  </div>
                  <div>
                    <Label>Greeting Message</Label>
                    <textarea rows={3} className={FIELD + ' resize-none'} value={f('zara_greeting')} onChange={e=>set('zara_greeting',e.target.value)} />
                    <Hint>This is the first message Zara sends when a user opens the chat widget.</Hint>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<Database className="w-4 h-4 text-sky-400" />} title="Usage & Logging" desc="Rate limits and conversation log retention">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">Conversation Logging</p>
                      <p className="text-xs text-slate-400">Anonymised — used for quality improvement. Users can opt out in their profile.</p>
                    </div>
                    <Toggle value={b('zara_conversation_logging')} onChange={v=>set('zara_conversation_logging',String(v))} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Log Retention</Label>
                      <select className={SELECT + ' w-full'} value={f('zara_log_retention_days')} onChange={e=>set('zara_log_retention_days',e.target.value)}>
                        <option value="30">30 days</option>
                        <option value="60">60 days</option>
                        <option value="90">90 days</option>
                      </select>
                    </div>
                    <div>
                      <Label>Rate Limit per User</Label>
                      <div className="flex items-center gap-2">
                        <input type="number" min={5} max={200} className={FIELD_SM} value={f('zara_rate_limit_per_hour')} onChange={e=>set('zara_rate_limit_per_hour',e.target.value)} />
                        <span className="text-xs text-slate-500">messages / hour</span>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.ai} saved={!!saved.ai} label="Save AI Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 6 — TRANSFERS & COMMUNICATIONS
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'transfers' && s && (
            <form onSubmit={e => { e.preventDefault(); saveTab('transfers', {
              transfer_expiry_pending_days:   f('transfer_expiry_pending_days'),
              transfer_expiry_completed_days: f('transfer_expiry_completed_days'),
              max_transfer_size_gb:           f('max_transfer_size_gb'),
              share_link_default_expiry_days: f('share_link_default_expiry_days'),
              share_link_max_downloads:       f('share_link_max_downloads'),
            })}} className="space-y-4">

              <SectionCard icon={<ArrowLeftRight className="w-4 h-4 text-violet-400" />} title="Transfer Expiry" desc="How long transfer records persist before automatic purge">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Pending Transfer Expiry</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={7} max={365} className={FIELD_SM} value={f('transfer_expiry_pending_days')} onChange={e=>set('transfer_expiry_pending_days',e.target.value)} />
                      <span className="text-xs text-slate-500">days</span>
                    </div>
                    <Hint>Transfers not responded to will expire after this many days.</Hint>
                  </div>
                  <div>
                    <Label>Completed Transfer Expiry</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={7} max={365} className={FIELD_SM} value={f('transfer_expiry_completed_days')} onChange={e=>set('transfer_expiry_completed_days',e.target.value)} />
                      <span className="text-xs text-slate-500">days after completion</span>
                    </div>
                  </div>
                  <div>
                    <Label>Max Transfer Size</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={100} className={FIELD_SM} value={f('max_transfer_size_gb')} onChange={e=>set('max_transfer_size_gb',e.target.value)} />
                      <span className="text-xs text-slate-500">GB per transfer</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard icon={<ArrowLeftRight className="w-4 h-4 text-sky-400" />} title="Share Links" desc="External share link defaults">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Default Expiry</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={1} max={365} className={FIELD_SM} value={f('share_link_default_expiry_days')} onChange={e=>set('share_link_default_expiry_days',e.target.value)} />
                      <span className="text-xs text-slate-500">days</span>
                    </div>
                  </div>
                  <div>
                    <Label>Default Max Downloads</Label>
                    <div className="flex items-center gap-2">
                      <input type="number" min={0} className={FIELD_SM} value={f('share_link_max_downloads')} onChange={e=>set('share_link_max_downloads',e.target.value)} />
                      <span className="text-xs text-slate-500">0 = unlimited</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SaveBtn saving={!!saving.transfers} saved={!!saved.transfers} label="Save Transfer Settings" />
            </form>
          )}

          {/* ════════════════════════════════════════════════════════════════
              TAB 7 — MAINTENANCE
          ════════════════════════════════════════════════════════════════ */}
          {tab === 'maintenance' && (
            <div className="space-y-4">
              {maintLoading ? (
                <div className="flex items-center gap-2 text-slate-500 py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span></div>
              ) : maint ? (
                <>
                  {/* ── System Status ───────────────────────────────────── */}
                  <SectionCard icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} title="System Status" desc="Connectivity and configuration of all subsystems">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { key: 'db',    label: 'Database',            ok: maint.health.db },
                        { key: 'r2',    label: 'R2 Storage',          ok: maint.health.r2 },
                        { key: 'email', label: 'Email (Resend)',       ok: maint.health.email },
                        { key: 'ai',    label: 'AI (Gemini)',          ok: maint.health.ai },
                        { key: 'push',  label: 'Push Notifications',  ok: maint.health.push },
                      ].map(({ key, label, ok }) => (
                        <div key={key} className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border ${ok ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                          {ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
                          <span className="text-xs font-medium">{label}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  {/* ── Scheduled Jobs ──────────────────────────────────── */}
                  <SectionCard icon={<Clock className="w-4 h-4 text-sky-400" />} title="Scheduled Jobs" desc="Last run timestamps and manual triggers">
                    <div className="space-y-3">
                      {[
                        { action: 'run_trash_purge',    label: 'Trash Purge',    key: 'trash_purge' },
                        { action: 'run_archive',         label: 'Archive Job',    key: 'archive' },
                        { action: 'run_transfer_purge',  label: 'Transfer Purge', key: 'transfer_purge' },
                        { action: 'run_log_cleanup',     label: 'Log Cleanup',    key: 'log_cleanup' },
                      ].map(({ action, label, key }) => {
                        const lr = maint.jobs[key]?.lastRun
                        return (
                          <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/40">
                            <div className="flex-1">
                              <p className="text-sm text-white font-medium">{label}</p>
                              <p className="text-xs text-slate-500">
                                Last run: {lr ? new Date(lr).toLocaleString() : 'Never'}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={jobRunning === action}
                              onClick={() => runJob(action, label)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-600/30 transition disabled:opacity-50"
                            >
                              {jobRunning === action ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Run Now
                            </button>
                          </div>
                        )
                      })}
                      {jobResult && (
                        <p className={`text-xs px-3 py-2 rounded-lg ${jobResult.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>{jobResult}</p>
                      )}
                    </div>
                  </SectionCard>

                  {/* ── Database Stats ───────────────────────────────────── */}
                  <SectionCard icon={<Database className="w-4 h-4 text-violet-400" />} title="Database Statistics" desc="Live record counts">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Users',   value: maint.stats.users },
                        { label: 'Total Files',   value: maint.stats.files },
                        { label: 'Total Events',  value: maint.stats.events },
                        { label: 'Files in Trash', value: maint.stats.trashed },
                      ].map(({ label, value }) => (
                        <div key={label} className="px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
                          <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  {/* ── Danger Zone ─────────────────────────────────────── */}
                  <section className="rounded-2xl bg-red-950/20 border border-red-500/25 p-6 space-y-5">
                    <div className="flex items-center gap-3">
                      <AlertOctagon className="w-5 h-5 text-red-400 shrink-0" />
                      <div>
                        <h2 className="text-sm font-semibold text-red-300">Danger Zone</h2>
                        <p className="text-xs text-red-400/70">These actions are irreversible. Type CONFIRM in the box before each button.</p>
                      </div>
                    </div>

                    {/* Export All Data */}
                    <div className="rounded-xl bg-slate-900/60 border border-red-500/20 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-white">Export All Data</p>
                        <p className="text-xs text-slate-400">Download the full database as a JSON file. Includes users, files, events, transfers, and activity logs.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          placeholder="Type CONFIRM"
                          value={confirmText['export_data'] ?? ''}
                          onChange={e => setConfirmText(p => ({ ...p, export_data: e.target.value }))}
                          className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                        />
                        <button
                          type="button"
                          disabled={jobRunning === 'export_data'}
                          onClick={() => dangerAction('export_data', 'Export')}
                          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-800 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          {jobRunning === 'export_data' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Export All Data
                        </button>
                      </div>
                    </div>

                    {/* Clear Test Data */}
                    <div className="rounded-xl bg-slate-900/60 border border-red-500/20 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-white">Clear Test Data</p>
                        <p className="text-xs text-slate-400">Permanently deletes all users and files whose name contains "test". Admin accounts are never affected.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          placeholder="Type CONFIRM"
                          value={confirmText['clear_test_data'] ?? ''}
                          onChange={e => setConfirmText(p => ({ ...p, clear_test_data: e.target.value }))}
                          className="w-40 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                        />
                        <button
                          type="button"
                          disabled={jobRunning === 'clear_test_data'}
                          onClick={() => dangerAction('clear_test_data', 'Clear test data')}
                          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-800 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/10 transition disabled:opacity-50"
                        >
                          {jobRunning === 'clear_test_data' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Clear Test Data
                        </button>
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500 text-sm">Failed to load maintenance data.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

