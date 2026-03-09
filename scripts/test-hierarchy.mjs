/**
 * scripts/test-hierarchy.mjs
 * Folder Hierarchy System test suite — Christhood CMMS
 *
 * Tests:
 *   A — Create a new event (year reuse, category auto-create, breadcrumb structure)
 *   B — Multi-day event with subfolders
 *   C — Sidebar navigation (hierarchy tree structure)
 *   D — Duplicate prevention
 *   E — Empty state (event with no files renders correctly)
 *
 * Run with:  node --env-file .env.local scripts/test-hierarchy.mjs
 */

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:3001'

// ─── Score tracking ───────────────────────────────────────────────────────────
let passed = 0
let failed = 0
const testResults = []
const createdIds = { events: [], subfolders: [] }

function report(id, label, ok, detail = '') {
  const tag  = ok ? '✅ PASS' : '❌ FAIL'
  const warn = !ok ? ' ◄ FAIL' : ''
  console.log(`  ${tag}  [${id}] ${label}${warn}`)
  if (detail) console.log(`         ↳ ${detail}`)
  ok ? passed++ : failed++
  testResults.push({ id, label, ok, detail })
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
      identifier, password, csrfToken,
      callbackUrl: `${BASE}/dashboard`,
      json: 'true',
    }).toString(),
    redirect: 'manual',
  })
  const setCookie = r.headers.get('set-cookie') ?? ''
  const m = setCookie.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)[^;]*/i)
  return m ? m[0] : ''
}

