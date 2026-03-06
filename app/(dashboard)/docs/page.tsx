'use client'

import { useState }   from 'react'
import {
  BookOpen, Shield, UserCheck, Crown, LogIn, LayoutDashboard,
  FolderTree, Upload, Download, Tag, Bell, Smartphone, Search,
  GitBranch, Settings, HelpCircle, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, AlertTriangle, Info, Zap,
  Camera, Film, Archive, Clock, Lock, Globe, Wifi, WifiOff,
  ArrowRight, Star, Users, FileText, BarChart2, Trash2, RefreshCw,
  Table2, MessageCircle, ScrollText,
} from 'lucide-react'

// ─── Section IDs ───────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'intro',         label: 'What Is This System?',       icon: BookOpen    },
  { id: 'roles',         label: 'Your Role & Permissions',    icon: Shield      },
  { id: 'login',         label: 'Logging In',                 icon: LogIn       },
  { id: 'dashboard',     label: 'The Dashboard',              icon: LayoutDashboard },
  { id: 'folders',       label: 'Folder Structure',           icon: FolderTree  },
  { id: 'uploading',     label: 'Uploading Files',            icon: Upload      },
  { id: 'downloading',   label: 'Downloading Files',          icon: Download    },
  { id: 'statuses',      label: 'File Statuses',              icon: Tag         },
  { id: 'versions',      label: 'Version Control',            icon: GitBranch   },
  { id: 'notifications', label: 'Notifications',              icon: Bell        },
  { id: 'mobile',        label: 'Using on Mobile',            icon: Smartphone  },
  { id: 'search',        label: 'Search & Filtering',         icon: Search      },
  { id: 'tags',          label: 'Tags',                       icon: Tag         },
  { id: 'admin',         label: 'Admin Guide',                icon: Settings    },
  { id: 'faq',           label: 'Common Questions',           icon: HelpCircle  },
  { id: 'quickref',      label: 'Quick Reference',            icon: Zap         },
]

// ─── Helpers ───────────────────────────────────────────────────────────────
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function SectionAnchor({ id }: { id: string }) {
  return <div id={id} className="-mt-6 pt-6" />
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <div className="mt-0.5 w-10 h-10 rounded-xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-indigo-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-slate-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800/60 rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  )
}

function Callout({ type, children }: { type: 'tip' | 'warning' | 'info'; children: React.ReactNode }) {
  const styles = {
    tip:     { bg: 'bg-emerald-500/8 border-emerald-500/25', icon: CheckCircle2, iconCls: 'text-emerald-400', label: 'Tip' },
    warning: { bg: 'bg-amber-500/8 border-amber-500/25',     icon: AlertTriangle, iconCls: 'text-amber-400',  label: 'Note' },
    info:    { bg: 'bg-sky-500/8 border-sky-500/25',          icon: Info,          iconCls: 'text-sky-400',    label: 'Info' },
  }
  const s = styles[type]
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${s.bg}`}>
      <s.icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.iconCls}`} />
      <div className="text-slate-300 leading-relaxed">{children}</div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-bold text-indigo-400">
        {n}
      </span>
      <span className="text-sm text-slate-300 leading-relaxed">{children}</span>
    </li>
  )
}

function Perm({ allowed, children }: { allowed: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm">
      {allowed
        ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
        : <XCircle      className="w-4 h-4 mt-0.5 text-rose-500/70  shrink-0" />}
      <span className={allowed ? 'text-slate-300' : 'text-slate-500'}>{children}</span>
    </li>
  )
}

function Divider() {
  return <hr className="border-slate-800/60 my-8" />
}

function FAQ({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-slate-800/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-white hover:bg-slate-800/40 transition-colors"
      >
        <span>{q}</span>
        {open
          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
          {a}
        </div>
      )}
    </div>
  )
}

