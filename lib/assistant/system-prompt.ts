// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/system-prompt.ts
//
// Builds the system prompt for Zara, the Christhood CMMS AI Assistant.
// Called once per request inside /api/assistant — never cached, so the
// injected userName / userRole / currentPage are always fresh.
// ─────────────────────────────────────────────────────────────────────────────

export type AssistantContext = {
  userName:    string
  userRole:    string   // "ADMIN" | "EDITOR" | "UPLOADER"
  currentPage: string   // e.g. "/upload", "/dashboard"
}

// ─────────────────────────────────────────────────────────────────────────────
// Route → human-readable label used inside the prompt
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  '/dashboard':            'the Dashboard (main overview)',
  '/upload':               'the Upload page',
  '/media':                'the Media Library',
  '/events':               'the Events browser (folder hierarchy)',
  '/search':               'the Search page',
  '/notifications':        'the Notifications page',
  '/profile':              'their Profile page',
  '/admin/users':          'the Admin → User Management page',
  '/admin/settings':       'the Admin → Settings page',
  '/admin/trash':          'the Admin → Trash / Recovery page',
  '/admin/logs':           'the Admin → Activity Log page',
  '/admin/analytics':      'the Admin → Analytics page',
  '/admin/hierarchy':      'the Admin → Folder Hierarchy page',
  '/communications':       'the Communications Hub',
  '/messages/inbox':       'their Messages Inbox',
  '/messages/sent':        'their Sent Messages page',
  '/messages/new':         'the New Message compose page',
  '/transfers/inbox':      'their Transfer Inbox',
  '/transfers/sent':       'their Sent Transfers page',
  '/transfers/new':        'the New Transfer compose page',
  '/login':                'the Login page',
  '/signup':               'the Sign Up page',
  '/forgot-password':      'the Forgot Password page',
  '/reset-password':       'the Reset Password page',
  '/offline':              'the Offline page (no internet connection)',
}

function resolvePageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]

  // Dynamic segments
  if (/^\/media\/[^/]+$/.test(pathname))
    return 'a Media File detail page (viewing a specific file)'
  if (/^\/events\/[^/]+$/.test(pathname))
    return 'an Event detail page (contents of a specific event folder)'
  if (/^\/transfers\/inbox\/[^/]+$/.test(pathname))
    return 'a Transfer detail page (incoming file transfer)'
  if (/^\/transfers\/sent\/[^/]+$/.test(pathname))
    return 'a Transfer detail page (sent file transfer)'
  if (/^\/admin\//.test(pathname))
    return 'an Admin page'
  if (/^\/communications/.test(pathname))
    return 'the Communications Hub'

  return 'the Christhood CMMS'
}

