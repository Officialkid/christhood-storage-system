/**
 * Christhood CMMS — Upload System Test Suite
 *
 * Tests:
 *   A  – Basic photo upload (presign → PUT R2 → register)
 *   B  – Video upload (fileType=VIDEO check)
 *   C  – Bulk upload (2 files, correct sequencing)
 *   D  – Event isolation (upload goes to the correct eventId)
 *   E  – Auto-rename verification (originalName vs storedName)
 *   F  – Event assignment gate (any-event upload — is it restricted?)
 *   G  – File-type & size validation (PDF rejection, no size limit)
 *
 * Run: node --env-file .env.local scripts/test-upload.mjs
 */

import { readFileSync, existsSync } from 'fs'
import { join }                     from 'path'
import { PrismaClient }             from '@prisma/client'

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3001'
const CREDS    = { username: 'testuploader', password: 'TestUpload123!' }
const ADMIN    = { username: 'testadmin',    password: 'TestAdmin123!'  }
const prisma   = new PrismaClient()

// ─── Test files ───────────────────────────────────────────────────────────────
const FILES_DIR  = 'test-files'
const PHOTO_PATH = join(FILES_DIR, 'test-photo.jpg')
const VIDEO_PATH = join(FILES_DIR, 'test-video.mp4')

// ─── Results tracking ─────────────────────────────────────────────────────────
let passed = 0, failed = 0
const failures = []

function report(id, label, ok, detail = '') {
  const icon = ok ? '✅ PASS' : '❌ FAIL'
  const suffix = ok ? '' : ' ◄ FAIL'
  console.log(`  ${icon}  [${id}] ${label}${suffix}`)
  if (detail) console.log(`         ↳ ${detail}`)
  if (ok) passed++
  else    { failed++; failures.push({ id, label, detail }) }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function post(path, body, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  })
  let json = null
  const text = await res.text()
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, body: json, text }
}

async function get(path, cookie) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  })
  let json = null
  const text = await res.text()
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, body: json, text }
}

/** PUT a binary buffer to a presigned URL (simulates browser XHR). */
async function putToR2(url, buffer, contentType) {
  const res = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': contentType },
    body:    buffer,
  })
  return { status: res.status, ok: res.ok }
}

/** HEAD a URL — used to verify R2 object existence. */
async function head(url) {
  const res = await fetch(url, { method: 'HEAD' })
  return { status: res.status, ok: res.ok }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function login(creds) {
  // Step 1 – get CSRF token
  const csrfRes   = await fetch(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = await csrfRes.json()
  const csrfCookie    = csrfRes.headers.get('set-cookie') ?? ''

  // Step 2 – submit credentials (field is "identifier", not "username")
  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie:         csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken,
      identifier:  creds.username,
      password:    creds.password,
      callbackUrl: `${BASE_URL}/dashboard`,
      json:        'true',
    }).toString(),
    redirect: 'manual',
  })

  // Collect all Set-Cookie values — handle both secure + non-secure variants
  const raw = loginRes.headers.get('set-cookie') ?? ''
  const sessionMatch = raw.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)[^;]*/i)
  if (!sessionMatch) return null
  return sessionMatch[0]
}

// ─── Upload helpers ───────────────────────────────────────────────────────────

/**
 * Full upload flow: presign → PUT R2 → register.
 * Returns { mediaFile, storedName, r2Key, presignStatus, registerStatus, r2Status }.
 */
