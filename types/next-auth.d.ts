import NextAuth from 'next-auth'
import { AppRole } from '@/types'

declare module 'next-auth' {
  interface Session {
    user: {
      id:                  string
      username?:           string | null
      name?:               string | null
      email?:              string | null
      image?:              string | null
      role:                AppRole
      requiresTwoFactor?:  boolean
      isActive?:           boolean
    }
  }

  interface User {
    id:                 string
    username?:          string | null
    role:               AppRole
    requiresTwoFactor?: boolean
    isActive?:          boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id:                 string
    username?:          string | null
    role:               AppRole
    requiresTwoFactor?: boolean
    isActive?:          boolean
  }
}
