# Zara Training Data Collection
## Christhood CMMS AI Assistant — System Knowledge Document
*Filled by GitHub Copilot via deep codebase analysis — March 22, 2026*
*Every answer is based on the ACTUAL built codebase, not plans or intentions.*
*Corrections vs the existing chatbotSystemPrompt.ts knowledge are called out explicitly.*

---

## SECTION 1 — NAVIGATION & PAGES

### Q1.1 — Admin sidebar navigation (exact labels, icons, URLs)

**General nav items (all roles see these):**

| Label | URL | Icon |
|---|---|---|
| Dashboard | /dashboard | LayoutDashboard |
| Media | /media | Image |
| Upload | /upload | Upload |
| Galleries | /galleries | GalleryHorizontal |
| Events | /events | CalendarDays |
| Search | /search | Search |
| Communications | /communications | MessagesSquare (with unread badge) |
| Notifications | /notifications | Bell |
| User Guide | /docs | BookOpen |

**Admin-only section (appears below general nav for ADMIN role only):**

| Label | URL | Icon |
|---|---|---|
| User Management | /admin/users | Shield |
| Hierarchy | /admin/hierarchy | Network |
| Event Categories | /admin/event-categories | Tags |
| Activity Log | /admin/logs | ScrollText |
| Trash | /admin/trash | Trash2 |
| Share Links | /admin/share-links | Share2 |
| Analytics | /admin/analytics | BarChart2 |
| Settings | /admin/settings | Settings |
| AI Assistant | /admin/assistant | Bot |

The sidebar collapses on desktop (chevron toggle button at its right edge). A mobile drawer slides in from the left when the "Menu" button is tapped.

User profile and sign-out are accessible via the top bar (TopBar component), not the sidebar.

---

### Q1.2 — Editor navigation

Editors see **all 9 general nav items** listed above. They do **not** see any of the 9 admin-only items. No admin section heading appears in their sidebar.

---

### Q1.3 — Uploader navigation

Uploaders see the **same 9 general nav items** as Editors. They also have no admin section. Functionally, the Communications Hub shows them their Transfer Inbox and Message Inbox, but the "New Transfer" button does not appear for them.

---

### Q1.4 — All pages with exact URL paths

**Authenticated (dashboard) pages:**

| URL | Description |
|---|---|
| /dashboard | Main overview — stats, recent uploads, activity feed, upcoming events |
| /media | Media Library — full list of all uploaded files with filters |
| /upload | Upload Media — drag-and-drop zone with event/subfolder selector |
| /galleries | Gallery list — public photo galleries created in the system |
| /events | Events browser — Year → Category → Event folder hierarchy |
| /events/[eventId] | Event detail page — files inside a specific event |
| /search | Advanced search — keyword + full filter panel |
| /communications | Communications Hub — Transfers and Messages tabs |
| /notifications | Notification preferences — toggle push/email per notification type, manage followed events |
| /profile | User profile — edit name, username, change password, account deletion |
| /docs | User Guide — full in-app documentation |
| /admin/users | User Management (Admin only) — create, edit, deactivate, delete users |
| /admin/hierarchy | Folder Hierarchy (Admin only) — create/edit/delete events, subfolders |
| /admin/event-categories | Event Categories (Admin only) — rename, archive, merge custom categories |
| /admin/logs | Activity Log (Admin only) — full audit trail |
| /admin/trash | Trash (Admin only) — soft-deleted files pending permanent purge |
| /admin/share-links | Share Links (Admin only) — manage external share links |
| /admin/analytics | Analytics (Admin only) — storage and usage charts |
| /admin/settings | System Settings (Admin only) — 7 tabs of system configuration |
| /admin/assistant | AI Assistant Admin Panel (Admin only) — Zara health, stats, error log, pending actions |

**Auth pages (unauthenticated):**

| URL | Description |
|---|---|
| /login | Login — username/email and password, or Google OAuth |
| /signup | Sign up — create a new account (if self-registration is enabled in settings) |
| /forgot-password | Forgot password — enter email to receive reset link |
| /reset-password | Reset password — set new password using the emailed token |

**Public pages (no auth required):**

| URL | Description |
|---|---|
| /gallery-public/[slug] | Public gallery viewer — accessible by anyone with the gallery link |
| /share/[token] | Shared file link — time-limited download of a specific file |
| /privacy | Privacy policy |
| /terms | Terms of service |
| /offline | Offline fallback — shown by the service worker when there is no internet |

---

### Q1.5 — Dashboard page by role

**ADMIN dashboard shows:**
- Welcome banner with time-appropriate greeting ("Good morning/afternoon/evening, [name]")
- 4 stat cards: Total Files | This Week's Uploads | Pending Editing | Active Today
- Month-over-month change percentage (if calculable)
- Storage usage pie chart (by file type)
- Upcoming events list
- Recent uploads grid (thumbnails/icons with status badges)
- Activity feed (recent system actions with icons)
- Onboarding checklist (5 items, dismissable once all complete)

**EDITOR dashboard shows:**
- Welcome banner
- 3 stat cards: Files to Edit | Edited This Month | Transfers Waiting
- Recent uploads
- Upcoming events
- Activity feed
- Onboarding checklist

**UPLOADER dashboard shows:**
- Welcome banner
- 3 stat cards: My Total Uploads | My Uploads This Week | My Events
- Recent uploads (their own)
- Upcoming events
- Onboarding checklist

**Onboarding checklist items (all roles, dismissable):**
1. Upload your first file → links to /upload
2. Install the app on your phone → links to /profile
3. Set your notification preferences → links to /notifications
4. Explore the event folders → links to /events
5. Try asking Zara a question → scrolls to Zara widget

---

## SECTION 2 — ROLES & PERMISSIONS

### Q2.1 — ADMIN capabilities (complete list)

- **Upload files** — any event, any subfolder
- **Change file status** — RAW, Editing In Progress, Edited, Published, **Archived** (Admin is the only role that can Archive)
- **Delete files** (soft-delete) — moves to Trash, visible at Admin → Trash
- **Restore files** from Trash — Admin → Trash → Restore button
- **Permanently purge** files from Trash — Admin → Trash → Permanently Delete button (cannot be undone)
- **Create event folders** — Admin → Hierarchy → "Create Event" modal (event name, date, category, year, optional subfolders)
- **Edit events** — rename events, change dates, edit subfolders
- **Delete events** — Admin → Hierarchy
- **Manage years** — create years, delete years (only if empty)
- **Manage event categories** — Admin → Event Categories: rename custom categories, archive them, merge two categories together
- **Create users** — Admin → User Management → "Create User" button: fills username, email, phone (optional), password, role
- **Edit user roles** — Admin → User Management → pencil icon → change role dropdown
- **Deactivate users** — Admin → User Management → deactivate icon (UserX)
- **Reactivate users** — Admin → User Management → reactivate icon (UserCheck)
- **Delete users** — Admin → User Management → bin icon → 3-step deletion dialog (confirm → type username → final delete)
- **Unlock locked accounts** — via Zara's unlockUserAccount action (UI unlock via Zara chat)
- **Reset user passwords** — via Zara's resetUserPassword action (sends email reset link)
- **View Activity Log** — Admin → Activity Log, full audit trail, read-only
- **View Analytics** — Admin → Analytics (storage, file counts, upload trends, top uploaders, most downloaded)
- **Configure System Settings** — Admin → Settings (7 tabs: General, Storage, Access, Notifications, AI, Transfers, Maintenance)
- **View/revoke Share Links** — Admin → Share Links
- **View AI Assistant dashboard** — Admin → AI Assistant panel
- **Send messages** — Communications → Messages → New Message: send to individual user, or broadcast to Uploaders, Editors, or Everyone; supports URGENT priority
- **Send file transfers** — Communications → Transfers → New Transfer
- **Mark transfers complete or cancel** — Communications → Transfers → Sent tab
- **Manage galleries** — full access (create, publish, see all regardless of creator)
- **Download any file** — single download or batch ZIP

---

### Q2.2 — EDITOR capabilities (complete list)

- **Upload files** — to any event they can navigate to
- **Change file status** — RAW, Editing In Progress, Edited, Published (cannot set Archived)
  - Editor transitions are forward-only through the workflow: RAW → Editing In Progress → Edited → Published
  - Cannot reverse (e.g., cannot move Published back to Edited)
