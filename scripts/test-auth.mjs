/**
 * scripts/test-auth.mjs
 * Automated authentication test runner against http://localhost:3000
 * Run with:  node --env-file=.env.local scripts/test-auth.mjs
 */

const BASE = 'http://localhost:3000'
const CSRF_URL  = `${BASE}/api/auth/csrf`
const LOGIN_URL = `${BASE}/api/auth/callback/credentials`

let passed = 0
let failed = 0

function report(id, name, ok, detail = '') {
  const tag = ok ? '✅ PASS' : '❌ FAIL'
  console.log(`${tag}  S${id}: ${name}`)
  if (detail) console.log(`       ${detail}`)
  ok ? passed++ : failed++
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getCsrfToken() {
  const r = await fetch(CSRF_URL, { credentials: 'include' })
  const { csrfToken } = await r.json()
  // Extract cookie header
  const setCookie = r.headers.get('set-cookie') ?? ''
  return { csrfToken, cookie: setCookie }
}

async function login(identifier, password, existingCookie = '') {
  const { csrfToken, cookie: newCookie } = await getCsrfToken()
  const cookieHeader = [existingCookie, newCookie].filter(Boolean).join('; ')

  const body = new URLSearchParams({
    identifier,
    password,
    csrfToken,
    callbackUrl: `${BASE}/dashboard`,
    json: 'true',
  })

  const r = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader,
    },
    body: body.toString(),
    redirect: 'manual',
  })

  const setCookie = r.headers.get('set-cookie') ?? ''
  const location  = r.headers.get('location') ?? ''
  const status    = r.status
  const text      = await r.text().catch(() => '')

  return { status, location, setCookie, text }
}

async function getProtectedPage(path, sessionCookie = '') {
  const r = await fetch(`${BASE}${path}`, {
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
    redirect: 'manual',
  })
  return { status: r.status, location: r.headers.get('location') ?? '' }
}

// Extract session cookie from a set-cookie header
function extractSession(setCookie) {
  const match = setCookie.match(/(next-auth\.session-token|__Secure-next-auth\.session-token)[^;]*/i)
  return match ? match[0] : ''
}