// ─── Status badge colours (mirrors app) ───────────────────────────────────
const STATUS_ROWS = [
  { status: 'RAW',                 colour: 'bg-slate-700 text-slate-300',           meaning: 'Just uploaded — original, unedited file.' },
  { status: 'Editing In Progress', colour: 'bg-amber-500/20 text-amber-300',        meaning: 'An editor is actively working on this file.' },
  { status: 'Edited',              colour: 'bg-sky-500/20 text-sky-300',             meaning: 'Editing done — ready for review or publishing.' },
  { status: 'Published',           colour: 'bg-emerald-500/20 text-emerald-300',    meaning: 'Content has been posted or distributed.' },
  { status: 'Archived',            colour: 'bg-slate-600/50 text-slate-400',        meaning: 'Older content moved to the archive. Still accessible.' },
]

// ─── Quick reference rows ─────────────────────────────────────────────────
const QUICK_REF = [
  { want: 'Log in',                   how: 'Go to the CMMS URL → enter username + password' },
  { want: 'Install the app on mobile', how: 'Open in browser → Add to Home Screen (iOS: Share → Add to Home Screen)' },
  { want: 'Upload files',             how: 'Navigate to the correct event folder → drag & drop or tap to select' },
  { want: 'Download a single file',   how: 'Open the file → click Download' },
  { want: 'Download an entire folder', how: 'Open the event → click Download All → ZIP downloads' },
  { want: 'Change a file\'s status',  how: 'Open the file → click the status badge → select new status' },
  { want: 'Upload an edited version', how: 'Open the original → click Upload New Version' },
  { want: 'Find specific content',    how: 'Use the Search bar at the top → apply filters' },
  { want: 'Manage notifications',     how: 'Click your name (top right) → Notification Preferences' },
  { want: 'Create a new event',       how: 'Admin Dashboard → Create Event' },
  { want: 'Add a new team member',    how: 'Admin → Users → Add User' },
  { want: 'Recover a deleted file',   how: 'Admin → Trash → Restore (within 30 days)' },
  { want: 'View all system activity', how: 'Admin → Activity Log' },
  { want: 'Get help in real time',    how: 'Help button (bottom right) → CMMS Assistant' },
]