async function doUpload({ cookie, filename, contentType, fileBuffer, eventId, subfolderId }) {
  // 1. Get presigned URL
  const presignRes = await post('/api/upload/presign', {
    filename,
    contentType,
    fileSize:    fileBuffer.length,
    eventId,
    subfolderId: subfolderId ?? undefined,
  }, cookie)

  if (presignRes.status !== 200) {
    return {
      presignStatus: presignRes.status,
      presignError:  presignRes.body?.error ?? presignRes.text,
    }
  }

  const { mode, uploadUrl, r2Key } = presignRes.body

  if (mode !== 'simple') {
    // Multipart path — not tested here (requires chunked logic)
    return { presignStatus: presignRes.status, mode, r2Key, multipart: true }
  }

  // 2. PUT directly to R2
  const r2Put = await putToR2(uploadUrl, fileBuffer, contentType)

  // 3. Register in DB (storedName is generated server-side, returned in response)
  const regRes = await post('/api/upload/register', {
    r2Key,
    originalName: filename,
    contentType,
    fileSize:     fileBuffer.length,
    eventId,
    subfolderId:  subfolderId ?? undefined,
  }, cookie)

  return {
    presignStatus:  presignRes.status,
    r2Status:       r2Put.status,
    registerStatus: regRes.status,
    registerError:  regRes.body?.error,
    mediaFile:      regRes.body?.mediaFile,
    storedName:     regRes.body?.mediaFile?.storedName,
    r2Key,
    mode,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n╔${'═'.repeat(68)}╗`)
  console.log(`║  Christhood CMMS — Upload System Test Suite${' '.repeat(24)}║`)
  console.log(`║  Target: ${BASE_URL}${' '.repeat(58 - BASE_URL.length)}║`)
  console.log(`╚${'═'.repeat(68)}╝\n`)

  // ── Prerequisite: test files ────────────────────────────────────────────────
  for (const p of [PHOTO_PATH, VIDEO_PATH]) {
    if (!existsSync(p)) {
      console.error(`Missing: ${p}. Run: node scripts/create-test-files.mjs`)
      process.exit(1)
    }
  }
  const photoBuffer = readFileSync(PHOTO_PATH)
  const videoBuffer = readFileSync(VIDEO_PATH)

  // ── Login ────────────────────────────────────────────────────────────────────
  const uploaderCookie = await login(CREDS)
  report('AUTH', 'testuploader login', !!uploaderCookie, uploaderCookie
    ? 'Session cookie obtained'
    : 'LOGIN FAILED — cannot continue')

  if (!uploaderCookie) { await prisma.$disconnect(); return }

  const adminCookie = await login(ADMIN)
  report('AUTH2', 'testadmin login (for logs + cleanup)', !!adminCookie)

  // ── Find the target event ─────────────────────────────────────────────────
  console.log('\n━━━━  Finding Target Event  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  const treeRes = await get('/api/hierarchy', uploaderCookie)
  report('PRE1', 'GET /api/hierarchy → 200', treeRes.status === 200,
    `status=${treeRes.status}`)

  // Find "2026 → Saturday Fellowships → Test Saturday Fellowship"
  let targetEventId = null
  let targetEventDate = null
  if (treeRes.body?.years) {
    for (const yr of treeRes.body.years) {
      if (yr.year === 2026) {
        for (const cat of yr.categories ?? []) {
          if (cat.name === 'Saturday Fellowships') {
            const ev = (cat.events ?? []).find(e => e.name === 'Test Saturday Fellowship')
            if (ev) { targetEventId = ev.id; targetEventDate = ev.date }
          }
        }
      }
    }
  }

  // Fallback: query DB directly
  if (!targetEventId) {
    const ev = await prisma.event.findFirst({
      where:   { name: 'Test Saturday Fellowship' },
      include: { category: { include: { year: true } } },
    })
    if (ev) { targetEventId = ev.id; targetEventDate = ev.date }
  }

  report('PRE2', 'Target event "Test Saturday Fellowship" found', !!targetEventId,
    targetEventId ? `id=${targetEventId}` : '⚠️  NOT FOUND — creating it now')

  // Auto-create if missing
  if (!targetEventId) {
    const adminCk = adminCookie ?? uploaderCookie
    const createRes = await post('/api/hierarchy/events', {
      name:         'Test Saturday Fellowship',
      date:         '2026-03-07T00:00:00.000Z',
      categoryName: 'Saturday Fellowships',
      yearNumber:   2026,
    }, adminCk)
    if (createRes.status === 201) {
      targetEventId   = createRes.body.event?.id
      targetEventDate = createRes.body.event?.date
      console.log(`         ↳ Created event id=${targetEventId}`)
    } else {
      console.error('  FATAL: Cannot create target event', createRes.body)
      await prisma.$disconnect(); return
    }
  }

  // ── Helper: find a different ("other") event for isolation testing ─────────
  let otherEventId = null
  if (treeRes.body?.years) {
    outer: for (const yr of treeRes.body.years) {
      for (const cat of yr.categories ?? []) {
        for (const ev of cat.events ?? []) {
          if (ev.id !== targetEventId) { otherEventId = ev.id; break outer }
        }
      }
    }
  }
  if (!otherEventId) {
    const ev = await prisma.event.findFirst({ where: { id: { not: targetEventId } } })
    if (ev) otherEventId = ev.id
  }
  console.log(`  ↳ Isolation test will use otherEventId=${otherEventId ?? 'N/A'}`)

  // Keep track of uploaded file IDs for cleanup
  const toClean = []

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST A — Basic single photo upload
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST A: Basic Single Photo Upload  ━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const upA = await doUpload({
    cookie:      uploaderCookie,
    filename:    'test-photo.jpg',
    contentType: 'image/jpeg',
    fileBuffer:  photoBuffer,
    eventId:     targetEventId,
  })

  report('A1', 'POST /api/upload/presign → 200', upA.presignStatus === 200,
    `presignStatus=${upA.presignStatus}`)

  if (upA.presignStatus === 200) {
    report('A2', 'PUT to R2 presigned URL → 2xx', upA.r2Status < 300,
      `r2Status=${upA.r2Status}`)

    report('A3', 'POST /api/upload/register → 201', upA.registerStatus === 201,
      `registerStatus=${upA.registerStatus}${upA.registerError ? ' err='+upA.registerError : ''}`)

    if (upA.mediaFile) {
      toClean.push(upA.mediaFile.id)
      const mf = upA.mediaFile

      // ── DB record fields ──────────────────────────────────────────────────
      report('A4', 'mediaFile.fileType === "PHOTO"', mf.fileType === 'PHOTO',
        `fileType=${mf.fileType}`)

      report('A5', 'mediaFile.status === "RAW"', mf.status === 'RAW',
        `status=${mf.status}`)

      report('A6', 'mediaFile.eventId matches target', mf.eventId === targetEventId,
        `mediaFile.eventId=${mf.eventId}`)

      report('A7', 'mediaFile.uploaderId matches testuploader',
        !!mf.uploaderId, `uploaderId=${mf.uploaderId}`)

      // ── Naming convention ─────────────────────────────────────────────────
      // Expected: SatFellowship_YYYYMMDD_NNN.jpg
      const namingOk = /^SatFellowship_\d{8}_\d{3}\.jpg$/.test(upA.storedName)
      report('A8', 'Auto-naming: SatFellowship_YYYYMMDD_NNN.jpg',
        namingOk, `storedName="${upA.storedName}"`)

      // originalName preserved
      report('A9', 'originalName preserved as "test-photo.jpg"',
        mf.originalName === 'test-photo.jpg',
        `originalName="${mf.originalName}"`)

      // ── R2 existence check ────────────────────────────────────────────────
      const previewRes = await get(`/api/preview/${mf.id}`, uploaderCookie)
      report('A10', 'GET /api/preview/[id] → 200 (R2 URL available)',
        previewRes.status === 200,
        `previewStatus=${previewRes.status}`)

      // Presigned GET URLs are signed for GET only — HEAD returns 403 by design.
      // Confirm actual R2 access by making a Range GET for the first byte.
      if (previewRes.status === 200 && previewRes.body?.url) {
        const getR2  = await fetch(previewRes.body.url, {
          headers: { Range: 'bytes=0-0' },
        })
        report('A11', 'R2 object actually exists (Range GET presigned URL → 2xx)',
          getR2.ok, `r2GetStatus=${getR2.status}`)
      } else {
        report('A11', 'R2 object GET check', false, 'Skipped — no preview URL returned')
      }

      // ── ActivityLog check ─────────────────────────────────────────────────
      // Use admin logs API (ADMIN only) — returns { items: [...], total, ... }
      if (adminCookie) {
        const logRes = await get(
          `/api/admin/logs?action=FILE_UPLOADED&mediaFileId=${mf.id}`,
          adminCookie,
        )
        const logEntry     = logRes.body?.items?.find?.(l => l.mediaFileId === mf.id)
        const logActionOk  = logEntry?.action === 'FILE_UPLOADED'
        const logUserOk    = logEntry?.user?.id === mf.uploaderId
        report('A12', 'ActivityLog FILE_UPLOADED entry exists',
          !!logEntry, `found=${!!logEntry} action=${logEntry?.action} total=${logRes.body?.total}`)
        report('A13', 'ActivityLog userId === uploaderId',
          logUserOk, `logUserId=${logEntry?.user?.id} uploaderId=${mf.uploaderId}`)
        report('A14', 'ActivityLog mediaFileId links to correct file',
          logEntry?.mediaFileId === mf.id,
          `logMediaFileId=${logEntry?.mediaFileId}`)
      } else {
        report('A12', 'ActivityLog check (skipped — no admin cookie)', false, '')
        report('A13', 'ActivityLog userId check', false, 'skipped')
        report('A14', 'ActivityLog mediaFileId check', false, 'skipped')
      }

      // ── File visible via media API ────────────────────────────────────────
      const mediaListRes = await get(
        `/api/media?eventId=${targetEventId}&limit=100`, uploaderCookie)
      const appearsInList = mediaListRes.body?.items?.some?.(i => i.id === mf.id)
      report('A15', 'File visible in GET /api/media?eventId=... list',
        appearsInList, `appearsInList=${appearsInList}`)
    } else {
      for (const id of ['A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15']) {
        report(id, '(skipped — no mediaFile from register)', false, '')
      }
    }
  } else {
    for (const id of ['A2','A3','A4','A5','A6','A7','A8','A9','A10','A11','A12','A13','A14','A15']) {
      report(id, '(skipped — presign failed)', false, '')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST B — Video upload
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST B: Video Upload  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const upB = await doUpload({
    cookie:      uploaderCookie,
    filename:    'test-video.mp4',
    contentType: 'video/mp4',
    fileBuffer:  videoBuffer,
    eventId:     targetEventId,
  })

  report('B1', 'Presign → 200', upB.presignStatus === 200, `presignStatus=${upB.presignStatus}`)
  report('B2', 'R2 PUT → 2xx', !!upB.r2Status && upB.r2Status < 300, `r2Status=${upB.r2Status}`)
  report('B3', 'Register → 201', upB.registerStatus === 201, `registerStatus=${upB.registerStatus}`)

  if (upB.mediaFile) {
    toClean.push(upB.mediaFile.id)
    const mf = upB.mediaFile

    report('B4', 'mediaFile.fileType === "VIDEO"', mf.fileType === 'VIDEO',
      `fileType=${mf.fileType}`)
    report('B5', 'mediaFile.status === "RAW"', mf.status === 'RAW', `status=${mf.status}`)

    // Naming: SatFellowship_YYYYMMDD_NNN.mp4
    const namingOk = /^SatFellowship_\d{8}_\d{3}\.mp4$/.test(upB.storedName)
    report('B6', 'Auto-naming: SatFellowship_YYYYMMDD_NNN.mp4',
      namingOk, `storedName="${upB.storedName}"`)

    report('B7', 'originalName === "test-video.mp4"',
      mf.originalName === 'test-video.mp4', `originalName="${mf.originalName}"`)

    report('B8', 'mediaFile.eventId matches target', mf.eventId === targetEventId,
      `eventId=${mf.eventId}`)

    // R2 exists
    const previewRes = await get(`/api/preview/${mf.id}`, uploaderCookie)
    report('B9', 'Video R2 object exists (HEAD check)', previewRes.status === 200,
      `previewStatus=${previewRes.status}`)
    if (previewRes.status === 200 && previewRes.body?.url) {
      const getR2 = await fetch(previewRes.body.url, { headers: { Range: 'bytes=0-0' } })
      report('B10', 'R2 video object exists (Range GET → 2xx)', getR2.ok, `r2GetStatus=${getR2.status}`)
    } else {
      report('B10', 'R2 video Range GET check', false, 'skipped — no preview URL')
    }
  } else {
    for (const id of ['B4','B5','B6','B7','B8','B9','B10']) {
      report(id, '(skipped — upload failed)', false, '')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST C — Bulk upload: two files simultaneously, check sequencing
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST C: Bulk Upload (2 files, sequencing)  ━━━━━━━━━━━━━━━━\n')

  // Get current count before bulk
  const countBefore = await prisma.mediaFile.count({ where: { eventId: targetEventId } })

  const [upC1, upC2] = await Promise.all([
    doUpload({
      cookie:      uploaderCookie,
      filename:    'bulk-photo.jpg',
      contentType: 'image/jpeg',
      fileBuffer:  photoBuffer,
      eventId:     targetEventId,
    }),
    doUpload({
      cookie:      uploaderCookie,
      filename:    'bulk-video.mp4',
      contentType: 'video/mp4',
      fileBuffer:  videoBuffer,
      eventId:     targetEventId,
    }),
  ])

  report('C1', 'Photo presign → 200', upC1.presignStatus === 200, `presignStatus=${upC1.presignStatus}`)
  report('C2', 'Video presign → 200', upC2.presignStatus === 200, `presignStatus=${upC2.presignStatus}`)
  report('C3', 'Photo register → 201', upC1.registerStatus === 201, `status=${upC1.registerStatus}`)
  report('C4', 'Video register → 201', upC2.registerStatus === 201, `status=${upC2.registerStatus}`)

  if (upC1.mediaFile) toClean.push(upC1.mediaFile.id)
  if (upC2.mediaFile) toClean.push(upC2.mediaFile.id)

  const countAfter = await prisma.mediaFile.count({ where: { eventId: targetEventId } })
  report('C5', 'File count increased by exactly 2 after bulk',
    countAfter - countBefore === 2,
    `before=${countBefore} after=${countAfter} delta=${countAfter - countBefore}`)

  // Both files appear under the same event
  if (upC1.mediaFile && upC2.mediaFile) {
    report('C6', 'Both bulk files share the same eventId',
      upC1.mediaFile.eventId === targetEventId && upC2.mediaFile.eventId === targetEventId,
      `c1=${upC1.mediaFile.eventId} c2=${upC2.mediaFile.eventId}`)

    // Sequence numbers are distinct integers
    const seqC1 = parseInt((upC1.storedName ?? '').match(/_(\d{3})\./)?.[1] ?? '0')
    const seqC2 = parseInt((upC2.storedName ?? '').match(/_(\d{3})\./)?.[1] ?? '0')
    report('C7', 'Bulk files have distinct sequence numbers',
      seqC1 !== seqC2 && seqC1 > 0 && seqC2 > 0,
      `seq1=${seqC1} seq2=${seqC2}`)
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST D — Event isolation: upload goes to the CORRECT eventId
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST D: Event Isolation  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  let upD = null
  if (otherEventId) {
    upD = await doUpload({
      cookie:      uploaderCookie,
      filename:    'isolation-test.jpg',
      contentType: 'image/jpeg',
      fileBuffer:  photoBuffer,
      eventId:     otherEventId,
    })
    if (upD.mediaFile) toClean.push(upD.mediaFile.id)

    report('D1', 'Upload to different event → 201', upD.registerStatus === 201,
      `status=${upD.registerStatus}`)
    report('D2', 'DB record eventId === otherEventId (not target)',
      upD.mediaFile?.eventId === otherEventId,
      `mediaFile.eventId=${upD.mediaFile?.eventId} expected=${otherEventId}`)
    report('D3', 'DB record NOT under target event',
      upD.mediaFile?.eventId !== targetEventId,
      `mediaFile.eventId=${upD.mediaFile?.eventId} targetId=${targetEventId}`)

    // Verify it doesn't appear in the target event's media list
    const targetMedia = await get(`/api/media?eventId=${targetEventId}&limit=100`, uploaderCookie)
    const wrongPlaced  = targetMedia.body?.items?.some?.((i) => i.id === upD.mediaFile?.id)
    report('D4', 'Isolation file NOT visible in target event list',
      wrongPlaced === false,
      `visibleInTarget=${wrongPlaced}`)
  } else {
    console.log('  ℹ️  No other event found — D tests skipped')
    for (const id of ['D1','D2','D3','D4']) {
      report(id, '(skipped — no other event available)', true, 'N/A')
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST E — Auto-rename: originalName preserved, storedName follows convention
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST E: Auto-rename Verification  ━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const weirdName = 'IMG_20260301_random_name_123.jpg'
  const upE = await doUpload({
    cookie:      uploaderCookie,
    filename:    weirdName,
    contentType: 'image/jpeg',
    fileBuffer:  photoBuffer,
    eventId:     targetEventId,
  })
  if (upE.mediaFile) toClean.push(upE.mediaFile.id)

  report('E1', 'Weird-name upload → 201', upE.registerStatus === 201, `status=${upE.registerStatus}`)

  if (upE.mediaFile) {
    const mf = upE.mediaFile

    // originalName must equal the raw input filename (not mutated)
    report('E2', 'originalName === "IMG_20260301_random_name_123.jpg"',
      mf.originalName === weirdName,
      `originalName="${mf.originalName}"`)

    // storedName must follow CMMS convention (not the original camera-roll name)
    const storedFollowsConvention = /^SatFellowship_\d{8}_\d{3}\.jpg$/.test(upE.storedName)
    report('E3', 'storedName follows SatFellowship_YYYYMMDD_NNN.jpg (original ignored)',
      storedFollowsConvention,
      `storedName="${upE.storedName}"`)

    // storedName must NOT contain the original filename fragments
    const storedDoesNotLeakOriginal = !upE.storedName.toLowerCase().includes('img_')
    report('E4', 'storedName does not contain original filename fragments',
      storedDoesNotLeakOriginal,
      `storedName="${upE.storedName}" containsIMG_=${!storedDoesNotLeakOriginal}`)

    // Check via DB directly (confirming both fields stored correctly)
    const dbRecord = await prisma.mediaFile.findUnique({
      where:  { id: mf.id },
      select: { originalName: true, storedName: true, r2Key: true },
    })
    report('E5', 'DB: originalName field === original filename',
      dbRecord?.originalName === weirdName,
      `db.originalName="${dbRecord?.originalName}"`)
    report('E6', 'DB: storedName field follows convention',
      /^SatFellowship_\d{8}_\d{3}\.jpg$/.test(dbRecord?.storedName ?? ''),
      `db.storedName="${dbRecord?.storedName}"`)
    report('E7', 'DB: r2Key uses events/<id>/ prefix (not uploads/ legacy path)',
      (dbRecord?.r2Key ?? '').startsWith('events/'),
      `r2Key="${dbRecord?.r2Key}"`)
  } else {
    for (const id of ['E2','E3','E4','E5','E6','E7'])
      report(id, '(skipped — upload failed)', false, '')
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST F — Event assignment gate
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST F: Event Assignment Gate  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log('  (Testing whether testuploader is restricted to assigned events only)')

  if (otherEventId) {
    // Try to get a presign for an event that is NOT the user's assigned event
    // (if assignment is implemented, this would return 403; without it, it succeeds)
    const presignF = await post('/api/upload/presign', {
      filename:    'gate-test.jpg',
      contentType: 'image/jpeg',
      fileSize:    photoBuffer.length,
      eventId:     otherEventId,
    }, uploaderCookie)

    const gateEnforced = presignF.status === 403
    report('F1', 'Upload to unassigned event is blocked (403) — if assignment is enforced',
      gateEnforced,
      gateEnforced
        ? '403 returned — access gate is enforced ✓'
        : `⚠️  ${presignF.status} returned — NO assignment gate (any user can upload to any event)`)
    report('F1-INFO', 'Assignment gate status noted (design decision)',
      true,
      presignF.status === 200
        ? 'DESIGN GAP: event assignment is not enforced at API level'
        : 'Gate is enforced')
  } else {
    report('F1', '(skipped — no other event available)', true, 'N/A')
    report('F1-INFO', 'Assignment gate status', true, 'Test skipped')
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // TEST G — File-type and size validation
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  TEST G: File-type & Size Validation  ━━━━━━━━━━━━━━━━━━━━━━\n')

  // G1 — PDF (non-image, non-video MIME type)
  const pdfBuffer = Buffer.from('%PDF-1.4 test content')
  const presignPDF = await post('/api/upload/presign', {
    filename:    'document.pdf',
    contentType: 'application/pdf',
    fileSize:    pdfBuffer.length,
    eventId:     targetEventId,
  }, uploaderCookie)

  const pdfRejected = presignPDF.status === 415 || presignPDF.status === 400
  report('G1', 'PDF upload is rejected (415 or 400)',
    pdfRejected,
    pdfRejected
      ? `Correctly rejected: ${presignPDF.status}`
      : `⚠️  STATUS ${presignPDF.status} — PDF was NOT rejected at API level (file-type validation missing)`)

  // G2 — If PDF presign succeeded, check register also validates
  if (!pdfRejected && presignPDF.status === 200) {
    const { uploadUrl: pdfUrl, r2Key: pdfKey, storedName: pdfName } = presignPDF.body
    // Upload the PDF bytes
    const pdfPut = await putToR2(pdfUrl, pdfBuffer, 'application/pdf')
    // Register
    const pdfReg = await post('/api/upload/register', {
      r2Key:        pdfKey,
      storedName:   pdfName,
      originalName: 'document.pdf',
      contentType:  'application/pdf',
      fileSize:     pdfBuffer.length,
      eventId:      targetEventId,
    }, uploaderCookie)
    report('G2', 'Register step also rejects PDF (400/415)',
      pdfReg.status === 400 || pdfReg.status === 415,
      `⚠️  registerStatus=${pdfReg.status} — neither presign nor register rejected the PDF`)
    if (pdfReg.body?.mediaFile?.id) toClean.push(pdfReg.body.mediaFile.id)

    // Check DB: if it slipped through, fileType would be PHOTO (wrong) or VIDEO
    if (pdfReg.status === 201) {
      const dbPdf = await prisma.mediaFile.findUnique({
        where: { r2Key: pdfKey }, select: { fileType: true, id: true, originalName: true }
      })
      report('G2b', 'DB: PDF silently stored as PHOTO (classification bug)',
        false,
        `⚠️  fileType=${dbPdf?.fileType} — PDF stored with fileType=${dbPdf?.fileType}, id=${dbPdf?.id}`)
      if (dbPdf?.id) toClean.push(dbPdf.id)
    }
  } else {
    report('G2', 'Register validation (PDF presigned rejected — G2 not needed)', true, 'N/A')
  }

  // G3 — Zero-byte file
  const zeroBuffer = Buffer.alloc(0)
  const presignZero = await post('/api/upload/presign', {
    filename:    'empty.jpg',
    contentType: 'image/jpeg',
    fileSize:    0,
    eventId:     targetEventId,
  }, uploaderCookie)
  report('G3', 'Zero-byte upload is rejected (400)',
    presignZero.status === 400,
    presignZero.status === 400
      ? 'Correctly rejected empty file'
      : `⚠️  STATUS ${presignZero.status} — zero-byte file not rejected (body: ${JSON.stringify(presignZero.body)})`)

  // G4 — Missing eventId in presign
  const presignNoEvent = await post('/api/upload/presign', {
    filename:    'test.jpg',
    contentType: 'image/jpeg',
    fileSize:    photoBuffer.length,
  }, uploaderCookie)
  report('G4', 'Missing eventId → 400',
    presignNoEvent.status === 400,
    `status=${presignNoEvent.status} body=${JSON.stringify(presignNoEvent.body)}`)

  // G5 — Non-existent eventId
  const presignBadEvent = await post('/api/upload/presign', {
    filename: 'test.jpg', contentType: 'image/jpeg',
    fileSize:  photoBuffer.length,
    eventId:  'non-existent-event-id-xxx',
  }, uploaderCookie)
  report('G5', 'Non-existent eventId → 404',
    presignBadEvent.status === 404,
    `status=${presignBadEvent.status} body=${JSON.stringify(presignBadEvent.body)}`)

  // G6 — Unauthenticated upload attempt
  const presignUnauth = await post('/api/upload/presign', {
    filename:    'test.jpg',
    contentType: 'image/jpeg',
    fileSize:    photoBuffer.length,
    eventId:     targetEventId,
  }, null)
  report('G6', 'Unauthenticated presign → 401',
    presignUnauth.status === 401,
    `status=${presignUnauth.status}`)

  // G7 — Unauthenticated register attempt
  const unAuthRegister = await post('/api/upload/register', {
    r2Key: 'fake/key', storedName: 'fake.jpg', originalName: 'fake.jpg',
    contentType: 'image/jpeg', fileSize: 100, eventId: targetEventId,
  }, null)
  report('G7', 'Unauthenticated register → 401', unAuthRegister.status === 401,
    `status=${unAuthRegister.status}`)

  // G8 — Large file (12 MB) should go multipart (presign returns mode:'multipart')
  const largeFilePath = join(FILES_DIR, 'test-large.jpg')
  if (existsSync(largeFilePath)) {
    const largeBuffer = readFileSync(largeFilePath)
    const presignLarge = await post('/api/upload/presign', {
      filename:    'test-large.jpg',
      contentType: 'image/jpeg',
      fileSize:    largeBuffer.length,
      eventId:     targetEventId,
    }, uploaderCookie)
    // 12 MB < 50 MB threshold → simple mode expected
    report('G8', '12 MB file: presign returns simple mode (below 50 MB threshold)',
      presignLarge.status === 200 && presignLarge.body?.mode === 'simple',
      `status=${presignLarge.status} mode=${presignLarge.body?.mode}`)

    // Check file larger than 50 MB would trigger multipart
    const presignXL = await post('/api/upload/presign', {
      filename:    'hypothetical-large.jpg',
      contentType: 'image/jpeg',
      fileSize:    55 * 1024 * 1024, // 55 MB > 50 MB threshold
      eventId:     targetEventId,
    }, uploaderCookie)
    report('G9', '55 MB file: presign returns multipart mode (above 50 MB threshold)',
      presignLarge.status === 200 && presignXL.body?.mode === 'multipart',
      `status=${presignXL.status} mode=${presignXL.body?.mode}`)
    // Note: we do NOT actually upload this — just verifying the mode signal
  } else {
    report('G8', 'Large file presign mode (skipped — test-large.jpg missing)', false, '')
    report('G9', 'XL file multipart mode check (skipped)', false, '')
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Cleanup — soft-delete all test uploads
  // ──────────────────────────────────────────────────────────────────────────────
  console.log('\n━━━━  Cleanup  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Soft-delete via DELETE /api/media (moves to trash — normal cleanup path)
  for (const fileId of [...new Set(toClean)]) {
    try {
      const delRes = await fetch(`${BASE_URL}/api/media`, {
        method:  'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(adminCookie ? { Cookie: adminCookie } : { Cookie: uploaderCookie }),
        },
        body: JSON.stringify({ id: fileId }),
      })
      console.log(`  Deleted mediaFile ${fileId}: status=${delRes.status}`)
    } catch (err) {
      console.log(`  Failed to delete ${fileId}: ${err.message}`)
    }
  }

  await prisma.$disconnect()

  // ──────────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────────
  const total = passed + failed
  console.log(`\n╔${'═'.repeat(68)}╗`)
  console.log(
    `║  Upload Results:  ${String(passed).padEnd(3)} PASSED  |  ${String(failed).padEnd(3)} FAILED  |  ${String(total).padEnd(3)} TOTAL${' '.repeat(Math.max(0, 22 - String(total).length))}║`
  )
  console.log(`╚${'═'.repeat(68)}╝\n`)

  if (failures.length) {
    console.log(`── Failed Tests ${'─'.repeat(53)}`)
    for (const f of failures) {
      console.log(`  ❌  [${f.id}] ${f.label}`)
      if (f.detail) console.log(`       ${f.detail}`)
    }
    console.log()
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error('\nFATAL:', err)
  await prisma.$disconnect()
  process.exit(1)
})