async function apiPost(path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function apiGet(path, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie, Accept: 'application/json' },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function apiDelete(path, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'DELETE',
    headers: { Cookie: cookie },
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function apiPatch(path, cookie, body) {
  const r = await fetch(`${BASE}${path}`, {
    method:  'PATCH',
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

async function pageGet(path, cookie) {
  const r = await fetch(`${BASE}${path}`, {
    headers:  { Cookie: cookie },
    redirect: 'follow',
  })
  return { status: r.status, text: await r.text().catch(() => '') }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log('║  Christhood CMMS — Folder Hierarchy Test Suite                    ║')
console.log(`║  Target: ${BASE.padEnd(58)} ║`)
console.log('╚════════════════════════════════════════════════════════════════════╝\n')

// ── Auth ──────────────────────────────────────────────────────────────────────
let adminCookie = ''
try {
  adminCookie = await login('testadmin', 'TestAdmin123!')
  const ok = adminCookie.length > 0
  report('AUTH', 'Admin login (testadmin)', ok, ok ? 'Session cookie obtained' : 'No cookie returned')
  if (!ok) { console.error('\n  ❌ Cannot proceed without admin session.'); process.exit(1) }
} catch(e) {
  console.error('  ❌ Login exception:', e.message); process.exit(1)
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST A  — Create a new event, verify year reuse, shape of response
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  TEST A: Create New Event  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// A-0: Record the count of Year=2026 records BEFORE creating
const { status: preHStatus, body: preHBody } = await apiGet('/api/hierarchy', adminCookie)
const year2026Before = (preHBody.years ?? []).filter(y => y.year === 2026)
console.log(`  Pre-test: found ${year2026Before.length} Year=2026 record(s) in DB`)

// A-1: Create the event
let conferenceEventId = null
const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

{
  const { status, body } = await apiPost('/api/hierarchy/events', adminCookie, {
    name:         'Annual Conference 2026',
    date:         futureDate,
    categoryName: 'Conferences',
    yearNumber:   2026,
  })
  const ok = status === 201 && !!body.event?.id
  report('A1', 'Create event "Annual Conference 2026" → 201', ok,
    `status=${status} eventId=${body.event?.id ?? body.error ?? 'none'}`)
  if (ok) {
    conferenceEventId = body.event.id
    createdIds.events.push(conferenceEventId)
  }
}

// A-2: Verify event appears in the hierarchy tree
{
  const { status, body } = await apiGet('/api/hierarchy', adminCookie)
  let foundInTree    = false
  let correctParents = false
  let yearNode       = null

  for (const y of (body.years ?? [])) {
    if (y.year === 2026) {
      yearNode = y
      for (const cat of (y.categories ?? [])) {
        if (cat.name === 'Conferences') {
          const ev = (cat.events ?? []).find(e => e.name === 'Annual Conference 2026')
          if (ev) {
            foundInTree    = true
            correctParents = true  // it's nested under 2026 → Conferences
          }
        }
      }
    }
  }

  report('A2', 'Event appears in hierarchy tree under 2026 → Conferences', foundInTree,
    `status=${status} foundInTree=${foundInTree}`)
  report('A2b', 'Breadcrumb path: 2026 > Conferences > Annual Conference 2026', correctParents,
    `Year 2026 node exists: ${yearNode !== null}`)
}

// A-3: Year 2026 de-duplication — must still be exactly ONE Year=2026 record
{
  const { body } = await apiGet('/api/hierarchy', adminCookie)
  const year2026After = (body.years ?? []).filter(y => y.year === 2026)
  const exactlyOne    = year2026After.length === 1
  report('A3', 'Exactly ONE Year=2026 record in DB (no duplicates created)', exactlyOne,
    `Year=2026 records after creation: ${year2026After.length} (was ${year2026Before.length} before)`)
}

// A-4: Category "Conferences" only exists once under Year 2026
{
  const { body } = await apiGet('/api/hierarchy', adminCookie)
  let conferenceCount = 0
  for (const y of (body.years ?? [])) {
    if (y.year === 2026) {
      conferenceCount = (y.categories ?? []).filter(c => c.name === 'Conferences').length
    }
  }
  const exactlyOne = conferenceCount === 1
  report('A4', '"Conferences" category exists exactly once under Year 2026', exactlyOne,
    `Found ${conferenceCount} "Conferences" category node(s) under 2026`)
}

// A-5: Event page loads (breadcrumb data structure is correct in API response)
if (conferenceEventId) {
  const { status, body } = await apiGet(`/api/hierarchy/events/${conferenceEventId}`, adminCookie)
  const ev = body.event
  const breadcrumbCorrect =
    ev?.name                    === 'Annual Conference 2026' &&
    ev?.category?.name          === 'Conferences'           &&
    ev?.category?.year?.year    === 2026

  report('A5',  'GET /api/hierarchy/events/[id] returns correct data', status === 200 && !!ev,
    `status=${status} name="${ev?.name}"`)
  report('A5b', 'Breadcrumb data: event.category.name="Conferences" & year=2026', breadcrumbCorrect,
    `year=${ev?.category?.year?.year}  cat="${ev?.category?.name}"  event="${ev?.name}"`)
} else {
  report('A5',  'Event detail API (SKIPPED — no event ID from A1)', false, '')
  report('A5b', 'Breadcrumb data (SKIPPED)', false, '')
}

// A-6: UI page for the event renders (no 404, no crash)
if (conferenceEventId) {
  const { status, text } = await pageGet(`/events/${conferenceEventId}`, adminCookie)
  // Next.js bundles the default 404 template text in every page's HTML payload;
  // use a positive presence check instead (event name must appear on the page).
  const rendersOk = status === 200 && text.includes('Annual Conference 2026')
  report('A6', `GET /events/${conferenceEventId} renders (status 200, no 404)`, rendersOk,
    `status=${status} pageLength=${text.length}`)
  // Check that breadcrumb labels appear on the page
  const hasBreadcrumbYear  = text.includes('2026')
  const hasBreadcrumbCat   = text.includes('Conferences')
  const hasBreadcrumbEvent = text.includes('Annual Conference 2026')
  report('A6b', 'Page HTML contains "2026", "Conferences", "Annual Conference 2026"',
    hasBreadcrumbYear && hasBreadcrumbCat && hasBreadcrumbEvent,
    `has2026=${hasBreadcrumbYear} hasConferences=${hasBreadcrumbCat} hasEvent=${hasBreadcrumbEvent}`)
} else {
  report('A6',  'Event page render (SKIPPED)', false, '')
  report('A6b', 'Breadcrumb HTML (SKIPPED)', false, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST B  — Multi-day event with 3 subfolders
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  TEST B: Multi-Day Event with Subfolders  ━━━━━━━━━━━━━━━━━━━━━━\n')

let youthOutreachId  = null
let fridaySubfolderId   = null

// B-1: Create "Youth Outreach Weekend" under Missions
{
  const { status, body } = await apiPost('/api/hierarchy/events', adminCookie, {
    name:         'Youth Outreach Weekend',
    date:         futureDate,
    categoryName: 'Missions',
    yearNumber:   2026,
  })
  const ok = status === 201 && !!body.event?.id
  report('B1', 'Create event "Youth Outreach Weekend" under Missions → 201', ok,
    `status=${status} eventId=${body.event?.id ?? body.error ?? 'none'}`)
  if (ok) {
    youthOutreachId = body.event.id
    createdIds.events.push(youthOutreachId)
    // Newly created event should start with 0 subfolders
    const hasSubs = body.event.subfolders?.length === 0
    report('B1b', 'Newly created event has 0 subfolders', hasSubs,
      `subfolders=${JSON.stringify(body.event.subfolders)}`)
  }
}

// B-2: Add 3 subfolders: Friday, Saturday, Sunday
const days = ['Friday', 'Saturday', 'Sunday']
if (youthOutreachId) {
  for (const day of days) {
    const { status, body } = await apiPost('/api/hierarchy/subfolders', adminCookie, {
      label:   day,
      eventId: youthOutreachId,
    })
    const ok = status === 201 && body.subfolder?.label === day
    report(`B2-${day}`, `Add subfolder "${day}" → 201`, ok,
      `status=${status} id=${body.subfolder?.id ?? body.error ?? 'none'}`)
    if (ok) {
      createdIds.subfolders.push(body.subfolder.id)
      if (day === 'Friday') fridaySubfolderId = body.subfolder.id
    }
  }
} else {
  for (const day of days) report(`B2-${day}`, `Add subfolder "${day}" (SKIPPED)`, false, '')
}

// B-3: Verify event now shows 3 subfolders in GET
if (youthOutreachId) {
  const { status, body } = await apiGet(`/api/hierarchy/events/${youthOutreachId}`, adminCookie)
  const subCount = body.event?.subfolders?.length ?? 0
  const hasAll   = days.every(d => (body.event?.subfolders ?? []).some(s => s.label === d))
  report('B3',  `Event detail shows ${subCount} subfolder(s) (expect 3)`, subCount === 3,
    `status=${status} subfolders=[${(body.event?.subfolders ?? []).map(s => s.label).join(', ')}]`)
  report('B3b', 'All 3 days (Friday, Saturday, Sunday) present', hasAll,
    `present=${days.filter(d => (body.event?.subfolders ?? []).some(s => s.label === d)).join(', ')}`)
}

// B-4: UI page renders with subfolder tabs
if (youthOutreachId) {
  const { status, text } = await pageGet(`/events/${youthOutreachId}`, adminCookie)
  const hasFriday   = text.includes('Friday')
  const hasSaturday = text.includes('Saturday')
  const hasSunday   = text.includes('Sunday')
  report('B4', `Event page renders with subfolder tabs`, status === 200,
    `status=${status}`)
  report('B4b', 'Page HTML shows all three day tabs (Friday, Saturday, Sunday)',
    hasFriday && hasSaturday && hasSunday,
    `hasFriday=${hasFriday} hasSaturday=${hasSaturday} hasSunday=${hasSunday}`)
}

// B-5: Navigating to Friday subfolder shows correct breadcrumb
if (youthOutreachId && fridaySubfolderId) {
  const { status, text } = await pageGet(
    `/events/${youthOutreachId}?subfolder=${fridaySubfolderId}`, adminCookie
  )
  const hasYouth   = text.includes('Youth Outreach Weekend')
  const hasFriday  = text.includes('Friday')
  const hasMissions= text.includes('Missions')
  report('B5', 'Subfolder page (/events/[id]?subfolder=...) renders', status === 200,
    `status=${status}`)
  report('B5b', 'Breadcrumb: "2026 > Missions > Youth Outreach Weekend > Friday" on page',
    hasYouth && hasFriday && hasMissions,
    `hasMissions=${hasMissions} hasEvent=${hasYouth} hasFriday=${hasFriday}`)
} else {
  report('B5',  'Subfolder page (SKIPPED — missing IDs)', false, '')
  report('B5b', 'Breadcrumb HTML (SKIPPED)', false, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST C  — Sidebar / Hierarchy tree integrity
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  TEST C: Hierarchy Tree Structure  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
console.log('  (Sidebar collapse/expand is a browser interaction; we verify the')
console.log('   underlying tree data integrity, navigation API shape, and page loads.)\n')

// C-1: GET /api/hierarchy returns a valid nested tree
{
  const { status, body } = await apiGet('/api/hierarchy', adminCookie)
  const hasYears      = Array.isArray(body.years) && body.years.length > 0
  const structureOk   = body.years?.every(y =>
    typeof y.year === 'number' &&
    Array.isArray(y.categories) &&
    y.categories.every(c => typeof c.name === 'string' && Array.isArray(c.events))
  )
  report('C1',  'GET /api/hierarchy → 200 with years array', status === 200 && hasYears,
    `status=${status} years=${body.years?.length ?? 0}`)
  report('C1b', 'Tree structure: Year → categories[] → events[] (correct nesting)', !!structureOk,
    `structure valid: ${!!structureOk}`)
}

// C-2: Within 2026, newly created events appear under correct categories
{
  const { body } = await apiGet('/api/hierarchy', adminCookie)
  let conferencesFound = false
  let missionsFound    = false
  let annualEventFound = false
  let youthEventFound  = false

  for (const y of (body.years ?? [])) {
    if (y.year === 2026) {
      for (const cat of (y.categories ?? [])) {
        if (cat.name === 'Conferences') {
          conferencesFound = true
          if ((cat.events ?? []).find(e => e.name === 'Annual Conference 2026'))
            annualEventFound = true
        }
        if (cat.name === 'Missions') {
          missionsFound = true
          if ((cat.events ?? []).find(e => e.name === 'Youth Outreach Weekend'))
            youthEventFound = true
        }
      }
    }
  }

  report('C2',  '"Conferences" category visible in sidebar under 2026', conferencesFound,
    `found=${conferencesFound}`)
  report('C2b', '"Annual Conference 2026" event under Conferences', annualEventFound,
    `found=${annualEventFound}`)
  report('C2c', '"Missions" category visible in sidebar under 2026', missionsFound,
    `found=${missionsFound}`)
  report('C2d', '"Youth Outreach Weekend" event under Missions', youthEventFound,
    `found=${youthEventFound}`)
}

// C-3: Each event page loads without errors (simulates clicking in sidebar)
const eventPages = []
if (conferenceEventId) eventPages.push({ id: conferenceEventId, name: 'Annual Conference 2026' })
if (youthOutreachId)   eventPages.push({ id: youthOutreachId,   name: 'Youth Outreach Weekend' })

for (const ep of eventPages) {
  const { status, text } = await pageGet(`/events/${ep.id}`, adminCookie)
  const notErrorPage = !text.includes('Application error') && !text.includes('An unexpected error')
  report(`C3-${ep.name}`, `Navigate to "${ep.name}" → 200, no errors`,
    status === 200 && notErrorPage,
    `status=${status} errorDetected=${!notErrorPage}`)
}

// C-4: Hierarchy admin page loads (the management UI)
{
  const { status, text } = await pageGet('/admin/hierarchy', adminCookie)
  const hasContent = text.length > 500
  report('C4', '/admin/hierarchy page loads → 200', status === 200 && hasContent,
    `status=${status} bodyLength=${text.length}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST D  — Duplicate prevention
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  TEST D: Duplicate Prevention  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// D-1: Try to create a duplicate "Annual Conference 2026" under same category/year
{
  const { status, body } = await apiPost('/api/hierarchy/events', adminCookie, {
    name:         'Annual Conference 2026',
    date:         futureDate,
    categoryName: 'Conferences',
    yearNumber:   2026,
  })

  // Two possible correct behaviours:
  //   409 Conflict = explicit duplicate rejection ← preferred
  //   201 Created  = system allowed it (duplicate silently accepted) ← acceptable but noted
  const rejectedWithConflict = status === 409
  const silentlyAllowed      = status === 201

  if (silentlyAllowed && body.event?.id) {
    // Store for cleanup
    createdIds.events.push(body.event.id)
  }

  // We call this a PASS only if the system actively rejects the duplicate (409).
  // If it silently allows it, we report FAIL and flag it.
  report('D1', 'Duplicate event name in same category/year → 409 Conflict',
    rejectedWithConflict,
    status === 409
      ? '409 returned — duplicate rejected ✓'
      : status === 201
        ? `⚠️  STATUS 201 — DUPLICATE WAS SILENTLY CREATED (new eventId=${body.event?.id}) — this is a gap`
        : `status=${status} body=${JSON.stringify(body).slice(0, 120)}`)
}

// D-2: Verify Year 2026 still has exactly ONE record even after second attempt
{
  const { body } = await apiGet('/api/hierarchy', adminCookie)
  const count2026 = (body.years ?? []).filter(y => y.year === 2026).length
  report('D2', 'Year 2026 still has exactly ONE year node after duplicate event attempt',
    count2026 === 1, `count=${count2026}`)
}

// D-3: Count of "Annual Conference 2026" events under Conferences/2026
{
  const { body } = await apiGet('/api/hierarchy', adminCookie)
  let dupCount = 0
  for (const y of (body.years ?? [])) {
    if (y.year === 2026) {
      for (const cat of (y.categories ?? [])) {
        if (cat.name === 'Conferences') {
          dupCount = (cat.events ?? []).filter(e => e.name === 'Annual Conference 2026').length
        }
      }
    }
  }
  report('D3', '"Annual Conference 2026" appears exactly once in Conferences/2026',
    dupCount === 1,
    dupCount === 1
      ? '1 record — no duplicates ✓'
      : `⚠️  FOUND ${dupCount} records — DUPLICATE EVENTS EXIST IN HIERARCHY TREE`)
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST E  — Empty state (event with no files)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  TEST E: Empty State (Event with No Files)  ━━━━━━━━━━━━━━━━━━━━\n')

// E-1: Create a fresh event explicitly for empty-state testing
let emptyEventId = null
{
  const { status, body } = await apiPost('/api/hierarchy/events', adminCookie, {
    name:         'Empty State Test Event',
    date:         futureDate,
    categoryName: 'Special Events',
    yearNumber:   2026,
  })
  const ok = status === 201 && !!body.event?.id
  report('E1', 'Create "Empty State Test Event" under Special Events → 201', ok,
    `status=${status}`)
  if (ok) {
    emptyEventId = body.event.id
    createdIds.events.push(emptyEventId)
  }
}

// E-2: Navigate to its page — should render 200, no crash, no blank page
if (emptyEventId) {
  const { status, text } = await pageGet(`/events/${emptyEventId}`, adminCookie)
  const no404       = status === 200
  const noAppError  = !text.includes('Application error') && !text.includes('An unexpected error')
  const noBlank     = text.length > 200
  report('E2',  'Empty event page → 200, no crash, not blank', no404 && noAppError && noBlank,
    `status=${status} bodyLength=${text.length} hasAppError=${!noAppError}`)
}

// E-3: Page has an empty-state message/prompt
if (emptyEventId) {
  const { text } = await pageGet(`/events/${emptyEventId}`, adminCookie)

  // The event detail page shows "No media in this event yet." OR "Upload here" button
  const hasEmptyMsg  = text.includes('No media') ||
                       text.includes('no media') ||
                       text.includes('no files') ||
                       text.includes('No files') ||
                       text.includes('Upload files') ||
                       text.includes('Upload here')
  report('E3', 'Empty event page shows empty-state message or upload prompt', hasEmptyMsg,
    hasEmptyMsg
      ? 'Empty-state text found on page ✓'
      : '⚠️  No empty-state cue visible — page may feel broken to users')
}

// E-4: API shows 0 files for the event
if (emptyEventId) {
  const { status, body } = await apiGet(`/api/media?eventId=${emptyEventId}`, adminCookie)
  const fileCount = body.total ?? body.items?.length ?? -1
  report('E4', 'GET /api/media?eventId=[empty] returns 0 files', status === 200 && fileCount === 0,
    `status=${status} total=${fileCount}`)
}

// E-5: Empty subfolder page also renders without errors
if (youthOutreachId && fridaySubfolderId) {
  const { status, text } = await pageGet(
    `/events/${youthOutreachId}?subfolder=${fridaySubfolderId}`, adminCookie
  )
  const hasEmptyMsg = text.includes('No media') || text.includes('Upload files') ||
                      text.includes('Upload here') || text.includes('no file')
  report('E5',  'Empty subfolder page renders → 200', status === 200,
    `status=${status}`)
  report('E5b', 'Empty subfolder shows empty-state or upload prompt', hasEmptyMsg,
    hasEmptyMsg ? 'Empty-state text found ✓' : '⚠️  No empty-state cue in subfolder view')
} else {
  report('E5',  'Empty subfolder render (SKIPPED — no subfolder from Test B)', false, '')
  report('E5b', 'Empty subfolder empty-state (SKIPPED)', false, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// CLEANUP — Delete test events (moves them via admin delete endpoint)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━━  Cleanup  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// Delete subfolders first
for (const sfId of createdIds.subfolders) {
  const { status } = await apiDelete(`/api/hierarchy/subfolders/${sfId}`, adminCookie)
  console.log(`  Deleted subfolder ${sfId}: status=${status}`)
}

// Delete events
for (const evId of createdIds.events) {
  const { status } = await apiDelete(`/api/hierarchy/events/${evId}`, adminCookie)
  console.log(`  Deleted event ${evId}: status=${status}`)
}

if (createdIds.events.length === 0 && createdIds.subfolders.length === 0) {
  console.log('  Nothing to clean up.')
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed
console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log(`║  Hierarchy Results: ${String(passed).padStart(3)} PASSED  |  ${String(failed).padStart(3)} FAILED  |  ${String(total).padStart(3)} TOTAL       ║`)
console.log('╚════════════════════════════════════════════════════════════════════╝')

if (failed > 0) {
  console.log('\n── Failed Tests ─────────────────────────────────────────────────────')
  for (const r of testResults.filter(r => !r.ok)) {
    console.log(`  ❌  [${r.id}] ${r.label}`)
    if (r.detail) console.log(`       ${r.detail}`)
  }
}

console.log()
if (failed > 0) process.exit(1)