// ── Main Page ──────────────────────────────────────────────────────────────
export default function DocsPage() {
  return (
    <div className="flex gap-8 max-w-6xl">

      {/* ── Left: sticky TOC ─────────────────────────────────────── */}
      <aside className="hidden xl:flex flex-col w-52 shrink-0">
        <div className="sticky top-4 space-y-0.5">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">On this page</p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => scrollToSection(id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all text-left"
            >
              <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              {label}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Right: content ──────────────────────────────────────── */}
      <main className="flex-1 min-w-0 space-y-12 pb-24">

        {/* ━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-950/60 via-slate-900 to-violet-950/40 border border-indigo-500/20 p-8">
          {/* Decorative glow */}
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-xs font-medium text-indigo-300">
                <BookOpen className="w-3 h-3" /> User Guide · v1.0
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-3">
              Christhood{' '}
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                CMMS
              </span>{' '}
              Onboarding Guide
            </h1>
            <p className="text-slate-400 max-w-xl leading-relaxed">
              Welcome to the official home for all Christhood media. This guide walks you through everything — no training required. Follow it once and you'll be ready to use the system fully.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { icon: Camera,   label: 'Upload Media'     },
                { icon: Film,     label: 'Manage Edits'     },
                { icon: Users,    label: 'Team Roles'       },
                { icon: Archive,  label: 'Version History'  },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/70 border border-slate-700/50 text-xs text-slate-300">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ━━ WHAT IS THIS SYSTEM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="intro" />
          <SectionHeader icon={BookOpen} title="What Is This System?" subtitle="Understanding the problem it solves" />

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <Card className="border-rose-500/20">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-sm font-semibold text-rose-300">Before the CMMS</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-400">
                {[
                  'Files scattered across phones, drives, and WhatsApp',
                  'Content lost, overwritten, or impossible to find',
                  'No visibility into who had what or editing stage',
                ].map(t => (
                  <li key={t} className="flex gap-2"><XCircle className="w-3.5 h-3.5 mt-0.5 text-rose-500/60 shrink-0" />{t}</li>
                ))}
              </ul>
            </Card>

            <Card className="border-emerald-500/20">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-300">With the CMMS</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-400">
                {[
                  'Every file has one home — organized and searchable',
                  'Find anything in seconds with search and filters',
                  'Every upload, edit, and download is tracked',
                  'Nothing gets permanently lost (30-day trash)',
                ].map(t => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-500/70 shrink-0" />{t}</li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        <Divider />

        {/* ━━ ROLES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="roles" />
          <SectionHeader icon={Shield} title="Your Role & Permissions" subtitle="The system has three roles — your admin will tell you which one you have" />

          <div className="grid sm:grid-cols-3 gap-4">

            {/* Uploader */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Upload className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white">UPLOADER</span>
                  <span className="text-xs text-slate-500">Field team member</span>
                </div>
              </div>
              <ul className="space-y-2 mb-0">
                <Perm allowed>Log in and browse folders</Perm>
                <Perm allowed>Upload to assigned events</Perm>
                <Perm allowed>View and download assigned files</Perm>
                <Perm allowed>See your upload history</Perm>
                <Perm allowed={false}>Create or delete events</Perm>
                <Perm allowed={false}>Change file statuses</Perm>
                <Perm allowed={false}>Access unassigned events</Perm>
              </ul>
            </Card>

            {/* Editor */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-sky-600/20 border border-sky-500/30 flex items-center justify-center">
                  <Film className="w-4 h-4 text-sky-400" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white">EDITOR</span>
                  <span className="text-xs text-slate-500">Post-production team</span>
                </div>
              </div>
              <ul className="space-y-2">
                <Perm allowed>Download any raw file</Perm>
                <Perm allowed>Upload edited versions</Perm>
                <Perm allowed>Change file status</Perm>
                <Perm allowed>Batch-download as ZIP</Perm>
                <Perm allowed>View full version history</Perm>
                <Perm allowed={false}>Create or delete events</Perm>
                <Perm allowed={false}>Manage user accounts</Perm>
              </ul>
            </Card>

            {/* Admin */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-white">ADMIN</span>
                  <span className="text-xs text-slate-500">System manager</span>
                </div>
              </div>
              <ul className="space-y-2">
                <Perm allowed>Do everything Editors can</Perm>
                <Perm allowed>Create & manage events/folders</Perm>
                <Perm allowed>Manage users & assign roles</Perm>
                <Perm allowed>Delete files (to trash first)</Perm>
                <Perm allowed>Restore deleted files</Perm>
                <Perm allowed>View full activity log</Perm>
                <Perm allowed>Access analytics & settings</Perm>
              </ul>
            </Card>
          </div>
        </section>

        <Divider />

        {/* ━━ LOGGING IN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="login" />
          <SectionHeader icon={LogIn} title="Logging In for the First Time" />

          <Card className="mb-4">
            <ol className="space-y-4">
              <Step n={1}>
                When your admin creates your account you'll receive an email with your <strong className="text-white">username</strong> and a link to <strong className="text-white">set your password</strong>. Click the link (it expires after 24 hours).
              </Step>
              <Step n={2}>
                Go to the CMMS login page. Enter your <strong className="text-white">username</strong> and <strong className="text-white">password</strong>, then click <strong className="text-white">Sign In</strong>.
              </Step>
              <Step n={3}>
                You'll land on your <strong className="text-white">Dashboard</strong>. You're in!
              </Step>
            </ol>
          </Card>

          <Callout type="tip">
            If you use Google for your Christhood account, you can also sign in with <strong>Continue with Google</strong> — no separate password needed.
          </Callout>
        </section>

        <Divider />

        {/* ━━ DASHBOARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="dashboard" />
          <SectionHeader icon={LayoutDashboard} title="Understanding the Dashboard" subtitle="Your home screen after logging in" />

          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: Clock,       label: 'Recent Activity',    desc: 'The last few things that happened in events you follow — uploads, status changes, published content.' },
              { icon: Upload,      label: 'My Uploads',         desc: 'A quick view of files you have uploaded recently and their current status.' },
              { icon: Star,        label: 'Followed Events',    desc: 'Events you have chosen to follow. You will be notified when new content is added.' },
              { icon: Bell,        label: 'Notification Bell',  desc: 'The bell icon (top right) shows unread notifications. Click to see all alerts.' },
              { icon: UserCheck,   label: 'Your Name (top right)', desc: 'Click your name to access your profile, change your password, and manage notification preferences.' },
            ].map(({ icon: Icon, label, desc }) => (
              <Card key={label} className="flex gap-4 items-start">
                <div className="mt-0.5 w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <Divider />

        {/* ━━ FOLDER STRUCTURE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="folders" />
          <SectionHeader icon={FolderTree} title="Finding Content — The Folder Structure" subtitle="All media is organized in a consistent 3-level hierarchy" />

          {/* Tree diagram */}
          <Card className="mb-5 font-mono text-sm">
            <div className="text-slate-400 space-y-1.5">
              <div className="flex items-center gap-2 text-indigo-300 font-semibold"><FolderTree className="w-4 h-4" /> YEAR</div>
              <div className="pl-6 flex items-center gap-2 text-violet-300"><ArrowRight className="w-3 h-3 text-slate-600" /> EVENT CATEGORY</div>
              <div className="pl-12 flex items-center gap-2 text-sky-300"><ArrowRight className="w-3 h-3 text-slate-600" /> SPECIFIC EVENT</div>
              <div className="pl-[4.5rem] flex items-center gap-2 text-slate-400 text-xs"><ArrowRight className="w-3 h-3 text-slate-700" /> (optional) DAY SUBFOLDER</div>
            </div>
          </Card>

          <div className="mb-5 space-y-3">
            <p className="text-sm font-semibold text-slate-300">The five event categories:</p>
            <div className="flex flex-wrap gap-2">
              {['Saturday Fellowships', 'Missions', 'Conferences', 'Special Events', 'Outreach Programs'].map(c => (
                <span key={c} className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700/60 text-xs text-slate-300">{c}</span>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Card>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Example — Saturday Fellowship</p>
              <ol className="space-y-2">
                <Step n={1}>Click <strong className="text-white">2026</strong> in the sidebar</Step>
                <Step n={2}>Click <strong className="text-white">Saturday Fellowships</strong></Step>
                <Step n={3}>Click the specific Saturday (e.g. <span className="text-indigo-300">Saturday 12 — March 2026</span>)</Step>
                <Step n={4}>All files for that day are here</Step>
              </ol>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Example — Multi-day Mission</p>
              <ol className="space-y-2">
                <Step n={1}>Click <strong className="text-white">2026</strong> → <strong className="text-white">Missions</strong></Step>
                <Step n={2}>Click <strong className="text-white">School A Mission</strong></Step>
                <Step n={3}>See subfolders: <span className="text-sky-300">Friday / Saturday / Sunday</span></Step>
                <Step n={4}>Click the day you want</Step>
              </ol>
            </Card>
          </div>

          <div className="mt-4">
            <Callout type="tip">
              Use the <strong>breadcrumb trail</strong> at the top of every page (e.g. <span className="font-mono text-indigo-300">2026 › Missions › School A</span>) to see exactly where you are and navigate back quickly.
            </Callout>
          </div>
        </section>

        <Divider />

        {/* ━━ UPLOADING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="uploading" />
          <SectionHeader icon={Upload} title="Uploading Files" subtitle="For Uploaders and Admins" />

          <Card className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">How to upload</p>
            <ol className="space-y-4">
              <Step n={1}>Navigate to the <strong className="text-white">correct event folder</strong> (or day subfolder). Always choose the destination first.</Step>
              <Step n={2}>You will see an upload area with a cloud icon. You can <strong className="text-white">drag and drop</strong> files onto it, <strong className="text-white">click to browse</strong>, or on mobile, choose <strong className="text-white">Take Photo</strong>, <strong className="text-white">Record Video</strong>, or <strong className="text-white">Choose from Gallery</strong>.</Step>
              <Step n={3}>A progress bar shows the status of each file as it uploads.</Step>
              <Step n={4}>When complete, each file appears in the folder with status <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">RAW</span>.</Step>
            </ol>
          </Card>

          <div className="space-y-3">
            {[
              { icon: CheckCircle2, colour: 'text-emerald-400', text: 'You can upload multiple files at once — select them all together.' },
              { icon: XCircle,      colour: 'text-amber-400',   text: 'Do not rename files before uploading. The system auto-renames every file to a consistent format (e.g. Mission_20260315_001.jpg).' },
              { icon: WifiOff,      colour: 'text-sky-400',     text: 'If your connection drops mid-upload, do not panic. The upload resumes automatically when you reconnect — no need to start over.' },
              { icon: Wifi,         colour: 'text-indigo-400',  text: 'Uploading in an area with no signal? Files queue on your device and upload the moment internet is available.' },
              { icon: FileText,     colour: 'text-slate-400',   text: 'Your upload is logged automatically — name, time, file details, and event. You do not need to fill anything in.' },
            ].map(({ icon: Icon, colour, text }) => (
              <div key={text} className="flex gap-3 items-start text-sm">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${colour}`} />
                <span className="text-slate-300">{text}</span>
              </div>
            ))}
          </div>
        </section>

        <Divider />

        {/* ━━ DOWNLOADING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="downloading" />
          <SectionHeader icon={Download} title="Downloading Files" subtitle="Available to all roles" />

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Card>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Single file</p>
              <ol className="space-y-3">
                <Step n={1}>Navigate to the event folder</Step>
                <Step n={2}>Click the file to open its preview</Step>
                <Step n={3}>Click <strong className="text-white">Download</strong> — the file saves to your device</Step>
              </ol>
            </Card>
            <Card>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Entire folder (Editors & Admins)</p>
              <ol className="space-y-3">
                <Step n={1}>Navigate to the event folder</Step>
                <Step n={2}>Click <strong className="text-white">Download All</strong> or select files using the checkboxes</Step>
                <Step n={3}>The system packages everything into a <strong className="text-white">ZIP file</strong></Step>
              </ol>
            </Card>
          </div>
          <Callout type="warning">
            Every download is logged — who downloaded, what, and when. This is for accountability, not surveillance, and helps the team track content access.
          </Callout>
        </section>

        <Divider />

        {/* ━━ FILE STATUSES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="statuses" />
          <SectionHeader icon={Tag} title="File Status Labels" subtitle="Every file carries a status that shows where it is in its lifecycle" />

          <Card className="mb-5">
            <div className="divide-y divide-slate-800/50">
              {STATUS_ROWS.map(({ status, colour, meaning }) => (
                <div key={status} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 w-40 text-center ${colour}`}>
                    {status}
                  </span>
                  <p className="text-sm text-slate-400">{meaning}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-2 text-sm text-slate-300">
            <p className="font-medium text-white">Who can change a status:</p>
            <ul className="space-y-1.5 pl-1">
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" /><span><strong className="text-white">Editors</strong> — RAW → Editing In Progress → Edited → Published</span></li>
              <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" /><span><strong className="text-white">Admins</strong> — any status including Archived</span></li>
              <li className="flex gap-2"><XCircle      className="w-4 h-4 text-rose-500/70 mt-0.5 shrink-0" /><span className="text-slate-500"><strong className="text-slate-400">Uploaders</strong> — cannot change status</span></li>
            </ul>
          </div>
        </section>

        <Divider />

        {/* ━━ VERSION CONTROL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="versions" />
          <SectionHeader icon={GitBranch} title="Version Control" subtitle="Uploading edited versions — nothing is ever lost" />

          <Card className="mb-4">
            <ol className="space-y-4">
              <Step n={1}>Navigate to the original raw file</Step>
              <Step n={2}>Click <strong className="text-white">Upload New Version</strong></Step>
              <Step n={3}>Select your edited file — it is stored as <span className="text-sky-300 font-medium">Version 2</span>. The original (<span className="text-slate-400">Version 1</span>) is always kept.</Step>
            </ol>
          </Card>
          <Callout type="info">
            To see the full history: open any file and click <strong>Version History</strong> — all versions are listed with their dates and who uploaded each one.
          </Callout>
        </section>

        <Divider />

        {/* ━━ NOTIFICATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="notifications" />
          <SectionHeader icon={Bell} title="Notifications" subtitle="Staying in the loop without missing anything" />

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Bell className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-semibold text-white">In-App Notifications</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-400">
                {[
                  'New content uploaded to an event you follow',
                  'A file you uploaded has its status changed',
                  'An admin creates a new event or folder',
                ].map(t => <li key={t} className="flex gap-2"><ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-600 shrink-0" />{t}</li>)}
              </ul>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-white">Email Notifications</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-400">
                {[
                  'Weekly digest every Monday morning',
                  'Alert when content goes Published (team leads)',
                  'Account actions — creation, password resets',
                ].map(t => <li key={t} className="flex gap-2"><ChevronRight className="w-3.5 h-3.5 mt-0.5 text-slate-600 shrink-0" />{t}</li>)}
              </ul>
            </Card>
          </div>

          <Callout type="tip">
            To manage preferences: click your name (top right) → <strong>Notification Preferences</strong> → choose which events to follow and which alert types to enable.
          </Callout>
        </section>

        <Divider />

        {/* ━━ MOBILE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="mobile" />
          <SectionHeader icon={Smartphone} title="Using the CMMS on Your Phone" subtitle="The system is built to work like a native mobile app" />

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-0.5 rounded bg-emerald-600/20 border border-emerald-500/30 text-xs font-medium text-emerald-300">Android</div>
              </div>
              <ol className="space-y-3">
                <Step n={1}>Open the CMMS in <strong className="text-white">Chrome</strong></Step>
                <Step n={2}>Tap the banner at the bottom: <strong className="text-white">"Add Christhood CMMS to Home Screen"</strong></Step>
                <Step n={3}>The app icon appears on your home screen — tap it like any other app</Step>
              </ol>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="px-2 py-0.5 rounded bg-sky-600/20 border border-sky-500/30 text-xs font-medium text-sky-300">iPhone</div>
              </div>
              <ol className="space-y-3">
                <Step n={1}>Open the CMMS in <strong className="text-white">Safari</strong></Step>
                <Step n={2}>Tap the <strong className="text-white">Share button</strong> (box with arrow pointing up)</Step>
                <Step n={3}>Tap <strong className="text-white">"Add to Home Screen"</strong> → tap Add</Step>
              </ol>
            </Card>
          </div>
          <Callout type="info">
            No App Store or Play Store needed. This is a <strong>Progressive Web App (PWA)</strong> — it installs directly from the browser and works offline for previously loaded content.
          </Callout>
        </section>

        <Divider />

        {/* ━━ SEARCH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="search" />
          <SectionHeader icon={Search} title="Search & Filtering" subtitle="Find any file without browsing through folders" />

          <Card className="mb-4">
            <ol className="space-y-4">
              <Step n={1}>Click the <strong className="text-white">Search bar</strong> at the top of any page (or press <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">Ctrl+K</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-xs font-mono">⌘K</kbd>)</Step>
              <Step n={2}>Type a keyword — event name, tag, or filename</Step>
              <Step n={3}>Use the <strong className="text-white">Filters panel</strong> to narrow results by year, event category, file type, uploader, status, or tags</Step>
              <Step n={4}>Results appear as cards with a breadcrumb showing exactly where each file lives</Step>
            </ol>
          </Card>
        </section>

        <Divider />

        {/* ━━ TAGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="tags" />
          <SectionHeader icon={Tag} title="Tags" subtitle="Categorize content beyond folder structure" />

          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            A file can be in <span className="text-white">Saturday Fellowships</span> but also tagged as <span className="text-indigo-300">Worship</span> and <span className="text-indigo-300">Youth</span>. Tags make it easy to pull all content of a type across every event in one search.
          </p>

          <div className="mb-5 flex flex-wrap gap-2">
            {['Youth', 'Worship', 'Outreach', 'Testimony', 'Missions', 'Conference', 'Leadership', 'Prayer'].map(t => (
              <span key={t} className="px-3 py-1.5 rounded-lg bg-indigo-600/15 border border-indigo-500/25 text-xs font-medium text-indigo-300">{t}</span>
            ))}
          </div>

          <Callout type="tip">
            To tag a file: open it → find the Tags section → click <strong>Add Tag</strong> → type or select from the list.
          </Callout>
        </section>

        <Divider />

        {/* ━━ ADMIN GUIDE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="admin" />
          <SectionHeader icon={Settings} title="Admin Guide" subtitle="For system managers only" />

          <div className="space-y-4">
            {[
              {
                icon: FolderTree,
                title: 'Creating a New Event',
                steps: [
                  'Go to the Admin Dashboard → click Create Event',
                  'Select the Year and Event Category',
                  'Enter the Event name and date',
                  'For multi-day events, add Subfolders (e.g. Friday, Saturday, Sunday)',
                  'Click Save — uploaders can immediately start adding content',
                ],
              },
              {
                icon: Users,
                title: 'Creating a New User Account',
                steps: [
                  'Go to Admin → Users → click Add User',
                  'Enter their name, email, username, and select their role',
                  'Click Create — they will receive an email to set their password',
                ],
              },
              {
                icon: Trash2,
                title: 'Deleting a File (Soft Delete)',
                steps: [
                  'Navigate to the file → click the three-dot menu → Delete',
                  'The file moves to Trash — it is NOT gone yet',
                  'It stays in Trash for 30 days before permanent purge',
                  'Any admin can go to Admin → Trash → Restore during that window',
                ],
              },
              {
                icon: ScrollText,
                title: 'Viewing the Activity Log',
                steps: [
                  'Go to Admin → Activity Log',
                  'See a full chronological record: uploads, downloads, deletions, status changes, logins',
                  'Filter by user, action type, or date range',
                  'This log cannot be edited or deleted — it is permanent',
                ],
              },
            ].map(({ icon: Icon, title, steps }) => (
              <Card key={title}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-semibold text-white">{title}</span>
                </div>
                <ol className="space-y-2">
                  {steps.map((s, i) => <Step key={i} n={i + 1}>{s}</Step>)}
                </ol>
              </Card>
            ))}
          </div>
        </section>

        <Divider />

        {/* ━━ FAQ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="faq" />
          <SectionHeader icon={HelpCircle} title="Common Questions" />

          <div className="space-y-2">
            <FAQ q="I forgot my password. What do I do?"
                a="Click 'Forgot Password' on the login page. You will receive an email with a reset link. Alternatively, ask your admin to trigger a password reset from the Users panel." />
            <FAQ q="I uploaded to the wrong folder. Can I move the file?"
                a="Contact your admin. They can delete the incorrectly placed file (it goes to Trash, not gone) and you can re-upload it to the correct folder." />
            <FAQ q="My upload stopped halfway. Do I need to start again?"
                a="No. The system uses resumable uploads. When your connection is restored, the upload continues automatically from where it stopped." />
            <FAQ q="I can't see a folder or event I'm looking for."
                a="Your access may be limited to events you are assigned to (Uploader role). If you believe you should have access to something you cannot see, contact your admin." />
            <FAQ q="Where are the files actually stored?"
                a={<>All files are stored securely in <strong>Cloudflare R2</strong> cloud storage — an enterprise-grade object store. The CMMS is the organized interface on top of that storage. Files are private and cannot be accessed without logging in.</>} />
            <FAQ q="Can I access the system without internet?"
                a="You can browse previously loaded pages. Uploads will queue on your device and send when you reconnect. You cannot download new files without an internet connection." />
            <FAQ q="A file I uploaded was deleted. Is it gone forever?"
                a="Not immediately. Deleted files go to Trash for 30 days. Ask your admin to check Trash and restore it. After 30 days it is permanently removed — but the activity log will always show it existed." />
            <FAQ q="I need help with something not covered here."
                a={<>Use the <strong>Help button</strong> (bottom right of any page) to chat with the CMMS AI Assistant. It knows the full workflow and can guide you through any task in real time.</>} />
          </div>
        </section>

        <Divider />

        {/* ━━ QUICK REFERENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section>
          <SectionAnchor id="quickref" />
          <SectionHeader icon={Zap} title="Quick Reference Card" subtitle="The most common tasks at a glance" />

          <Card className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-1/2">I want to…</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">How</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {QUICK_REF.map(({ want, how }) => (
                  <tr key={want} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{want}</td>
                    <td className="px-5 py-3 text-slate-400">{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>

        {/* ━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-800/60">
          <p className="text-xs text-slate-600">Christhood CMMS Onboarding Guide — v1.0</p>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Lock className="w-3 h-3" />
            For authorized Christhood Media Team members only
          </div>
        </div>

      </main>
    </div>
  )
}