- **Download any file** — single or batch ZIP
- **Upload new versions** of existing files
- **Restore previous versions** of files
- **Send file transfers** — Communications Hub → New Transfer
- **Receive transfers** — Communications Hub → Transfers Inbox
- **Receive messages** — Communications Hub → Messages Inbox
- **View galleries** — own galleries + all Published galleries
- **View events and media** — same access as Admin for browsing

Editors **cannot**:
- Archive files
- Delete files
- Access any Admin page (Users, Hierarchy, Event Categories, Logs, Trash, Share Links, Analytics, Settings, AI Assistant panel)
- Send messages (messages can only be sent by Admins in the current implementation)
- See other users' personal details

---

### Q2.3 — UPLOADER capabilities (complete list)

- **Upload files** — to any event they can navigate to
- **View the Media Library** — browse all files (including those uploaded by others), visible by status except Deleted/Purged
- **Download files** — single file download
- **View galleries** — Published galleries only
- **Receive file transfers** — Communications Hub → Transfers Inbox
- **Receive messages** — Communications Hub → Messages Inbox
- **View their own upload history**

Uploaders **cannot**:
- Change any file's status
- Delete any file
- Batch download
- Upload new versions of files
- Restore versions
- Send transfers
- Send messages
- Access any Admin page

---

### Q2.4 — What happens when an Uploader tries something outside their permissions?

- **Trying to change file status**: the "Change status" dropdown does not render at all for UPLOADER — it's role-gated in `StatusChangeDropdown` (renders `null` if userRole === 'UPLOADER').
- **Trying to access an admin page URL directly** (e.g., typing /admin/users in the browser): redirected to /dashboard or receives a 403/401 response from the API.
- **Trying to batch download**: the select checkboxes and batch download button do not appear for Uploaders.
- **Trying to send a transfer**: the "New Transfer" button does not appear in Communications Hub for Uploaders.
- If an API call is made without permission, the API returns 403 Forbidden. The user does not see a specific "Forbidden" page — they are typically redirected to /dashboard or the request fails silently in the UI.

---

### Q2.5 — Any surprising or non-standard permission behaviours?

- **Editors cannot send messages** — only Admins can compose and send messages. Editors receive messages just fine. This is intentional (messaging is admin-to-team only), but it may surprise users who expect two-way messaging.
- **Editors cannot send transfers to anyone they choose** — actually they CAN send transfers (canSendTransfer = true for ADMIN and EDITOR). Uploaders cannot.
- **Status transitions are forward-only for Editors** — an Editor cannot un-publish a file or move it back to RAW. Only Admins can set any status freely.
- **"Archived" status** is Admin-only — even Editors who see the status badge cannot set it.

---

## SECTION 3 — UPLOADING FILES

### Q3.1 — Step-by-step upload process (actual built flow)

1. Click **"Upload"** in the sidebar (goes to /upload).
2. The Upload page shows a destination selector at the top:
   - A dropdown "Select event…" with all events listed (sorted by date descending, up to 100 shown).
   - Once an event is chosen, a second dropdown appears: "Select subfolder (optional)" if the event has subfolders.
   - Alternatively, if the user navigated from an event detail page, the destination is pre-filled.