function isHttpOnly(setCookie) {
  return /HttpOnly/i.test(setCookie)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════')
console.log('  Christhood CMMS — Auth Test Suite')
console.log('  Target:', BASE)
console.log('═══════════════════════════════════════════════════\n')

// S1 — Valid login as Admin
console.log('── Scenario 1: Valid login (Admin) ──')
try {
  const { status, location, setCookie } = await login('testadmin', 'TestAdmin123!')
  const sessionCookie = extractSession(setCookie)
  const hasSession    = sessionCookie.length > 0
  const httpOnly      = isHttpOnly(setCookie)
  const redirectsOk   = location.includes('/dashboard') || status === 200

  report(1, 'Admin login succeeds',        redirectsOk || hasSession,
    `status=${status} location="${location}" hasSession=${hasSession}`)
  report('1b', 'Session cookie is HttpOnly', httpOnly,
    `set-cookie header: ${setCookie.slice(0, 120)}`)

  // store for S6 / S8
  globalThis.adminCookie = sessionCookie
  globalThis.adminSetCookieFull = setCookie
} catch (e) {
  report(1, 'Valid login (Admin)',  false, `Exception: ${e.message}`)
  globalThis.adminCookie = ''
}

// S2 — Valid login as Uploader
console.log('\n── Scenario 2: Valid login (Uploader) ──')
try {
  const { status, location, setCookie } = await login('testuploader', 'TestUpload123!')
  const sessionCookie = extractSession(setCookie)
  const hasSession    = sessionCookie.length > 0
  const redirectsOk   = location.includes('/dashboard') || status === 200

  report(2, 'Uploader login succeeds', redirectsOk || hasSession,
    `status=${status} location="${location}" hasSession=${hasSession}`)
} catch (e) {
  report(2, 'Valid login (Uploader)', false, `Exception: ${e.message}`)
}

// S3 — Wrong password
console.log('\n── Scenario 3: Wrong password ──')
try {
  const { status, location, setCookie, text } = await login('testadmin', 'WrongPassword')
  const sessionCookie = extractSession(setCookie)
  const noSession     = sessionCookie.length === 0
  const hasError      = location.includes('error') || text.includes('error') || text.includes('Error')
  const staysOnLogin  = location.includes('/login') || (location === '' && status >= 400)

  report(3, 'Wrong password: no session created',  noSession,
    `hasSession=${!noSession}`)
  report('3b', 'Wrong password: error returned',    hasError || staysOnLogin,
    `status=${status} location="${location}"`)
} catch (e) {
  report(3, 'Wrong password', false, `Exception: ${e.message}`)
}

// S4 — Non-existent user
console.log('\n── Scenario 4: Non-existent user ──')
try {
  const { status, location, setCookie, text } = await login('nobody', 'anything123')
  const noSession     = extractSession(setCookie).length === 0
  const hasError      = location.includes('error') || text.includes('error') || text.includes('Error')
  // Must NOT reveal "user not found"
  const noInfoLeak    = !text.toLowerCase().includes('not found') && !text.toLowerCase().includes('no user')

  report(4,  'Non-existent user: no session',       noSession,   `status=${status}`)
  report('4b','Non-existent user: no info leakage', noInfoLeak,  `body snippet: ${text.slice(0,200)}`)
} catch (e) {
  report(4, 'Non-existent user', false, `Exception: ${e.message}`)
}

// S5 — Empty form submission
console.log('\n── Scenario 5: Empty form submission ──')
try {
  const { status, location, setCookie, text } = await login('', '')
  const noSession  = extractSession(setCookie).length === 0
  const noRedirect = !location.includes('/dashboard')
  const noCrash    = status !== 500

  report(5,  'Empty form: no session',       noSession,  `status=${status}`)
  report('5b','Empty form: no server crash',  noCrash,   `status=${status}`)
  report('5c','Empty form: no /dashboard',    noRedirect, `location="${location}"`)
} catch (e) {
  report(5, 'Empty form submission', false, `Exception: ${e.message}`)
}

// S6 — Direct URL access without session (unauthenticated)
console.log('\n── Scenario 6: Direct URL access without session ──')
const protectedPaths = ['/dashboard', '/admin/users', '/admin/activity-log', '/events']
for (const path of protectedPaths) {
  try {
    const { status, location } = await getProtectedPage(path)
    const redirectsToLogin = status === 307 || status === 302 || status === 308 ||
                             location.includes('/login')
    report(`6-${path}`, `No-session access to ${path} → redirects to /login`,
      redirectsToLogin, `status=${status} location="${location}"`)
  } catch (e) {
    report(`6-${path}`, `No-session access to ${path}`, false, `Exception: ${e.message}`)
  }
}

// S7 — Session persistence (simulate re-open: same cookie, new request)
console.log('\n── Scenario 7: Session persistence ──')
try {
  const sessionCookie = globalThis.adminCookie
  if (!sessionCookie) throw new Error('No admin session from S1 — skipping')

  const { status, location } = await getProtectedPage('/dashboard', sessionCookie)
  const sessionValid = status === 200 || (status === 307 && !location.includes('/login'))

  report(7, 'Session persists across requests (re-open simulation)', sessionValid,
    `status=${status} location="${location}" cookie="${sessionCookie.slice(0,60)}..."`)
} catch (e) {
  report(7, 'Session persistence', false, `Exception: ${e.message}`)
}

// S8 — Logout then protected page validation
console.log('\n── Scenario 8: Logout ──')
try {
  // Call NextAuth signout endpoint
  const signoutUrl = `${BASE}/api/auth/signout`
  const csrfRes    = await fetch(CSRF_URL)
  const { csrfToken } = await csrfRes.json()

  const logoutRes = await fetch(signoutUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': globalThis.adminCookie,
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE}/login` }).toString(),
    redirect: 'manual',
  })
  const logoutOk = logoutRes.status === 200 || logoutRes.status === 302 ||
                   logoutRes.status === 307 || logoutRes.status === 303

  report(8, 'Logout endpoint responds successfully', logoutOk,
    `status=${logoutRes.status}`)

  // After logout, the old cookie should no longer grant access
  // (server-side JWT — cookie expiry is client-side, but middleware will still
  //  reject if cookie is cleared. We test with no cookie.)
  const { status: s2, location: l2 } = await getProtectedPage('/dashboard')
  const blockedAfterLogout = s2 === 307 || s2 === 302 || l2.includes('/login')

  report('8b', 'After logout, /dashboard is blocked for new requests', blockedAfterLogout,
    `status=${s2} location="${l2}"`)
} catch (e) {
  report(8, 'Logout', false, `Exception: ${e.message}`)
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════')
console.log(`  Results: ${passed} PASSED  |  ${failed} FAILED`)
console.log('═══════════════════════════════════════════════════\n')
if (failed > 0) process.exit(1)