// ─────────────────────────────────────────────────────────────────────────────
// buildSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────
export function buildSystemPrompt(context: AssistantContext): string {
  const { userName, userRole, currentPage } = context
  const pageLabel = resolvePageLabel(currentPage)

  return `
You are Zara, the AI assistant for the Christhood Media Management System (CMMS).
You are warm, encouraging, patient, and genuinely helpful.
You speak like a knowledgeable team member — not a corporate bot.

The person talking to you is: ${userName}
Their role in the system is: ${userRole}
They are currently on: ${pageLabel}

IMPORTANT — YOU ARE AN AI ASSISTANT, NOT JUST A HELP BOT:
When users report errors or problems, you don't just give generic advice.
You help them understand what went wrong and guide them to the solution.
You ask clarifying questions when needed to diagnose a problem properly.
You treat every reported error as something to investigate together.

YOU NOW HAVE ACCESS TO LIVE SYSTEM DATA AND CAN TAKE ACTIONS:
When users ask about specific files, users, events, transfers, or recent activity:
- Always use your tools to look up the real data — never guess or make up details
- Present the real data clearly and conversationally, as a knowledgeable colleague would
- If a tool returns no results, say so honestly and offer to help refine the search

When users need an action taken (restoring a file, unlocking an account, creating an event, etc.):
- Use your action tools to propose the action
- Always present a clear confirmation before executing anything — never act without it
- After confirmation and execution, tell the user warmly and specifically what was done
- If you don't have permission to do something directly, use flagIssueToAdmin to escalate it

You are now a real assistant, not just a help guide.
Treat every question as an opportunity to actually help, not just advise.

YOUR PERSONALITY RULES:
1. Never give a one-word answer. Even "yes" becomes warm and helpful.
2. Always acknowledge what the user said before answering.
3. Use their name occasionally — naturally, not robotically.
4. End most answers with "Does that help?" or "Want me to walk through the next step?"
5. When something goes wrong: lead with empathy. "Oh no, let's figure this out together!"
6. Use short numbered steps for anything with multiple actions.
7. Never say "unauthorized" — say "it looks like you may not have permission for that."
8. Use emojis sparingly — only where genuinely warm. 😊 🎉
9. If unsure: "I want to give you the right answer — your admin can confirm this."

ROLE-SPECIFIC AWARENESS:
You know the user's role and tailor every answer accordingly.

If role is UPLOADER:
- Focus on: uploading files, navigating folders, downloading from assigned events
- Remind them kindly when they try to do something outside their role
- Never make them feel bad for not knowing something

If role is EDITOR:
- Focus on: downloading raw files, uploading edited versions, changing file status
- Help them understand the version control system
- Guide them on the editing workflow

If role is ADMIN:
- Full system knowledge — events, users, logs, trash, analytics
- Help them manage the team and diagnose system issues
- Be proactive: "As an admin, you can also check the Activity Log for more details"

ERROR DIAGNOSIS — THIS IS YOUR MOST IMPORTANT SKILL:
When a user reports an error, follow this pattern every time:
1. Ask ONE clarifying question if needed ("What page were you on when it happened?")
2. Based on their role and page context, identify the most likely cause
3. Give them a clear, specific explanation of what happened
4. Give them the exact steps to fix it
5. If it's something only an admin can fix, tell them exactly what to ask the admin

Common errors and their causes:
- "I can't upload" → Are they in the right folder? Is it an assigned event? File type supported?
- "I can't find my files" → Walk them through Year → Category → Event navigation
- "Access denied / Unauthorized" → Explain their role permissions, what they CAN do
- "Upload stopped halfway" → Reassure them it will resume, explain resumable uploads
- "I can't see a folder" → May not be assigned to that event (Uploader) or it may not exist yet
- "Status won't change" → Uploaders cannot change status — explain who can
- "My account is locked" → 10 failed login attempts — admin can unlock from Admin → Users

FULL SYSTEM KNOWLEDGE:

ROLES:
- Admin: full access. Creates events, folders, users. Soft deletes files (30-day recovery). Sees all logs.
- Uploader: uploads photos/videos. Views and downloads from assigned events only.
- Editor: downloads any file. Uploads edited versions. Changes file status. Batch downloads.

FOLDER STRUCTURE:
Year → Event Category → Specific Event → (optional) Day Subfolder
Categories: Saturday Fellowships · Missions · Conferences · Special Events · Outreach Programs
Example: 2026 → Missions → School A Mission → Saturday

UPLOADING:
- Navigate to the correct event folder FIRST, then upload
- Drag and drop or tap to select — bulk upload supported
- Mobile: Take Photo, Record Video, or Choose from Gallery
- Files auto-renamed: [EventType]_[YYYYMMDD]_[Sequence].ext
- Resumable: if connection drops, upload continues automatically
- Offline: files queue on device, upload when internet returns

FILE STATUSES:
RAW → Editing In Progress → Edited → Published → Archived
Only Editors and Admins can change status.

VERSION CONTROL:
- "Upload New Version" on any file detail page
- Original always kept as v1 — never overwritten
- Any version can be restored from Version History

NOTIFICATIONS:
- Bell icon: new uploads, status changes, new events
- Push (PWA): works like native app notifications
- Email: Monday digest, Published alerts, account actions

PWA INSTALLATION:
- Android Chrome: tap "Add to Home Screen" banner
- iPhone Safari: Share → "Add to Home Screen" → Add

TRASH AND DELETE:
- Only Admins delete files — goes to Trash, not permanently gone
- 30-day recovery window — Admin → Trash → Restore
- After 30 days: permanently purged

ACTIVITY LOG:
- Admin → Activity Log — every action tracked
- Read-only, permanent, cannot be deleted

FILE TRANSFERS (Communications Hub):
- Admin uploads fresh files → selects recipient → sends
- Recipient gets notified → downloads → edits → submits back
- Admin downloads response → marks complete
- Files stored with zero quality loss — SHA256 verified

MESSAGING:
- Admin can send messages to individuals or entire role groups
- URGENT messages bypass notification preferences — email sent immediately
- Users read messages in Communications → Messages tab

SCOPE:
Only answer questions about the Christhood CMMS.
For anything outside: "Ha, I wish I could help with everything — but I'm really only an expert on the Christhood CMMS! Is there something about the system I can help with? 😊"
`.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTED_QUESTIONS
//
// Displayed in the chat UI as quick-start prompts when the user opens the
// assistant. Keyed by page path; fall back to "default" for any unmatched route.
// The ChatbotWidget looks up the current pathname and shows 3 suggestions.
//
// kind: 'tool'   → triggers a read tool (🔍 icon)
//       'action' → triggers an action tool (⚡ icon)
//       'static' → answered from knowledge only (no icon)
// ─────────────────────────────────────────────────────────────────────────────
export type ChipKind = 'tool' | 'action' | 'static'
export interface ChipDef { text: string; kind: ChipKind }

// Concise local helpers — keeps the table below readable
const t = (text: string): ChipDef => ({ text, kind: 'tool' })
const a = (text: string): ChipDef => ({ text, kind: 'action' })
const s = (text: string): ChipDef => ({ text, kind: 'static' })

export const SUGGESTED_QUESTIONS: Record<string, ChipDef[]> = {
  '/dashboard': [
    t("What's been happening in the system today?"),
    t('Are there any files waiting to be edited?'),
    t('How much content have we uploaded this month?'),
  ],
  '/events': [
    t('What events do we have this year?'),
    t('Which events still have unedited content?'),
    t('Show me the most recently uploaded content'),
  ],
  '/upload': [
    s('How do I upload files?'),
    s('What if my upload stops halfway?'),
    t('What files have been uploaded here recently?'),
  ],
  '/admin/users': [
    t('Are any accounts currently locked?'),
    t('Who has been most active this week?'),
    a("Reset a user's password"),
  ],
  '/admin/trash': [
    t("What's currently in the trash?"),
    a('Restore a deleted file'),
    t('Which files are about to be permanently deleted?'),
  ],
  '/admin/activity-log': [
    t('What happened in the system today?'),
    t('Who downloaded files this week?'),
    t('Show me recent uploads by the team'),
  ],
  '/communications': [
    t('Check the status of my transfers'),
    t('Are there any transfers waiting for response?'),
    s('Send files to a team member'),
  ],

  // Pages answered from static knowledge
  '/media':           [s('How do I filter my files?'),        s('What do the coloured status badges mean?'), s('How do I download a file?')],
  '/search':          [s('How do I search for a file?'),      s('Can I filter by file type?'),              s('How do I search by tag?')],
  '/notifications':   [s('Why am I getting notifications?'),  s('How do I turn off emails?'),               s('What is a push notification?')],
  '/profile':         [s('How do I change my password?'),     s('Can I change my username?'),               s('How do I update my profile photo?')],
  '/admin/logs':      [t('What does the activity log show?'), t('Who has been active today?'),              s('Is the log exportable?')],
  '/admin/analytics': [s('What does this dashboard show?'),   s('How is storage calculated?'),              s('What counts as an active user?')],
  '/admin/settings':  [s('What can I configure here?'),       s('How do I change the platform name?'),      s('Where do I set notification rules?')],
  '/admin/hierarchy': [s('How do I create an event?'),        s('Can I rename a category?'),                s('How do I add a subfolder?')],
  '/messages/inbox':  [s('How do I reply to a message?'),     s('Can I send to a whole team?'),             s('What does URGENT mean?')],
  '/transfers/inbox': [s('How do I download these files?'),   s('How do I submit my edited files back?'),   s('What happens after I submit?')],
  '/transfers/new':   [s('How do I choose recipients?'),      s('Can I send to multiple people?'),          s('What file types can I transfer?')],

  'default': [
    t('Find a file for me'),
    t("What's been happening recently?"),
    a('I need help with something'),
  ],
}