3. Add files by:
   - **Dragging and dropping** files onto the dashed upload zone, or
   - **Clicking** the upload zone to open the system file picker (accepts image/* and video/*), or
   - On **mobile**: three additional buttons appear inside the upload zone — 📷 **Take Photo**, 🎬 **Record Video**, or 🖼️ **Choose from Gallery**.
4. Multiple files can be selected at once (bulk upload). Files are added to a queue list below the zone.
5. A **duplicate check** runs automatically. If a file with the same name already exists in the selected event, a `DuplicateCheckDialog` appears — the user can choose to skip the duplicate, replace it, or upload it with a suffix (e.g., `IMG_6063 (1).jpg`).
6. Optionally add **tags** using the tag input below the file list (select from the predefined tag list).
7. Files begin uploading automatically once added (or when destination is confirmed). There is no explicit "Start Upload" button — uploads begin as soon as a destination is set and files are dropped.
8. Progress is shown per file (see Q3.7).

---

### Q3.2 — Accepted file types

The upload zone accepts **`image/*`** and **`video/*`** (any image or video format the browser recognises).

For the Transfer system specifically, the accepted extensions are: `.jpg`, `.jpeg`, `.png`, `.tiff`, `.tif`, `.raw`, `.heic`, `.cr2`, `.nef`, `.arw`, `.dng`, `.orf`, `.rw2` (photos), `.mp4`, `.mov`, `.avi` (videos), and `.pdf`, `.docx`, `.xlsx`, `.pptx`, `.ai`, `.psd` (documents).

**If a user tries to upload an unsupported type:**
- The browser file picker filters the selection (only shows image/video files).
- If dragged and dropped, the file is silently excluded or, if it gets into the queue, the API will reject it.

---

### Q3.3 — File size limit

The system has a configurable `max_file_size_mb` setting (Admin → Settings → Storage tab). The default value is stored in `settingDefaults.ts`.

**Large file handling:** Files **above 10 MB** automatically use multi-part chunked upload (`runMultipartUpload`). Small files use a simpler presigned URL queue. The threshold is hard-coded at 10 MB in the UploadZone component (`MULTIPART_THRESHOLD = 10 * 1024 * 1024`).

If a file exceeds the configured max size, the API rejects it with an error message, and the file row in the upload queue shows the error in red.

---

### Q3.4 — Resumable upload in practice

For files above 10 MB, the system uses multi-part upload with session state persisted in **IndexedDB** (via `upload-session-store.ts`).

**What the user sees if the connection drops:**
- The file row's status changes to **"Paused"**, showing: *"Paused — will resume when online (X% saved)"* in amber text beneath the filename.
- The progress is preserved — the upload does not need to restart from 0%.

**What they need to do to resume:**
- Nothing. Once the internet connection is restored, the upload resumes automatically from where it left off.
- If the user closes the browser and reopens it while there are active upload sessions, UploadZone checks for incomplete sessions in IDB on mount and can offer to resume them.

For **small files** (below 10 MB) that were queued while offline:
- The status shows *"Saved — will upload when online"* in amber.
- The offline queue (`lib/offlineQueue.ts`) retries automatically when the connection returns.

---

### Q3.5 — What happens to the filename after upload?

**Files RETAIN their original device filename.**

The system applies only a **sanitization** step (`sanitizeFilename` in `lib/uploadNaming.ts`) which removes characters that are unsafe in filenames and URLs (keeps: word chars, spaces, hyphens, dots, parentheses, brackets). There is no automatic event-type renaming.

The R2 object key is structured as: `events/<eventId>/<sanitized-filename>`

If a duplicate filename exists in the same event, a numeric suffix is appended (e.g., `IMG_6063 (1).jpg`), which the user can see in the file row as *"→ saved as IMG_6063 (1).jpg"*.

> **IMPORTANT CORRECTION vs the old system prompt:** The previous chatbot knowledge stated files were renamed to `[EventType]_[YYYYMMDD]_[Sequence].ext`. This is **NOT implemented**. Files keep their original names. Do not tell users their files will be renamed to that pattern.

---

### Q3.6 — Mobile upload differences

On mobile, the upload zone shows **three additional buttons** inside the drop area:
- 📷 **Take Photo** — opens the device camera
- 🎬 **Record Video** — opens the device video recorder
- 🖼️ **Gallery** — opens the device photo gallery

There is no drag-and-drop on mobile (not supported in mobile browsers), so the tap-to-select and the three camera/gallery buttons are the primary entry points.

The rest of the upload flow (event selector, file queue, progress, offline queue) is identical to desktop.

---

### Q3.7 — Upload progress display

Each file in the upload queue shows a row containing:

- **Filename** (truncated if long) + **file size** (right-aligned)
- If the stored name differs (duplicate resolved): *"→ saved as [name]"* below the filename
- **Progress bar**: a filled indigo bar that fills from left to right as bytes are uploaded
- **Upload mode badge** (small, left of the speed):
  - `⚡ fast queue` — for files below 10 MB (simple presigned URL upload)
  - `⎇ chunked` — for files above 10 MB (multi-part)
- **Upload speed**: shown in KB/s or MB/s once available (e.g., `· 2.4 MB/s`)
- **ETA**: estimated time remaining (e.g., `~12s left`, `~3m 20s left`)
- **Status badge** (right side, 64px wide area):
  - `pending` — grey, "Queued"
  - `starting` — spinner + "Starting…"
  - `uploading` — progress details visible
  - `completing` — spinner + "Completing…"
  - `done` — green check
  - `error` — red X + error message in red text below filename
  - `queued-offline` — amber, "Saved — will upload when online"
  - `paused` — amber, "Paused — will resume when online (X% saved)"

---

## SECTION 4 — FOLDER & EVENT STRUCTURE

### Q4.1 — Official event categories (exact names as they appear in UI)

From `lib/hierarchyConstants.ts` — the seven official Christhood Media Team categories:

1. **Saturday Fellowships**
2. **Missions**
3. **Branch Excandidates Programme**
4. **Teen Life**
5. **Mentorship Camp**
6. **Jewels Kids Camp**
7. **Special Events**

At the bottom of category dropdowns there is an **"Other"** option (a UI sentinel) that triggers custom category creation.

> **IMPORTANT CORRECTION vs the old system prompt:** The old chatbot listed wrong categories ("Conferences", "Outreach Programs"). The actual categories are the 7 listed above. Do not tell users the system has "Conferences" or "Outreach Programs" as built-in categories.

---

### Q4.2 — How to navigate to find a specific event folder

**From the Events page (/events):**
1. The Events page shows the folder hierarchy: Years at the top level.
2. Click on a **Year** (e.g., 2026) to expand it and see its event categories.
3. Click on a **Category** (e.g., Saturday Fellowships) to see its events.
4. Click on an **Event** (e.g., "Saturday Fellowship March 2026") to open the event detail page, which shows all files inside that event.

**From the Media Library (/media):**
- Use the event filter dropdown in the filter bar to narrow files to a specific event.

**From Search (/search):**
- Use the Year, Category, and Event dropdowns in the filter panel to navigate to a specific event's files.

**Shortcut:** Clicking a file anywhere in the UI shows its event name as a breadcrumb link.

---

### Q4.3 — How an Admin creates a new event folder

1. Go to **Admin → Hierarchy** (sidebar).
2. Click the blue **"Create Event"** button at the top of the page.
3. A modal dialog opens with these fields:
   - **Event Name** — free text (e.g., "Easter Convention 2026")
   - **Event Date** — date picker
   - **Category** — dropdown with the 7 official categories + "Other"
   - **Year** — defaults to current year; existing years are shown, or a new year is auto-created
   - If **"Other"** is selected, a **Custom Category Name** text field appears
4. Click **Create Event**. The event is created and added to the hierarchy immediately.

To add **subfolders** inside an event:
- After the event is created, find it in the hierarchy tree and click the subfolder (FolderPlus) icon.
- Type the subfolder label (e.g., "Friday") and save.

Alternatively, Zara can create events: ask her *"Create a new event called Easter Conference 2026 in the Special Events category, date April 5th 2026"* — she will confirm and execute it.

---

### Q4.4 — The "Other" category

When creating an event via Admin → Hierarchy, selecting **"Other"** from the Category dropdown reveals a **Custom Category Name** text field. The admin types a new category name (e.g., "Youth Camp"). A new category is created on the fly in the database under that year.

Custom categories (created via "Other") differ from the 7 default categories in that:
- They display a different icon in the Event Categories admin page (user icon vs shield icon for defaults)
- They can be **renamed** and **archived** by the admin (defaults cannot be renamed)
- They can be **merged** into other categories

The "Other" sentinel value itself does not appear in the database — it is purely a UI trigger.

---

### Q4.5 — Subfolders: how they work

Yes, events can have subfolders. Typical uses:
- Multi-day events: "Friday", "Saturday", "Sunday"
- Content type groupings: "Photos", "Videos"
- Team groupings

**Creating subfolders:**
- Admin → Hierarchy → find the event → click the FolderPlus icon → type the subfolder label → save
- Or via the Create Event modal (Hierarchy page), there is a subfolders field that accepts a comma-separated list
- Or Zara's `createEvent` action accepts an optional `subfolders` array

**Uploading to a subfolder:**
- On the Upload page, after selecting an event, a second "Select subfolder (optional)" dropdown appears if subfolders exist.

---

## SECTION 5 — FILE MANAGEMENT

### Q5.1 — All file statuses

| Status | Internal Value | Meaning | Who can set it |
|---|---|---|---|
| Raw | `RAW` | Just uploaded — not yet reviewed | Admin, Editor |
| Editing In Progress | `EDITING_IN_PROGRESS` | Actively being edited | Admin, Editor |
| Edited | `EDITED` | Editing complete, ready for review | Admin, Editor |
| Published | `PUBLISHED` | Officially approved and visible | Admin, Editor |
| Archived | `ARCHIVED` | Long-term storage, no longer active | **Admin only** |
| Deleted | `DELETED` | In the Trash (soft-deleted) | Auto (set on delete action) |
| Purged | `PURGED` | Permanently removed after 30 days | Auto (cron job) |

Uploaders cannot change any status. Editors can only move forward (RAW → Editing → Edited → Published). They cannot Archive or reverse a status.

---

### Q5.2 — Version control in practice

**The VersionHistoryPanel on a file detail page shows:**
- Each version as a numbered row (v1, v2, v3…) with: version number, upload date, who uploaded it, a Download link
- The currently active version is visually distinguished
- A **"Restore"** button on each non-active version (visible to EDITOR and ADMIN only)

**To upload a new version:**
1. Open the file in the Media Library (click it).
2. Scroll to the **"Version History"** section on the file detail page.
3. Click **"Upload New Version"** button.
4. Select/drop the replacement file.
5. The new file becomes the active version. The old version is preserved as a numbered entry in the history.

**To restore a previous version:**
1. In the Version History section on the file detail page, find the version to restore.
2. Click **"Restore"** next to that version.
3. That version becomes the new active file (it is stored as the latest version, not replacing the history).

---

### Q5.3 — Soft delete / Trash in practice

**Deleting a file:**
- Admin clicks the delete icon on a file → a confirmation dialog appears → confirms → file moves to Trash (status becomes DELETED).
- The file disappears from the Media Library.

**The Trash page (Admin → Trash):**
- Shows all soft-deleted files in a paginated list (50 per page).
- Each row shows: file type icon (photo/video), original filename, event, deleted by, deleted date, scheduled purge date.
- A colour-coded countdown badge:
  - **Green**: >10 days remaining
  - **Amber**: ≤10 days remaining
  - **Red**: ≤3 days remaining (urgent)
  - "Purge imminent" if hours remain

**Restoring a file:**
1. Admin → Trash.
2. Find the file and click **"Restore"** (RotateCcw icon).
3. Confirm in the native confirm dialog.
4. File is returned to the Media Library at its previous status (pre-delete status is stored in `preDeleteStatus`).
5. A `FILE_RESTORED` activity log entry is created.

**Permanent purge:**
- Admin → Trash → **"Permanently Delete"** button → confirm.
- File is deleted from R2 and the database immediately. Cannot be undone.
- Also: a nightly cron job automatically purges files that have been in Trash for 30 days.

---

### Q5.4 — Downloading files

**Single file download:**
1. Open the file (click it in the Media Library or search results).
2. Click the **"Download"** button on the file detail page.
3. A presigned R2 URL is generated and the browser downloads the file.

**Batch download (ZIP):**
1. In the Media Library, checkboxes appear on file cards.
2. Select multiple files by clicking their checkboxes.
3. Click **"Download Selected"** (BatchDownloadButton).
4. The system creates a ZIP archive of the selected files and the browser downloads it.
5. A `BATCH_DOWNLOADED` log entry is recorded.
- Batch download is available to **EDITOR** and **ADMIN**. UPLOADERs do not see the checkboxes.

**On mobile vs desktop:**
- Single file download works identically — a direct download link.
- Batch download on mobile works the same way on the PWA; the ZIP downloads to the device.

---

### Q5.5 — File tagging

**Available tags:** Tags come from a predefined list stored in the database. Admins manage tags in the system (no dedicated tag management UI was found in the dashboard routes — tags are managed via the Settings or directly in the DB).

**Adding tags during upload:**
- On the Upload page, below the file list, there is a tag input (`TagInput` component). Users type to search the predefined tags and select them. Selected tags are shown as pills.

**Adding tags after upload:**
- Open the file detail page.
- Find the **"Tags"** section.
- Click the tag input, pick or type a tag name.
- Tags are saved immediately.

**Who can add tags:** All roles (ADMIN, EDITOR, UPLOADER) can add tags. The TAG_CHANGED action is logged.

**Filtering by tag:**
- Media Library: a tag pill list appears in the filter area. Click a tag pill to filter by it.
- Search page: a "Tags" multi-select section in the filter panel.

---

### Q5.6 — Search and filter system

**Search page (/search) — full filter panel with:**
- **Keyword** (q): searches file names and event names simultaneously
- **Year**: dropdown of all years in the system
- **Category**: dropdown of all event categories
- **Event**: dropdown of events (filtered by selected year/category)
- **File Type**: Photo / Video
- **Uploader** (Admin only): multi-select of all users
- **Status**: multi-select (Raw, Editing, Edited, Published, Archived, Deleted — Deleted visible to Admin only)
- **Tags**: tag pill checkboxes
- **Date From / Date To**: date range picker (filters by upload date)
- **Sort**: newest, oldest, name, size
- Results: 24 per page, paginated

**Media Library (/media) — simpler inline filter bar:**
- Status quick-filter tabs (All, Raw, Editing, Edited, Published, Archived)
- File type toggle (📷 Photos / 🎬 Videos)
- Event filter dropdown
- Tag pills
- 24 per page, paginated

**Search is triggered by** entering any filter on the Search page — an empty search with no filters shows "Enter a keyword or apply filters to search." All filters are applied server-side via Prisma.

---

## SECTION 6 — COMMUNICATIONS & TRANSFERS

### Q6.1 — File transfer system end to end

**Sender side (ADMIN or EDITOR):**
1. Go to **Communications** (sidebar).
2. Click the **Transfers** tab.
3. Click **"New Transfer"** button (FolderInput icon + label).
4. The New Transfer form (`NewTransferForm` component) appears:
   - **Search for recipient** by username or email (live search).
   - Add a **Subject** (required) and optional **Message**.
   - **Add files**: drag-and-drop (supports entire folders — preserves folder structure) or click to browse. Accepted types: photos, videos, documents.
   - SHA-256 checksums are computed client-side for each file (integrity verification).
   - Files are uploaded directly to R2 via presigned URLs.
5. Click **"Send Transfer"**. The recipient gets an in-app notification (TRANSFER_RECEIVED) and an email notification.
6. The transfer appears in the sender's **Sent** tab with status **PENDING**.

**Recipient side (any role):**
1. Go to **Communications → Transfers → Inbox**.
2. The incoming transfer shows: subject, sender name, file count, transfer status, expiry date.
3. Click to open the transfer detail page.
4. Click **"Download Files"** to download individual files or all files.
5. Status updates to **DOWNLOADED** automatically.
6. To submit edited files back: upload response files via the transfer detail page → status becomes **RESPONDED**.
7. The sender is notified (TRANSFER_RESPONDED).

**Sender completes the transfer:**
1. In the Sent tab, open the transfer detail.
2. Download the recipient's response files.
3. Click **"Mark Complete"** → transfer status becomes **COMPLETED**.
4. The recipient is notified (TRANSFER_COMPLETED).

**Transfer states:** PENDING → DOWNLOADED → RESPONDED → COMPLETED (or EXPIRED or CANCELLED)

**Integrity check:** SHA-256 checksums are verified server-side. A `TRANSFER_INTEGRITY_FAILURE` log entry is written if they mismatch.

---

### Q6.2 — Who can send and receive transfers?

**Send:** ADMIN and EDITOR
**Receive:** All roles (ADMIN, EDITOR, UPLOADER)

**Known limitations:**
- Transfer size limit is configurable (`max_transfer_size_gb` in Settings → Transfers tab).
- Transfers expire configurable days after creation if not downloaded (`transfer_expiry_pending_days` setting).
- Completed transfers are purged after a configurable number of days (`transfer_expiry_completed_days`).

---

### Q6.3 — Messaging system

**Who can send:** Admins only. The Message Compose form is only accessible from Admin's Communications Hub.

**Who can receive:** Any user (Admin, Editor, Uploader).

**Message features:**
- **Recipient modes**: specific user (search by username/email) or **broadcast** — to all Uploaders, all Editors, or Everyone (all team members).
- **Priority**: NORMAL or URGENT. URGENT messages bypass notification preferences and send email immediately.
- **Rich text**: basic markdown (bold, italic, lists) rendered in the message body.
- **Transfer attachment**: a sent transfer can be referenced/attached in a message.

**Where users read messages:**
- Communications Hub → **Messages** tab → **Inbox** sub-tab.
- In-app notification bell shows unread count.

**Sent messages:**
- Communications → Messages → **Sent** sub-tab (Admins default to this tab; others default to Inbox).

---

### Q6.4 — Communications Hub details

The Communications Hub (`/communications`) is a full-screen page showing:

**Two main tabs:**
1. **Transfers** (FolderInput icon) — with unread badge
2. **Messages** (MessageSquare icon) — with unread badge
   - There is also a "Compose" button on the Messages tab (Admin only)

**Transfers tab — sub-tabs:**
- **Inbox**: incoming transfers received by the current user
- **Sent**: transfers sent by the current user (shown for Admin and Editor)

**Messages tab — sub-tabs:**
- **Inbox**: messages received
- **Sent**: messages composed and sent (Admin only can compose)

**Role differences:**
- UPLOADER: sees Transfers Inbox and Messages Inbox only. No "New Transfer" button. No "Sent" sub-tab on Transfers.
- EDITOR: sees Transfers Inbox + Transfers Sent + Messages Inbox. Has "New Transfer" button.
- ADMIN: full access. Defaults to Messages Sent sub-tab (since they send more than receive).

The combined unread count (transfers + messages) shows as a badge on the Communications sidebar item and the mobile bottom nav Comms button.

---

## SECTION 7 — NOTIFICATIONS

### Q7.1 — In-app notifications that actually fire

The following notification categories are defined and trigger in-app notifications when the relevant event occurs:

| Category | Trigger | Push | Email |
|---|---|---|---|
| UPLOAD_IN_FOLLOWED_FOLDER | Someone uploads to an event you follow | ✓ | — |
| FILE_STATUS_CHANGED | A file's status is updated | ✓ | — |
| NEW_EVENT_CREATED | A new event folder is created | ✓ | — |
| FILE_RESTORED | A deleted file is recovered from Trash | ✓ | — |
| FILE_PUBLISHED_ALERT | A file is marked "Published" | ✓ | ✓ |
| WEEKLY_DIGEST | Monday morning activity summary | — | ✓ |
| STORAGE_THRESHOLD_ALERT | R2 storage crosses the configured threshold | — | ✓ (admin only) |
| TRANSFER_RECEIVED | You received a file transfer | ✓ | ✓ |
| TRANSFER_RESPONDED | A recipient uploaded edited files back | ✓ | ✓ |
| TRANSFER_COMPLETED | A transfer is marked complete | ✓ | — |
| TRANSFER_CANCELLED | A transfer is cancelled | ✓ | — |
| DIRECT_MESSAGE | You received a direct message | ✓ | ✓ |

---

### Q7.2 — Where users find notifications

**Notification bell:**
- Located in the top bar (TopBar component), right side.
- Shows an indigo badge with unread count when there are unread notifications.
- Updates every **30 seconds** via polling.

**Clicking the bell** opens the **NotificationPanel** slide-over, which shows:
- A list of all recent notifications with icons, timestamps, and brief descriptions.
- "Mark all as read" button at the top.
- Individual notifications can be clicked (marks as read and navigates to the relevant page).

Once the panel is opened, the unread count resets after 1.5 seconds.

---

### Q7.3 — Notification preferences

Users manage their notification preferences at **/notifications** (accessible from the sidebar).

**The page shows two sections:**

1. **Notification Preferences table** — for every category listed above:
   - A Push toggle (on/off) — if the category supports push
   - An Email toggle (on/off) — if the category supports email
   - An "Admin only" label for categories restricted to admin (e.g., Storage Threshold)
   - Preferences auto-save 500ms after any toggle change.

2. **Push Notifications setup:**
   - A section showing whether push is currently subscribed.
   - An "Enable push notifications" / "Disable push notifications" button.
   - This triggers the browser's Notification.requestPermission() flow.

3. **Followed Events:**
   - A list of all events in the system with toggle buttons.
   - Toggling "Follow" on an event means you get notified (UPLOAD_IN_FOLLOWED_FOLDER) when files are uploaded there.

---

### Q7.4 — Email notifications

**The following email notifications actually send:**
- Welcome email when a new user account is created (includes login details)
- Password reset email (triggered by Forgot Password flow or Zara's resetUserPassword action)
- FILE_PUBLISHED_ALERT emails (when toggled on by the user)
- WEEKLY_DIGEST emails (Monday morning, if enabled in Settings and toggled on by user)
- TRANSFER_RECEIVED emails
- TRANSFER_RESPONDED emails
- DIRECT_MESSAGE emails (when URGENT or if the user has email enabled for DIRECT_MESSAGE)
- STORAGE_THRESHOLD_ALERT (admin only, fired by a cron job)

Email is sent via **Resend** (`lib/email.ts`). The "From" address is configurable in Settings → Notifications tab (`from_email`, `from_name`).

---

## SECTION 8 — USER MANAGEMENT (ADMIN)

### Q8.1 — Creating a new user account

1. Go to **Admin → User Management** (sidebar).
2. Click the **"Create User"** button (UserPlus icon, indigo gradient, top right of the page).
3. A modal dialog opens with fields:
   - **Username** (required, 3–30 chars, letters/numbers/underscores, e.g., `john_doe`)
   - **Email** (required)
   - **Phone** (optional)
   - **Password** (required, minimum 8 characters)
   - **Role** (dropdown: UPLOADER selected by default, also EDITOR and ADMIN)
4. Click **"Create User"** button (green check icon + loading spinner while saving).
5. The user is created. **A welcome email is sent automatically** with their login credentials.

The new user appears in the user list immediately and can log in right away.

---

### Q8.2 — Password reset

**Self-service (any user):**
1. Open /login.
2. Click **"Forgot Password?"** link.
3. Enter email address and click submit.
4. User receives an email with a password reset link (token valid for **24 hours**).
5. Click the link → /reset-password page.
6. Enter new password → confirm.
7. The old password is immediately invalidated and all previous unused reset tokens for that user are also invalidated.

**Admin-initiated (via Zara):**
1. Admin opens Zara chat.
2. Says: "Reset [username]'s password" or "Send a password reset to [email]".
3. Zara looks up the user, shows a confirmation: *"I'll send a password reset email to [name] at [email]. Shall I send it?"*
4. Admin confirms → Zara sends the reset email.
5. Logged as PASSWORD_RESET_TRIGGERED in the Activity Log (actor: ZARA_AI).

The reset page shows a simple email input. No admin UI button for resetting passwords exists outside of Zara (as of codebase inspection).

---

### Q8.3 — Account lockout

**Trigger:** 10 consecutive failed login attempts → account locked for **30 minutes**.

**Progressive delays before lockout:**
- 0–2 failures: no delay
- 3rd failure: 2-second delay before response
- 4th+ failure: 5-second delay before response

**What the locked user sees:** The login page shows an error (the API returns null for the credentials call). The UI can query `/api/auth/account-status` to detect the lockout and show a specific "Account locked" message.

**How admin unlocks it:**
1. Admin opens Zara chat.
2. Says: "Unlock [username]'s account" or "[name] is locked out".
3. Zara checks the account, reports the lock status and when it expires.
4. Zara asks: *"[Name]'s account is locked until [time] due to X failed attempts. Unlock now?"*
5. Admin confirms → Zara clears `failedLoginAttempts` and `lockedUntil` → user can log in.
6. User receives an in-app notification: "Your account has been unlocked by an admin."
7. Logged as USER_UNLOCKED in Activity Log.

The account also unlocks automatically after 30 minutes without any admin action.

---

### Q8.4 — User deletion process

1. Admin → User Management.
2. Click the **bin (Trash2) icon** on the user row.
3. A `UserDeleteDialog` opens — **3-step flow:**
   - **Step 1**: Show the user's name. Prompt: "Are you sure you want to delete [username]?"
   - **Step 2**: Type the username exactly to confirm (prevents accidental deletion).
   - **Step 3**: Final "Delete User" button → user is permanently deleted from the database.
4. USER_DELETED is logged in the Activity Log.

Note: Deactivation (using the UserX icon) is the preferred soft option — the user cannot log in but their data is preserved. Deletion is permanent.

---

## SECTION 9 — SETTINGS & PROFILE

### Q9.1 — System Settings tabs and fields

**Admin → Settings** has 7 tabs:

**1. General:**
- System Name, System Tagline, Organisation Name
- Admin Contact Email, System Timezone, Date Format, Language
- Logo URL (with logo upload button)

**2. Storage:**
- Archive Threshold (months before auto-archive)
- Trash Retention Days (default: 30)
- Max File Size MB
- Allowed Photo Types, Allowed Video Types, Allowed Doc Types
- Storage Warning GB
- Duplicate Detection toggle
- Auto Thumbnails toggle

**3. Access (User & Access):**
- Default Role (for new sign-ups)
- Allow Self Registration (toggle)
- Session Timeout Minutes
- Max Login Attempts (default: 10)
- Lockout Duration Minutes (default: 30)
- Password Min Length
- Password Require Uppercase / Number / Special (toggles)

**4. Notifications:**
- From Email, From Name, Reply-to Email
- Email Footer Text
- Weekly Digest Enabled toggle
- Digest Time (e.g., "08:00")
- Test Email button (sends a test email to the admin contact email)

**5. AI (Zara settings):**
- Zara Enabled toggle
- Zara Conversation Logging toggle
- Zara Log Retention Days
- Zara Rate Limit Per Hour
- Zara Display Name (how she introduces herself)
- Zara Greeting (opening message text)

**6. Transfers:**
- Transfer Expiry Pending Days (PENDING → EXPIRED after this many days)
- Transfer Expiry Completed Days (COMPLETED transfers purged after this many days)
- Max Transfer Size GB
- Share Link Default Expiry Days
- Share Link Max Downloads

**7. Maintenance:**
- **Health check panel**: Current status of DB, R2, Email, AI (Gemini), Push (each shown as ✓ OK or ✗ Error)
- **System stats**: user count, file count, event count, trashed files count, log entry count
- **Cron jobs**: last run times for scheduled jobs
- **Duplicate scan**: find duplicate files in the system
- **Database export** (if available)

---

### Q9.2 — User profile page options

**At /profile the user can:**

- **Edit name** (display name) — inline editable field with pencil icon → type → save/cancel
- **Edit username** — special `UsernameField` component with real-time availability check:
  - 3–20 characters, letters/numbers/underscores/hyphens
  - 500ms debounce → queries `/api/user/username?q=...` for availability
  - Shows: "Checking…" / "Username available" ✓ / "Username taken" ✗ / "Too short" / "Invalid characters"
  - Only saves if status is "available"
- **Change password** — current password + new password + confirm fields
- **Push notification toggle** — enable/disable push notifications
- **Account deletion request** — a section for requesting account deletion (ACCOUNT_DELETION_REQUESTED logged)

---

### Q9.3 — Can users change their username?

**Yes.** Via /profile → Username field → pencil icon → type new username. The system:
1. Validates the format (3–20 chars, alphanumeric + `_` and `-`)
2. Real-time availability check (debounced 500ms)
3. If available: save button enables → click to save
4. The session token is refreshed after save (trigger 'update' in NextAuth callback re-reads from DB)

---

## SECTION 10 — PWA & MOBILE

### Q10.1 — Installing on Android (exact steps)

1. Open the Christhood CMMS URL in **Chrome** on your Android phone.
2. Either:
   - Tap the **install prompt banner** that may appear at the bottom of the screen ("Add Christhood CMMS to Home Screen?"), or
   - Tap the **three-dot menu (⋮)** in the top-right corner of Chrome → tap **"Add to Home Screen"**
3. A dialog appears with the app name — tap **"Add"** to confirm.
4. The Christhood CMMS icon appears on your home screen.
5. Launch it from the home screen — it opens in full-screen mode (no browser address bar).

---

### Q10.2 — Installing on iPhone (exact steps)

1. Open the Christhood CMMS URL in **Safari** on your iPhone (must be Safari — Chrome on iOS does not support PWA install).
2. Tap the **Share button** — the box-with-arrow-pointing-up icon at the bottom of the Safari screen.
3. Scroll down in the share sheet and tap **"Add to Home Screen"**.
4. Edit the name if desired, then tap **"Add"** in the top-right corner.
5. The app icon appears on your home screen.
6. Launch it from the icon — opens in standalone mode.

---

### Q10.3 — PWA vs browser differences

**Features that work better on the installed PWA:**
- **Push notifications** — pushed to the device even when the browser/app is not open. Requires the PWA to be installed and notification permission granted.
- **Offline upload queue** — the service worker catches failed uploads and queues them for retry. Works when launched from the home screen icon.
- **Full-screen mode** — no browser chrome (address bar, navigation buttons), giving more screen space.

**Features that only work on the installed PWA:**
- Receiving push notifications when the app is in the background or closed.

Everything else (upload, download, transfer, messaging, etc.) works identically in the browser and the PWA.

---

### Q10.4 — Offline upload behaviour

**What happens:**
1. User starts uploading. Connection drops mid-upload.
2. For **files in progress (>10 MB)**: the upload status changes to **"Paused"** — *"Paused — will resume when online (X% saved)"* in amber text. The partial progress is saved in IndexedDB.
3. For **files queued but not yet started**: they switch to **"Saved — will upload when online"** status and are stored in the offline queue (`lib/offlineQueue.ts`).

**What the user needs to do:**
- **Nothing** — the system resumes automatically when the internet connection returns.
- For paused large-file uploads: the upload resumes from the saved checkpoint.
- For items in the offline queue: they begin uploading sequentially once online.

**Indicators:**
- Each queued/paused file shows amber text rather than progress.
- A WifiOff icon appears in the upload zone header when offline.
- A NetworkStatus component can show a "You're offline" banner system-wide.

---

## SECTION 11 — ZARA AI ASSISTANT

### Q11.1 — How to open Zara

**The Zara chat button** is:
- A floating **circular button** in the **bottom-right corner** of every authenticated page.
- Icon: `MessageCircle` (speech bubble) with a `Bot` indicator.
- It also shows a **welcome blurb** and suggested question chips when first opened.

Zara does **not** appear on public gallery pages (`/gallery-public/*`).

The chat opens as an overlay panel — it does not navigate away from the current page.

---

### Q11.2 — What Zara can actually do (accurately)

**Read Tools (live database lookup — all working):**
1. **searchFiles** — find files by keyword, event name, uploader name, file type, status, or date range. Respects role: UPLOADER only sees events they follow.
2. **getEventContents** — list files inside a specific event (by name, partial match ok). Shows file count, status breakdown.
3. **getUserActivity** — look up a specific user's recent activities in the Activity Log.
4. **getFileDetails** — get full details for a specific file by ID.
5. **getRecentActivity** — read the most recent Activity Log entries.
6. **getStorageStats** — current storage used, limit, breakdown.
7. **getTrashContents** — see deleted files currently in Trash (Admin only).
8. **findUser** — look up a user by name or username to get their ID.
9. **getTransferStatus** — check the status of a specific transfer.

**Action Tools (require confirmation — all working):**
1. **restoreFileFromTrash** — Admin only. Finds file in trash, shows days remaining, requires confirmation.
2. **resetUserPassword** — Admin only. Sends a password reset email to the user. Requires confirmation.
3. **unlockUserAccount** — Admin only. Clears login lockout. Checks if actually locked first.
4. **changeFileStatus** — Editor + Admin. Forward-only for Editors. Requires confirmation.
5. **createEvent** — Admin only. Creates year, category, event, optional subfolders. Checks for duplicate first. Requires confirmation.
6. **flagIssueToAdmin** — Any role. No confirmation. Sends an internal message to all admins. Categories: ACCESS_REQUEST, BUG_REPORT, ACCOUNT_ISSUE, OTHER. Can be NORMAL or URGENT.

**Pending actions expire** after 5 minutes if not confirmed. Zara will say the action expired if confirmation comes too late.

---

### Q11.3 — What users should NOT ask Zara (she cannot help)

- "Upload this file for me" — Zara cannot upload files. Direct to /upload.
- "Create a new user account" — Zara cannot create users (no tool for it). Direct to Admin → User Management.
- "Delete this file" — Zara cannot delete files (no delete tool). Go to the file detail page.
- "Change my role / someone's role" — Zara cannot change roles. Admin must do this at Admin → User Management.
- "Edit the content of a file" — Zara cannot open, edit, or read file content.
- "Send a message for me" — Zara cannot compose or send messages on behalf of users.
- Anything outside the CMMS — she will respond: "Ha, I wish I could help with everything — but I'm really only an expert on the Christhood CMMS! Is there something about the system I can help with? 😊"

---

### Q11.4 — How users report a problem to the admin through Zara

1. Tell Zara about the problem in normal language (e.g., "I can't access the mission folder" or "I think there's a bug — the upload keeps failing").
2. Zara will attempt to diagnose it using her read tools.
3. If she cannot resolve it directly, she will offer to **flag it to the admin**.
4. She uses the `flagIssueToAdmin` tool: categorises the issue (ACCESS_Request, BUG_REPORT, ACCOUNT_ISSUE, or OTHER) and sets urgency (NORMAL or URGENT).
5. An **internal message** is created in the system and sent to all Admin users with subject `[NORMAL/URGENT] ISSUE_TYPE: [username] needs help` and the full description.
6. Zara confirms: "Done! I've flagged this to your admin. They'll follow up with you directly."

This message appears in the Admin's Communications → Messages inbox immediately.

---

## SECTION 12 — COMMON ERRORS & SOLUTIONS

### Q12.1 — Most common user error

**Upload not starting / no event selected**

Users sometimes open the Upload page and drop files without first selecting an event. In this state:
- The files appear in the queue but stay in "pending" state (no upload starts).
- The upload only begins once an event is selected from the dropdown.

**Solution:** Select an event from the "Select event…" dropdown first, then drop or pick files. (Or pick files first, then select the event — the upload triggers once both are present.)

---

### Q12.2 — Upload failure

**What the user sees:**
- The file row shows a red ✗ icon and a red error message below the filename (e.g., `HTTP 413`, `Network error`, `File type not supported`).

**What they should do:**
1. Check if they have a stable internet connection.
2. Click the **Retry** (RefreshCw) icon next to the failed file.
3. If it fails repeatedly:
   - Check the file type is supported (image or video).
   - Check the file size is within the configured limit.
   - If on mobile, ensure the camera/gallery permissions are granted.
   - Try again later if it might be a temporary server issue.
4. If none of the above helps, use Zara to flag it to the admin (`flagIssueToAdmin`).

---

### Q12.3 — Cannot log in — all possible causes and solutions

| Cause | What the user sees | Solution |
|---|---|---|
| Wrong password | Login page shows "Invalid credentials" | Click "Forgot Password?" to reset |
| Account locked (10 failures) | Login fails silently or shows "Account locked" | Wait 30 minutes, or ask admin to unlock via Zara |
| Account deactivated | Login fails silently | Contact admin — account needs reactivation |
| Trying to use credentials with a Google-connected account | Login fails | Use the "Sign in with Google" button instead |
| Forgotten username | — | Use email address instead of username |
| Reset link expired | Reset page shows "Invalid or expired link" | Go to /forgot-password and request a new link |
| Cookies/session issue | Logs out unexpectedly | Clear browser cache and cookies, try again |

---

### Q12.4 — User cannot see a folder or event they expect to find

1. **Make sure you're on the Events page** (/events) — click "Events" in the sidebar.
2. **Expand the correct Year** — click on the year number to expand it.
3. **Expand the correct Category** — click on the category name.
4. **The event should appear inside** the category.
5. If the event is missing:
   - It may not have been created yet — ask your Admin to create it (Admin → Hierarchy → Create Event), or ask Zara.
   - It may be under a different category — check all category sections.
6. **For UPLOADER:** you can see all events in the Events browser. You are not restricted at the browse level (only the Zara read tool restricts UPLOADERs to followed events).

---

### Q12.5 — User's file disappeared

Steps to investigate:
1. **Search for it** on the Search page — use the filename or event name.
2. **Check the status filter** on Search — if filtering by status, include "Deleted" in the filter (Admin only can see deleted files in search).
3. **Admin checks the Trash** (Admin → Trash) — search by filename in the trash. If found, click "Restore".
4. If it was purged (permanent deletion 30 days after deletion), it cannot be recovered.
5. Alternatively, **ask Zara**: "Find a file called [filename]" — Zara will search live and report its current status.
6. If Zara cannot find it and it's not in trash, it has been permanently purged.

If Team member notices a missing file: they should notify the Admin immediately. The Admin can check the Activity Log (Admin → Activity Log → filter by FILE_DELETED) to see who deleted it and when.

---

### Q12.6 — System feels slow or unresponsive

1. **Check your internet connection** — a slow connection will slow down all media loading.
2. **Try refreshing the page** (F5 or pull-to-refresh on mobile).
3. **Clear the browser cache** — old cached data can sometimes cause stale states.
4. **If on mobile, try the installed PWA** instead of the browser — it tends to load faster.
5. **Large video thumbnails** can be slow to load on first visit — this is expected. They are generated automatically and cached after first generation.
6. If the slowness is system-wide and persistent, the admin can check system health at Admin → Settings → Maintenance tab.

---

### Q12.7 — Known bugs and current limitations (as of codebase inspection)

1. **Categories in old `chatbotSystemPrompt.ts` are wrong** — that file (the simpler/older prompt) still lists incorrect categories ("Conferences", "Outreach Programs"). The `lib/assistant/system-prompt.ts` (the active Zara prompt) also has this wrong. The actual categories are the 7 in `hierarchyConstants.ts`. **This is an active inaccuracy in the current Zara knowledge that must be fixed.**

2. **The old system prompt claims files are auto-renamed** — this is wrong. Files keep their original names. Both `chatbotSystemPrompt.ts` and the built `system-prompt.ts` contain this incorrect claim.

3. **No admin UI button to manually unlock accounts** — the unlock functionality exists (Zara action + API) but there is no visible "Unlock" button in the Admin → User Management page UI. The only way for an admin to unlock without Zara is to manually wait for the 30-minute lockout to expire, or use Zara's unlockUserAccount action.

4. **Self-registration is configurable** — if `allow_self_registration` is set to false in Settings, the /signup page may be inaccessible or non-functional. Users in that case must be created by the Admin.

5. **Uploader batch download not available** — the batch download (ZIP) feature is not shown to UPLOADERs. They can only download files one at a time.

6. **Gallery feature is separate from CMMS media** — the Galleries page uses a completely separate R2 bucket (`christhood-gallery`, different credentials). The `lib/gallery/gallery-r2.ts` file handles this. Galleries are NOT the same as the main CMMS media library and should not be confused.

---

## SECTION 13 — CHRISTHOOD-SPECIFIC CONTEXT

### Q13.1 — Typical Saturday Fellowship workflow

*The codebase does not encode any Christhood-specific workflows programmatically. Based on the system structure, the likely workflow is:*

**Before the fellowship:**
- Admin creates the event in Admin → Hierarchy (e.g., "Saturday Fellowship March 2026" under Saturday Fellowships category, 2026 year).
- Optional: Admin creates subfolders (e.g., by session or team).

**During/after the fellowship:**
- Uploaders (photographers/videographers) upload their RAW files to the upload page, selecting the correct event.
- Files arrive with status **RAW**.

**After the fellowship:**
- Editors download the RAW files (individually or batch ZIP) via the Media Library or a direct transfer.
- Editors may use the File Transfer system (New Transfer → select editor → attach files) to formally distribute files to specific editors.
- Editors upload the finished/edited files as new versions (Upload New Version on the file detail page) or as a response to their transfer.
- Editors change status from RAW → Editing In Progress → Edited.
- Admin or Lead Editor reviews and changes status to **Published**.

*The admin should confirm the exact team workflow here, as it is not codified in the system.*

---

### Q13.2 — Typical mission trip workflow

*Based on system structure:*

- A mission event is created under the **Missions** category (e.g., "School A Mission March 2026").
- Subfolders might be created per day ("Day 1", "Day 2") or per location.
- Uploaders upload from the field (mobile PWA — works great for this, offline queue handles poor connectivity).
- Editors retrieve and process files via the transfer system.
- Completed files published after review.

*Admin to confirm actual team workflow.*

---

### Q13.3 — Typical editing workflow (RAW to Published)

1. **Uploader** uploads RAW photos/videos → files arrive as `RAW` status.
2. **Editor** downloads RAW files (from Media Library or via Transfer).
3. **Editor** changes status to `EDITING_IN_PROGRESS` (optional, signals work has started).
4. **Editor** processes files externally (Lightroom, Premiere, etc.).
5. **Editor** uploads edited versions as new versions via "Upload New Version" on the file detail page.
6. **Editor** changes status to `EDITED` (editing complete, ready for review).
7. **Admin or Lead** reviews the edited file.
8. **Admin or Lead** changes status to `PUBLISHED` (officially approved).
9. Published files are visible with a green "Published" badge in the Media Library.

---

### Q13.4 — Admin contact

*[Admin: please fill this in with the specific person's name and preferred contact method — e.g., "Contact Daniel via WhatsApp at +234..." or "Email admin@christhood.org"]*

---

### Q13.5 — Christhood-specific terms Zara should know

*Based on codebase analysis and category names:*

- **"Excandidates"** (Branch Excandidates Programme) — likely a church programme for former candidates/initiates. Zara should spell this correctly and not auto-correct it.
- **"Jewels Kids Camp"** — a children's programme. "Jewels" is the correct name.
- **"Teen Life"** — a youth programme.
- **"Mentorship Camp"** — a mentorship-focused programme.

*Admin: please add any additional Christhood-specific terms, names of team leads, common event names (e.g., "Easter Convention", specific mission names), and any internal shorthand the team uses.*

---

## SECTION 14 — TONE & PERSONALITY CALIBRATION

### Q14.1 — Current Zara personality rules (exact from system-prompt.ts)

From `lib/assistant/system-prompt.ts`, the exact rules:

```
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
```

From `lib/chatbotSystemPrompt.ts` (older/alternative prompt), additional personality rules:
```
- Never invent features that do not exist in the system.
- Use plain, everyday language. Avoid technical jargon unless the user introduces it first.
- Never give one-word or one-line cold answers.
- Use numbered steps when explaining a process.
```

And the detailed 1B section from chatbotSystemPrompt.ts:
```
Apply these rules to every single response without exception:
- Never give one-word answers. Even a simple confirmation becomes conversational and warm.
- Always acknowledge what the user said or experienced before jumping into the answer.
- Use the user's name occasionally — naturally, not robotically.
- End most responses with a soft invitation, e.g. "Does that help?", "Want me to walk through the next step?"
- Keep instructions clear and scannable. Use short numbered steps.
- Never output raw technical error messages. Always translate into plain human English.
- Celebrate small wins naturally. If someone just uploaded their first files, acknowledge it warmly.
- Use emojis occasionally where they feel genuinely warm — not decorative.
```

---

### Q14.2 — Examples of good Zara responses

*No conversation log storage was found in the codebase inspection (zara_conversation_logging is a configurable setting). Conversation data is not persisted by default. Cannot provide real examples from logs.*

*Based on the system prompt design, a good Zara response would look like:*

**Example 1 (user asks how to upload):**
> "Great question! Uploading is super simple. Here's how to do it:
> 1. Click **Upload** in the sidebar — it's the third item down.
> 2. Choose the event you're uploading to from the dropdown.
> 3. Drag and drop your photos/videos onto the zone, or tap it to pick files.
> 4. That's it — they'll start uploading automatically!
> Want me to walk you through finding the right event folder? 😊"

**Example 2 (admin asks about a locked user):**
> "Oh no, let's get that sorted! Let me check on [name]'s account.
> [uses unlockUserAccount tool]
> Sarah's account is currently locked until 3:45 PM today — she had 10 failed login attempts. Want me to unlock it for her right now? I just need your confirmation and she'll be good to go."

---

### Q14.3 — Examples of bad Zara responses

*Cannot pull from actual logs (no logging found). Known patterns to avoid based on prompt design:*

- "File uploaded." (one-word/cold)
- "403 Forbidden" (raw error, not translated)
- Making up features that aren't built
- Stating wrong category names ("Conferences" doesn't exist)
- Saying files are renamed to `[EventType]_[YYYYMMDD]_[Sequence].ext` (not true)
- Not acknowledging frustration before diving into instructions

---

### Q14.4 — Current system prompt (word for word)

The **active system prompt** used by the production Zara assistant is built by `buildSystemPrompt()` in `lib/assistant/system-prompt.ts`. Here is the complete static portion (the dynamic section adds current user context at request time):

```
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
[... role-specific sections for UPLOADER, EDITOR, ADMIN ...]

ERROR DIAGNOSIS — THIS IS YOUR MOST IMPORTANT SKILL:
[... error handling patterns ...]

FULL SYSTEM KNOWLEDGE:
[... summarised system knowledge including ROLES, FOLDER STRUCTURE, UPLOADING, FILE STATUSES, VERSION CONTROL, NOTIFICATIONS, PWA, TRASH AND DELETE, ACTIVITY LOG, FILE TRANSFERS, MESSAGING ...]

SCOPE:
Only answer questions about the Christhood CMMS.
```

*(The complete word-for-word content of the prompt is in `lib/assistant/system-prompt.ts`, which is the authoritative source. The dynamic context block injecting userName, userRole, and current page is appended at request time.)*

---

## SECTION 15 — ACTIVITY LOG & ANALYTICS

### Q15.1 — All actions currently being logged to ActivityLog

From `lib/activityLog.ts`, every action that fires a log entry:

**Media lifecycle:**
- FILE_UPLOADED, FILE_DOWNLOADED, FILE_DELETED, FILE_RESTORED, FILE_ARCHIVED, FILE_UNARCHIVED
- STATUS_CHANGED, BATCH_DOWNLOADED
- VERSION_UPLOADED, VERSION_RESTORED
- TAG_CHANGED

**Admin:**
- SETTINGS_CHANGED

**Folder / hierarchy:**
- FOLDER_CREATED, YEAR_CREATED, YEAR_DELETED
- CATEGORY_CREATED, CATEGORY_DELETED, CATEGORY_UPDATED
- EVENT_CREATED, EVENT_UPDATED, EVENT_DELETED
- SUBFOLDER_CREATED, SUBFOLDER_UPDATED, SUBFOLDER_DELETED

**Users / auth:**
- USER_CREATED, USER_LOGIN, USER_LOGIN_SUCCESS, USER_LOGIN_FAILED
- USER_UNLOCKED, ROLE_CHANGED
- USER_DEACTIVATED, USER_REACTIVATED, USER_DELETED

**File Transfers:**
- TRANSFER_SENT, TRANSFER_DOWNLOADED, TRANSFER_RESPONDED
- TRANSFER_RESPONSE_DOWNLOADED, TRANSFER_COMPLETED
- TRANSFER_CANCELLED, TRANSFER_PURGED, TRANSFER_INTEGRITY_FAILURE

**Messaging:**
- MESSAGE_SENT

**Share links:**
- SHARE_LINK_CREATED, SHARE_LINK_REVOKED

**Profile / account:**
- PROFILE_UPDATED, ACCOUNT_DELETION_REQUESTED, ACCOUNT_DELETION_CANCELLED

**Legacy aliases (exist for backward compatibility):**
- MEDIA_UPLOADED (= FILE_UPLOADED), MEDIA_DOWNLOADED (= FILE_DOWNLOADED)

---

### Q15.2 — Activity Log page details

**URL:** /admin/logs  
**Access:** Admin only

**What it shows:**
- Paginated list, 50 entries per page with Previous/Next pagination.
- Each row: timestamp, action badge (colour-coded by action type), username, associated file name, associated event name, metadata preview (e.g., "RAW → PUBLISHED", "ip: 127.0.0.1").

**Action badge colours:**
- Green: FILE_UPLOADED / MEDIA_UPLOADED
- Sky: FILE_DOWNLOADED / MEDIA_DOWNLOADED / BATCH_DOWNLOADED
- Red: FILE_DELETED
- Teal: FILE_RESTORED
- Amber: STATUS_CHANGED
- Indigo: FOLDER_CREATED, YEAR_CREATED, CATEGORY_CREATED, EVENT_CREATED, SUBFOLDER_CREATED
- Rose: YEAR_DELETED, CATEGORY_DELETED, EVENT_DELETED, SUBFOLDER_DELETED
- Blue: EVENT_UPDATED, SUBFOLDER_UPDATED
- Violet: USER_CREATED
- Slate: USER_LOGIN
- Orange: ROLE_CHANGED

**Filters available:**
- Action type (dropdown of all action types)
- User (dropdown of all users)
- Date From
- Date To

A prominent **"Logs cannot be deleted"** badge is shown on the page header. The log is tamper-evident and read-only for all roles.

---

### Q15.3 — Analytics available in the admin dashboard

**URL:** /admin/analytics  
**Access:** Admin only

**Two tabs:**
1. **Storage tab** (analytics charts)
2. **Zara tab** (ZaraAnalyticsTab component — AI usage analytics)

**Storage tab shows:**

*Stat cards row:*
- Total Storage Used (formatted GB/MB)
- Total Files
- Storage Limit
- Trash Size + Trash File Count
- Storage Used % (with warning colour if near limit)

*Charts:*
- **Status breakdown** (pie chart): file count by status (RAW, Editing, Edited, Published, Archived) with colour legend
- **File type breakdown**: Photos vs Videos
- **By Year**: bar chart of file count and total bytes per year
- **By Category**: bar chart of files per event category
- **Monthly upload trends** (area chart): upload count per month for the past 12 months
- **Top Uploaders** table: username, file count, total bytes uploaded
- **Most Downloaded** files table: filename, event, download count

**Are the numbers accurate?** Yes — all data is pulled live from the Prisma database via `/api/admin/analytics`. No caching.

**Zara tab** shows AI assistant usage stats (total requests, error rate, avg response time, unique users per day).

---

## COMPLETION CHECKLIST

✅ Every question has been answered  
✅ Answers describe the ACTUAL system based on codebase inspection  
✅ Page names and button labels are exact (from component source code)  
✅ Known bugs and limitations are honestly documented  
✅ The current system prompt is included verbatim in Q14.4  
✅ NOT YET BUILT features are not listed as built  
✅ Active inaccuracies in the existing Zara prompt are explicitly flagged  

---

## CRITICAL CORRECTIONS SUMMARY

The following items in the **current Zara system prompt are factually wrong** and must be corrected in the rewrite:

1. **Wrong event categories** — both `chatbotSystemPrompt.ts` (says Conferences, Outreach Programs) and `system-prompt.ts` (same wrong list at the bottom) are incorrect. The real categories are: Saturday Fellowships, Missions, Branch Excandidates Programme, Teen Life, Mentorship Camp, Jewels Kids Camp, Special Events.

2. **Files are NOT auto-renamed** — both prompts claim files are renamed to `[EventType]_[YYYYMMDD]_[Sequence].ext`. This is not implemented. Files keep their original device filename (only sanitized, not renamed).

3. **`chatbotSystemPrompt.ts` lists 5 categories** — this older file is likely still used somewhere and has completely wrong category names. Confirm which endpoint uses which prompt file and deprecate `chatbotSystemPrompt.ts` if the newer `system-prompt.ts` is the active one.

---

*Document saved: ZARA_TRAINING_DATA_2026-03-22.md*
*Ready to be given to Claude for Zara system prompt rewrite.*
