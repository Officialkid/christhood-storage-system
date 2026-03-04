import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider      from 'next-auth/providers/google'
import { PrismaAdapter }   from '@next-auth/prisma-adapter'
import bcrypt              from 'bcryptjs'
import { prisma }          from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn:   '/login',
    error:    '/login',
    newUser:  '/dashboard',
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
      async authorize(credentials) {
        const { identifier, password } = credentials ?? {}
        if (!identifier || !password) return null

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email:    identifier },
              { username: identifier },
            ],
          },
        })

        if (!user?.passwordHash) return null

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

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
    async jwt({ token, user, account }) {
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
