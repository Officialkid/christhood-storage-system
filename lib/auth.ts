import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider      from 'next-auth/providers/google'
import { PrismaAdapter }   from '@next-auth/prisma-adapter'
import bcrypt              from 'bcryptjs'
import { prisma }          from './prisma'
import { log }             from './activityLog'

// ── Progressive delay (Layer 2): slow down repeated failures before hard lockout ──
// Uses the per-user consecutive failure count already stored in the DB.
//   0–2 failures → no delay (instant response)
//   3rd failure  → 2 s delay before responding
//   4th+ failure → 5 s delay before responding
function loginDelay(failedAttempts: number): number {
  if (failedAttempts >= 4) return 5_000
  if (failedAttempts === 3) return 2_000
  return 0
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn:   '/login',
    error:    '/login',
    newUser:  '/dashboard',
  },

  // ── Hardened cookie configuration ─────────────────────────────────────────
  // Explicitly set HttpOnly, Secure, and SameSite on all NextAuth cookies so
  // the security posture is not dependent on implicit defaults.
  //
  // SameSite=Lax (not Strict) is required for OAuth redirect flows:
  //   - Google OAuth redirects back from accounts.google.com, which is a
  //     top-level cross-site navigation.  Lax cookies ARE sent on top-level
  //     GET navigations, so the Google callback lands with a valid session.
  //   - Strict would silently drop the cookie on that redirect, breaking OAuth.
  //
  // Secure=true in production ensures the cookie is only sent over HTTPS.
  // In local dev (NODE_ENV !== 'production') Secure=false lets http://localhost work.
  useSecureCookies: process.env.NODE_ENV === 'production',
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path:     '/',
        secure:   process.env.NODE_ENV === 'production',
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.callback-url'
        : 'next-auth.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'lax' as const,
        path:     '/',
        secure:   process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      // The CSRF cookie itself must NOT be HttpOnly so NextAuth's client SDK
      // can read the token half and submit it in the form POST body.
      // NextAuth's split-token design means the server can still validate it
      // without relying solely on the cookie.
      name: process.env.NODE_ENV === 'production'
        ? '__Host-next-auth.csrf-token'
        : 'next-auth.csrf-token',
      options: {
        httpOnly: false,
        sameSite: 'lax' as const,
        path:     '/',
        secure:   process.env.NODE_ENV === 'production',
      },
    },
  },

  providers: [
    // ── Google OAuth ────────────────────────────────────────────
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ── Username / Email + Password ─────────────────────────────
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        identifier: { label: 'Username or Email', type: 'text'     },
        password:   { label: 'Password',          type: 'password' },
      },
      async authorize(credentials, req) {
        const { identifier, password } = credentials ?? {}
        if (!identifier || !password) return null

        // Extract client IP from NextAuth's internal request wrapper
        const rawIp = req.headers?.['x-forwarded-for'] ?? req.headers?.['x-real-ip']
        const ip = (
          Array.isArray(rawIp) ? rawIp[0] : String(rawIp ?? '').split(',')[0]
        ).trim() || '127.0.0.1'

        // ── Find user ──────────────────────────────────────────────────────
        const user = await prisma.user.findFirst({
          where: { OR: [{ email: identifier }, { username: identifier }] },
        })

        // ── Layer 3: Account lockout check ─────────────────────────────────
        if (user?.lockedUntil && user.lockedUntil > new Date()) {
          await log('USER_LOGIN_FAILED', user.id, {
            metadata: { reason: 'ACCOUNT_LOCKED', identifier, ip },
          })
          return null  // UI queries /api/auth/account-status for lockout details
        }

        // ── Deactivated account check ──────────────────────────────────────
        // Return null silently (same as unknown user) so as not to reveal account exists
        if (user?.isActive === false) return null

        // Unknown user or OAuth-only account — return null without revealing existence
        if (!user?.passwordHash) return null

        // ── Layer 2: Progressive delay ──────────────────────────────────────
        const delay = loginDelay(user.failedLoginAttempts)
        if (delay > 0) await new Promise(r => setTimeout(r, delay))

        // ── Password check ──────────────────────────────────────────────────
        const valid = await bcrypt.compare(password, user.passwordHash)

        if (!valid) {
          const newCount = user.failedLoginAttempts + 1
          // Lock after 10 consecutive failures for 30 minutes
          const shouldLock  = newCount >= 10
          const lockedUntil = shouldLock ? new Date(Date.now() + 30 * 60 * 1000) : undefined

          await prisma.user.update({
            where: { id: user.id },
            data:  {
              failedLoginAttempts: newCount,
              ...(shouldLock ? { lockedUntil } : {}),
            },
          })

          // ── Layer 4: Log failed attempt ────────────────────────────────
          await log('USER_LOGIN_FAILED', user.id, {
            metadata: { reason: 'WRONG_PASSWORD', identifier, ip, attempt: newCount, locked: shouldLock },
          })

          return null
        }

        // ── Successful login — reset all failure state ──────────────────────
        await prisma.user.update({
          where: { id: user.id },
          data:  { failedLoginAttempts: 0, lockedUntil: null },
        })

        // ── Layer 4: Log success ────────────────────────────────────────────
        await log('USER_LOGIN_SUCCESS', user.id, {
          metadata: { identifier, ip },
        })

        return {
          id:       user.id,
          name:     user.username ?? user.name ?? user.email,
          email:    user.email,
          username: user.username,
          role:     user.role,
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.id       = user.id
        token.role     = ((user as { role?: string }).role ?? 'UPLOADER') as import('@/types').AppRole
        token.username = (user as { username?: string }).username ?? null
      }
      // On Google sign-in, fetch fresh role from DB (may differ from default)
      if (account?.provider === 'google' && token.sub) {
        const dbUser = await prisma.user.findUnique({ where: { id: token.sub } })
        if (dbUser) {
          token.id       = dbUser.id
          token.role     = dbUser.role
          token.username = dbUser.username ?? null
        }
      }
      // Re-read from DB when session is explicitly updated (e.g. after username change)
      if (trigger === 'update' && token.id) {
        const dbUser = await prisma.user.findUnique({
          where:  { id: token.id as string },
          select: { username: true, role: true },
        })
        if (dbUser) {
          token.username = dbUser.username ?? null
          token.role     = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id       = token.id       as string
        session.user.role     = token.role as import('@/types').AppRole
        session.user.username = token.username as string | null
      }
      return session
    },
  },

  events: {
    // Auto-assign a username for Google OAuth sign-ups
    async createUser({ user }) {
      if (!user.email) return
      const base     = user.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '')
      const username = `${base}_${Math.random().toString(36).slice(2, 6)}`
      await prisma.user.update({ where: { id: user.id }, data: { username } })
    },
  },
}
