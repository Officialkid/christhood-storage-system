/**
 * scripts/test-rbac.mjs
 * Role-Based Access Control (RBAC) test suite — Christhood CMMS
 *
 * Tests EVERY permission scenario for ADMIN, UPLOADER, and EDITOR roles.
 * For each FAIL-expected scenario, tests BOTH the UI path (redirect check)
 * AND the direct API call (must return 401 or 403).
 *
 * Run with:  node --env-file=.env.local scripts/test-rbac.mjs
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// ─── Credentials ──────────────────────────────────────────────────────────────
const CREDS = {
  admin:    { id: 'testadmin',    pass: 'TestAdmin123!'  },
  uploader: { id: 'testuploader', pass: 'TestUpload123!' },
  editor:   { id: 'testeditor',   pass: 'TestEdit123!'   },
}

// ─── Score tracking ───────────────────────────────────────────────────────────
let passed   = 0
let failed   = 0
const results = []

function report(id, label, ok, detail = '') {
  const tag = ok ? '✅ PASS' : '❌ FAIL'
  console.log(`  ${tag}  [${id}] ${label}`)
  if (detail) console.log(`         ↳ ${detail}`)
  ok ? passed++ : failed++
  results.push({ id, label, ok, detail })
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function getCsrf() {
  const r = await fetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = await r.json()
  return { csrfToken, cookieRaw: r.headers.get('set-cookie') ?? '' }
}

async function login(identifier, password) {
  const { csrfToken, cookieRaw } = await getCsrf()
  const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieRaw,
    },
    body: new URLSearchParams({
      identifier,
      password,
      csrfToken,
      callbackUrl: `${BASE}/dashboard`,
      json: 'true',
    }).toString(),
    redirect: 'manual',
  })
  const setCookie = r.headers.get('set-cookie') ?? ''
  const m = setCookie.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)[^;]*/i)
  return m ? m[0] : ''
}

/** Fetch a page without following redirects. */
async function pageGet(path, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    headers:  { Cookie: cookie ?? '' },
    redirect: 'manual',
  })
  return { status: r.status, location: r.headers.get('location') ?? '' }
}

/** Fetch an API endpoint (GET). */
async function apiGet(path, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie ?? '', Accept: 'application/json' },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

/** POST with JSON body. */
async function apiPost(path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

/** PATCH with JSON body. */
async function apiPatch(path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

/** DELETE with JSON body. */
async function apiDelete(path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'DELETE',
    headers: { Cookie: cookie ?? '', 'Content-Type': 'application/json', Accept: 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

// ─── Sentinel value for "not yet obtained" file / user IDs ────────────────────
const FAKE_ID = 'clzzzzzzzzzzzzzzzzzzzzzzz0'

// =============================================================================
//  ENTRY POINT
// =============================================================================

console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log('║  Christhood CMMS — RBAC Test Suite                                ║')
console.log(`║  Target: ${BASE.padEnd(58)} ║`)
console.log('╚════════════════════════════════════════════════════════════════════╝\n')

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 0 — Authenticate all three roles
// ──────────────────────────────────────────────────────────────────────────────
console.log('━━━━  PHASE 0: Login  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

let adminCookie    = ''
let uploaderCookie = ''
let editorCookie   = ''

try {
  adminCookie    = await login(CREDS.admin.id,    CREDS.admin.pass)
  uploaderCookie = await login(CREDS.uploader.id, CREDS.uploader.pass)
  editorCookie   = await login(CREDS.editor.id,   CREDS.editor.pass)

  report('INIT-1', 'Admin session obtained',    adminCookie.length    > 0, `cookie: ${adminCookie.slice(0, 60)}…`)
  report('INIT-2', 'Uploader session obtained', uploaderCookie.length > 0, `cookie: ${uploaderCookie.slice(0, 60)}…`)
  report('INIT-3', 'Editor session obtained',   editorCookie.length   > 0, `cookie: ${editorCookie.slice(0, 60)}…`)
} catch (e) {
  console.error('  ❌ Login phase exception:', e.message)
  process.exit(1)
}

if (!adminCookie || !uploaderCookie || !editorCookie) {
  console.error('\n  ❌ One or more sessions could not be established — aborting.')
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Provision test data
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  PHASE 1: Test Data Setup  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// 1a. Find a real event ID (any event in the DB, via admin session)
let testEventId   = null   // event in which to create test files
let uploaderId    = null   // DB id of testuploader user
let uploaderFileId = null  // media record created by testuploader
let adminFileId    = null  // media record created by admin (for cross-owner tests)
let adminDeleteFileId = null // media record created by admin specifically for admin-delete test

// Get event ID from hierarchy
try {
  const { status: hStatus, body: hBody } = await apiGet('/api/hierarchy', adminCookie)
  if (hStatus === 200) {
    outer: for (const year of (hBody.years ?? [])) {
      for (const cat of (year.categories ?? [])) {
        if (cat.events?.length > 0) {
          testEventId = cat.events[0].id
          console.log(`  Found event "${cat.events[0].name}" (id: ${testEventId})`)
          break outer
        }
      }
    }
  }
  if (!testEventId) console.warn('  ⚠️  No events in DB — file-based tests will use fake IDs')
} catch (e) { console.warn('  ⚠️  Hierarchy fetch failed:', e.message) }

// 1b. Create test media records (presigned upload — creates DB row even without R2 PUT)
if (testEventId) {
  // Uploader's test file
  try {
    const { status: s1, body: b1 } = await apiPost('/api/upload', uploaderCookie, {
      filename: 'rbac-test-uploader-file.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 102400,
      eventId: testEventId,
    })
    if (s1 === 200 && b1.mediaId) {
      uploaderFileId = b1.mediaId
      console.log(`  Created uploader's test file: ${uploaderFileId}`)
    } else {
      console.warn(`  ⚠️  Could not create uploader's test file: status=${s1}`)
    }
  } catch (e) { console.warn('  ⚠️  Uploader test file creation failed:', e.message) }

  // Admin's test file (for cross-owner 403 tests)
  try {
    const { status: s2, body: b2 } = await apiPost('/api/upload', adminCookie, {
      filename: 'rbac-test-admin-file.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 51200,
      eventId: testEventId,
    })
    if (s2 === 200 && b2.mediaId) {
      adminFileId = b2.mediaId
      console.log(`  Created admin's test file (for cross-owner tests): ${adminFileId}`)
    } else {
      console.warn(`  ⚠️  Could not create admin's test file: status=${s2}`)
    }
  } catch (e) { console.warn('  ⚠️  Admin test file creation failed:', e.message) }

  // Admin's dedicated delete test file
  try {
    const { status: s3, body: b3 } = await apiPost('/api/upload', adminCookie, {
      filename: 'rbac-test-admin-delete.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 20480,
      eventId: testEventId,
    })
    if (s3 === 200 && b3.mediaId) {
      adminDeleteFileId = b3.mediaId
      console.log(`  Created admin's delete-test file: ${adminDeleteFileId}`)
    } else {
      console.warn(`  ⚠️  Could not create admin delete-test file: status=${s3}`)
    }
  } catch (e) { console.warn('  ⚠️  Admin delete-test file creation failed:', e.message) }
} else {
  console.warn('  ⚠️  No events in DB — file-based tests will use fake IDs')
}

// 1c. Get uploader's DB user ID (for role-change test)
try {
  const { status: uStatus, body: uBody } = await apiGet('/api/admin/users', adminCookie)
  if (uStatus === 200) {
    const u = (uBody.users ?? []).find(u => u.email === 'testuploader@christhood.com')
    if (u) {
      uploaderId = u.id
      console.log(`  Uploader user ID: ${uploaderId}`)
    }
  }
  if (!uploaderId) console.warn('  ⚠️  Could not find uploader user ID')
} catch (e) { console.warn('  ⚠️  User ID fetch failed:', e.message) }

console.log()

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 2 — ADMIN ACCESS TESTS
// ──────────────────────────────────────────────────────────────────────────────
console.log('━━━━  PHASE 2: ADMIN ACCESS TESTS  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
console.log('  (All expect PASS — admin should be able to do everything)\n')

// A1: Admin can access /admin/users page (UI)
{
  const { status } = await pageGet('/admin/users', adminCookie)
  report('A1', 'Admin → /admin/users (UI page) → 200', status === 200,
    `status=${status}`)
}

// A2: Admin can access /admin/logs page (UI)
{
  const { status } = await pageGet('/admin/logs', adminCookie)
  report('A2', 'Admin → /admin/logs (UI page) → 200', status === 200,
    `status=${status}`)
}

// A3: Admin can access /admin/trash page (UI)
{
  const { status } = await pageGet('/admin/trash', adminCookie)
  report('A3', 'Admin → /admin/trash (UI page) → 200', status === 200,
    `status=${status}`)
}

// A4: Admin can access admin API endpoints
{
  const { status: s1 } = await apiGet('/api/admin/users', adminCookie)
  const { status: s2 } = await apiGet('/api/admin/logs',  adminCookie)
  const { status: s3 } = await apiGet('/api/admin/trash', adminCookie)
  report('A4a', 'Admin → GET /api/admin/users → 200',  s1 === 200, `status=${s1}`)
  report('A4b', 'Admin → GET /api/admin/logs → 200',   s2 === 200, `status=${s2}`)
  report('A4c', 'Admin → GET /api/admin/trash → 200',  s3 === 200, `status=${s3}`)
}

// A5: Admin can create a new event
{
  const { status, body } = await apiPost('/api/hierarchy/events', adminCookie, {
    name:         'RBAC Test Event',
    date:         new Date().toISOString(),
    categoryName: 'Saturday Fellowships',
    yearNumber:   2026,
  })
  report('A5', 'Admin → POST /api/hierarchy/events (create event) → 201',
    status === 201, `status=${status} event=${body.event?.name ?? body.error ?? ''}`)
}

// A6: Admin can delete a file
if (adminDeleteFileId) {
  const { status } = await apiPost(
    `/api/admin/media/${adminDeleteFileId}/delete`, adminCookie, {}
  )
  report('A6', 'Admin → POST /api/admin/media/[id]/delete → 200', status === 200,
    `status=${status} (file moved to trash)`)
} else {
  report('A6', 'Admin → POST /api/admin/media/[id]/delete (SKIPPED — no test file)', false,
    'Test file could not be created in Phase 1')
}

// A7: Admin can change a user's role
if (uploaderId) {
  const { status: sp } = await apiPatch(
    `/api/admin/users/${uploaderId}`, adminCookie, { role: 'EDITOR' }
  )
  const { status: sr } = await apiPatch(
    `/api/admin/users/${uploaderId}`, adminCookie, { role: 'UPLOADER' }
  )
  report('A7a', "Admin → PATCH /api/admin/users/[id] role=EDITOR → 200",    sp === 200, `status=${sp}`)
  report('A7b', 'Admin → Reverts testuploader back to UPLOADER → 200',       sr === 200, `status=${sr}`)
} else {
  report('A7', 'Admin → change user role (SKIPPED — no uploaderId)', false,
    'Could not retrieve uploader user ID')
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 3 — UPLOADER ACCESS TESTS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  PHASE 3: UPLOADER ACCESS TESTS  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// ── PASS-expected tests ──────────────────────────────────────────────────────

// U1: Uploader can access /dashboard
{
  const { status } = await pageGet('/dashboard', uploaderCookie)
  report('U1', 'Uploader → /dashboard (UI page) → 200', status === 200, `status=${status}`)
}

// U2: Uploader can access /events
{
  const { status } = await pageGet('/events', uploaderCookie)
  report('U2', 'Uploader → /events (UI page) → 200', status === 200, `status=${status}`)
}

// U3: Uploader can upload (API returns presigned URL)
if (testEventId) {
  const { status, body } = await apiPost('/api/upload', uploaderCookie, {
    filename:    'uploader-test.jpg',
    contentType: 'image/jpeg',
    sizeBytes:   1024,
    eventId:     testEventId,
  })
  report('U3', 'Uploader → POST /api/upload → 200 with uploadUrl', 
    status === 200 && !!body.uploadUrl, `status=${status} hasUrl=${!!body.uploadUrl}`)
} else {
  report('U3', 'Uploader → POST /api/upload (SKIPPED — no event)', false, 'No event ID available')
}

// U4: Uploader can download files (auth not blocked)
{
  const fileId = uploaderFileId ?? FAKE_ID
  const { status } = await apiGet(`/api/download/${fileId}`, uploaderCookie)
  // 200 = presigned URL returned; 404 = auth ok but file not in R2; either proves auth passed
  report('U4', 'Uploader → GET /api/download/[fileId] → not 401/403',
    status !== 401 && status !== 403, `status=${status}`)
}

// ── FAIL-expected: UI must redirect, API must return 403 ─────────────────────
console.log()
console.log('  ── FAIL-expected: admin areas blocked for UPLOADER ──\n')

// U5: /admin/users — UI (redirect) + API (403)
{
  const { status: uiSt, location } = await pageGet('/admin/users', uploaderCookie)
  report('U5-UI',  'Uploader → /admin/users (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/users', uploaderCookie)
  report('U5-API', 'Uploader → GET /api/admin/users (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// U6: /admin/activity-log (route: /admin/logs) — UI + API
{
  const { status: uiSt, location } = await pageGet('/admin/logs', uploaderCookie)
  report('U6-UI',  'Uploader → /admin/logs (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/logs', uploaderCookie)
  report('U6-API', 'Uploader → GET /api/admin/logs (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// U7: /admin/trash — UI + API
{
  const { status: uiSt, location } = await pageGet('/admin/trash', uploaderCookie)
  report('U7-UI',  'Uploader → /admin/trash (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/trash', uploaderCookie)
  report('U7-API', 'Uploader → GET /api/admin/trash (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// U8: Cannot delete via admin route — UI (no button, page is blocked) + API (403)
// The admin delete UI lives inside /admin/* pages which are already blocked.
// We test the admin API route directly:
{
  const fileId = uploaderFileId ?? FAKE_ID
  const { status: apiSt } = await apiPost(
    `/api/admin/media/${fileId}/delete`, uploaderCookie, {}
  )
  report('U8-API', 'Uploader → POST /api/admin/media/[id]/delete (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// U9: Cannot change file status — API (route-level 403 before any DB lookup)
{
  const fileId = uploaderFileId ?? FAKE_ID
  const { status: apiSt, body } = await apiPatch(
    `/api/media/${fileId}/status`, uploaderCookie, { newStatus: 'EDITED' }
  )
  report('U9-API', 'Uploader → PATCH /api/media/[id]/status (direct API) → 403',
    apiSt === 403, `status=${apiSt} msg="${body.error ?? ''}"`)
}

// U10: Cannot change a user's role — API (403 from middleware)
{
  const userId = uploaderId ?? FAKE_ID
  const { status: apiSt } = await apiPatch(
    `/api/admin/users/${userId}`, uploaderCookie, { role: 'ADMIN' }
  )
  report('U10-API', 'Uploader → PATCH /api/admin/users/[id] role escalation (API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// U11: Cannot delete ANOTHER user's file via DELETE /api/media
//   File owned by admin → uploader should get 403 (not owner, not admin)
if (adminFileId) {
  const { status: apiSt } = await apiDelete('/api/media', uploaderCookie, { id: adminFileId })
  report('U11-API', "Uploader → DELETE /api/media with admin's file (not owned) → 403",
    apiSt === 403, `status=${apiSt}`)
} else {
  report('U11-API', "Uploader → DELETE /api/media with admin's file (SKIPPED — no adminFileId)", false, '')
}

// U12: Cannot create events or folders (ADMIN-only routes)
{
  const { status: evSt } = await apiPost('/api/hierarchy/events', uploaderCookie, {
    name: 'Uploader Unauthorized Event', date: new Date().toISOString(),
    categoryName: 'Saturday Fellowships', yearNumber: 2026,
  })
  const { status: sfSt } = await apiPost('/api/hierarchy/subfolders', uploaderCookie, {
    label: 'Uploader Unauthorized Folder', eventId: testEventId ?? FAKE_ID,
  })
  report('U12a-API', 'Uploader → POST /api/hierarchy/events → 403',
    evSt === 403, `status=${evSt}`)
  report('U12b-API', 'Uploader → POST /api/hierarchy/subfolders → 403',
    sfSt === 403, `status=${sfSt}`)
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 4 — EDITOR ACCESS TESTS
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  PHASE 4: EDITOR ACCESS TESTS  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// ── PASS-expected tests ──────────────────────────────────────────────────────

// E1: Editor can download files
{
  const fileId = uploaderFileId ?? FAKE_ID
  const { status } = await apiGet(`/api/download/${fileId}`, editorCookie)
  report('E1', 'Editor → GET /api/download/[fileId] → not 401/403',
    status !== 401 && status !== 403, `status=${status}`)
}

// E2: Editor can upload
if (testEventId) {
  const { status, body } = await apiPost('/api/upload', editorCookie, {
    filename:    'editor-test.jpg',
    contentType: 'image/jpeg',
    sizeBytes:   2048,
    eventId:     testEventId,
  })
  report('E2', 'Editor → POST /api/upload → 200 with uploadUrl',
    status === 200 && !!body.uploadUrl, `status=${status} hasUrl=${!!body.uploadUrl}`)
} else {
  report('E2', 'Editor → POST /api/upload (SKIPPED — no event)', false, 'No event ID available')
}

// E3: Editor can change file status
if (uploaderFileId) {
  // Change to EDITING_IN_PROGRESS
  const { status, body } = await apiPatch(
    `/api/media/${uploaderFileId}/status`, editorCookie, { newStatus: 'EDITING_IN_PROGRESS' }
  )
  report('E3', "Editor → PATCH /api/media/[id]/status → EDITING_IN_PROGRESS → 200",
    status === 200, `status=${status} newStatus=${body.status ?? body.error ?? ''}`)
  // Revert to RAW
  if (status === 200) {
    await apiPatch(`/api/media/${uploaderFileId}/status`, editorCookie, { newStatus: 'RAW' })
  }
} else {
  // With a fake file ID, UPLOADER gets 403 but EDITOR gets 404 (role check passes, DB lookup fails)
  // 404 here confirms the EDITOR role check passes (auth was accepted, just file not found)
  const { status } = await apiPatch(
    `/api/media/${FAKE_ID}/status`, editorCookie, { newStatus: 'EDITING_IN_PROGRESS' }
  )
  report('E3', 'Editor → PATCH /api/media/[id]/status → auth accepted (404 with fake ID)',
    status === 404 || status === 200, `status=${status} (404 = auth ok, file not found)`)
}

// ── FAIL-expected: UI must redirect, API must return 403 ─────────────────────
console.log()
console.log('  ── FAIL-expected: admin areas blocked for EDITOR ──\n')

// E4: /admin/users — UI + API
{
  const { status: uiSt, location } = await pageGet('/admin/users', editorCookie)
  report('E4-UI',  'Editor → /admin/users (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/users', editorCookie)
  report('E4-API', 'Editor → GET /api/admin/users (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// E5: /admin/logs — UI + API
{
  const { status: uiSt, location } = await pageGet('/admin/logs', editorCookie)
  report('E5-UI',  'Editor → /admin/logs (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/logs', editorCookie)
  report('E5-API', 'Editor → GET /api/admin/logs (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// E6: /admin/trash — UI + API
{
  const { status: uiSt, location } = await pageGet('/admin/trash', editorCookie)
  report('E6-UI',  'Editor → /admin/trash (UI) → redirected, not 200',
    uiSt !== 200, `status=${uiSt} location="${location}"`)
  const { status: apiSt } = await apiGet('/api/admin/trash', editorCookie)
  report('E6-API', 'Editor → GET /api/admin/trash (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// E7: Cannot delete a file — UI (page blocked) + API (403)
{
  const fileId = uploaderFileId ?? FAKE_ID
  // Admin media delete endpoint: blocked by middleware AND route check
  const { status: apiSt } = await apiPost(
    `/api/admin/media/${fileId}/delete`, editorCookie, {}
  )
  report('E7-API', 'Editor → POST /api/admin/media/[id]/delete (direct API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// E8: Cannot delete another user's file via DELETE /api/media
if (adminFileId) {
  const { status: apiSt } = await apiDelete('/api/media', editorCookie, { id: adminFileId })
  report('E8-API', "Editor → DELETE /api/media with admin's file (not owned) → 403",
    apiSt === 403, `status=${apiSt}`)
} else {
  report('E8-API', "Editor → DELETE /api/media with admin's file (SKIPPED — no adminFileId)", false, '')
}

// E9: Cannot create events or folders
{
  const { status: evSt } = await apiPost('/api/hierarchy/events', editorCookie, {
    name: 'Editor Unauthorized Event', date: new Date().toISOString(),
    categoryName: 'Saturday Fellowships', yearNumber: 2026,
  })
  const { status: sfSt } = await apiPost('/api/hierarchy/subfolders', editorCookie, {
    label: 'Editor Unauthorized Folder', eventId: testEventId ?? FAKE_ID,
  })
  report('E9a-API', 'Editor → POST /api/hierarchy/events → 403',
    evSt === 403, `status=${evSt}`)
  report('E9b-API', 'Editor → POST /api/hierarchy/subfolders → 403',
    sfSt === 403, `status=${sfSt}`)
}

// E10: Cannot change user roles
{
  const userId = uploaderId ?? FAKE_ID
  const { status: apiSt } = await apiPatch(
    `/api/admin/users/${userId}`, editorCookie, { role: 'ADMIN' }
  )
  report('E10-API', 'Editor → PATCH /api/admin/users/[id] role escalation (API) → 403',
    apiSt === 403, `status=${apiSt}`)
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 5 — UNAUTHENTICATED ACCESS (control group)
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  PHASE 5: UNAUTHENTICATED (no cookie)  ━━━━━━━━━━━━━━━━━━━━━━━━\n')
console.log('  These confirm the baseline: no cookie → always blocked.\n')

const openPaths = ['/dashboard', '/admin/users', '/admin/logs', '/admin/trash', '/events']
for (const path of openPaths) {
  const { status, location } = await pageGet(path, '')
  report(`ANON-${path}`, `Unauthenticated → ${path} → 307 to /login`,
    status === 307 || status === 302 || location.includes('/login'),
    `status=${status} location="${location}"`)
}

const openApiPaths = ['/api/admin/users', '/api/admin/logs', '/api/admin/trash']
for (const path of openApiPaths) {
  const { status } = await apiGet(path, '')
  report(`ANON-${path}`, `Unauthenticated → ${path} (API) → 401`,
    status === 401, `status=${status}`)
}

// ──────────────────────────────────────────────────────────────────────────────
// PHASE 6 — Cleanup
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  PHASE 6: Cleanup  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

const toClean = [uploaderFileId, adminFileId].filter(Boolean)
for (const id of toClean) {
  const { status } = await apiPost(`/api/admin/media/${id}/delete`, adminCookie, {})
  console.log(`  Moved ${id} to trash: status=${status}`)
}
if (toClean.length === 0) console.log('  Nothing to clean up.')

// ──────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────────
const total = passed + failed
console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log(`║  RBAC Results: ${String(passed).padStart(3)} PASSED  |  ${String(failed).padStart(3)} FAILED  |  ${String(total).padStart(3)} TOTAL          ║`)
console.log('╚════════════════════════════════════════════════════════════════════╝')

if (failed > 0) {
  console.log('\n── Failed Tests ─────────────────────────────────────────────────────')
  for (const r of results.filter(r => !r.ok)) {
    console.log(`  ❌  [${r.id}] ${r.label}`)
    if (r.detail) console.log(`       ${r.detail}`)
  }
}

console.log('\n── Security Note: File Ownership Delete ─────────────────────────────')
console.log('  DELETE /api/media checks uploaderId === session.user.id (ownership),')
console.log('  not the user\'s role. This means any user who uploaded a file can')
console.log('  delete their own file via direct API call, regardless of role.')
console.log('  → The UI has NO delete button on media pages for non-admin users.')
console.log('  → The API endpoint implicitly allows self-ownership deletion.')
console.log('  → If UPLOADERs/EDITORs should be blocked from all deletes,')
console.log('    add a role === "ADMIN" guard to DELETE /api/media.')
console.log()

if (failed > 0) process.exit(1)
