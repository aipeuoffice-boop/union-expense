import React, { createContext, useContext, useEffect, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { supabase } from "./lib/supabase"

const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin : "")

type AuthCtx = {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithMagicLink: (email: string) => Promise<{ error: unknown }>
  // Sign in using email + password (uses Supabase 'signInWithPassword')
  signInWithPassword: (email: string, password: string) => Promise<{ error: unknown; data?: unknown }>
  // Sign up (create) using email + password
  signUpWithPassword: (email: string, password: string) => Promise<{ error: unknown; data?: unknown }>
  // PIN-based helpers: these reuse the same password-based API but allow
  // using a short numeric PIN as the account password. This is a convenience
  // option only — PINs are short and weaker than regular passwords. We
  // intentionally avoid creating custom server-side PIN storage here and
  // reuse Supabase auth so no backend changes are required.
  // Security note: if you want robust PIN support, implement server-side
  // secure storage (hashed, salted) or use a multi-factor flow.
  signInWithPin: (email: string, pin: string) => Promise<{ error: unknown; data?: unknown }>
  signUpWithPin: (email: string, pin: string) => Promise<{ error: unknown; data?: unknown }>
  signOut: () => Promise<void>
}

// Provide a non-null default via a type assertion so Provider is correctly
// typed for usage in JSX. We still check at runtime in `useAuth`.
const Ctx = createContext<AuthCtx>({} as AuthCtx)

function hasAuthCode(url: string) {
  try {
    const u = new URL(url)
    return !!(u.searchParams.get("code") || u.hash.includes("type=recovery"))
  } catch {
    return false
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      // 1) Finish PKCE magic link if present
      if (hasAuthCode(window.location.href)) {
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href)
          // strip ?code= from URL
          const cleanUrl = window.location.origin + window.location.pathname
          window.history.replaceState({}, "", cleanUrl)
        } catch (e: unknown) {
          // Common: 400 if link already used or redirect domain not allowed
          // e may be an Error, but unknown keeps lint happy; stringify safely.
          const msg = e && typeof e === "object" && "message" in e ? (e as { message?: unknown }).message : String(e)
          console.warn("exchangeCodeForSession failed:", msg)
        }
      }

      // 2) Load current session
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)

      // 3) Subscribe updates
      const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
        setSession(sess)
        setUser(sess?.user ?? null)
      })

      setLoading(false)

      return () => {
        mounted = false
        sub.subscription.unsubscribe()
      }
    })()
  }, [])

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: SITE_URL, // must be whitelisted in Supabase Auth → URL config
      },
    })
    return { error }
  }

  const signInWithPassword = async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signInWithPassword({ email, password })
      return { error: res.error, data: res.data }
    } catch (error) {
      return { error }
    }
  }

  const signUpWithPassword = async (email: string, password: string) => {
    try {
      const res = await supabase.auth.signUp({ email, password })
      return { error: res.error, data: res.data }
    } catch (error) {
      return { error }
    }
  }

  // PIN flows: map to password flows. See notes in the AuthCtx type.
  const signInWithPin = async (email: string, pin: string) => {
    // Pin is treated as the account password here.
    return signInWithPassword(email, pin)
  }

  const signUpWithPin = async (email: string, pin: string) => {
    // Pin is treated as the account password here.
    return signUpWithPassword(email, pin)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return React.createElement(Ctx.Provider, {
    value: {
      user,
      session,
      loading,
      signInWithMagicLink,
      signInWithPassword,
      signUpWithPassword,
      signInWithPin,
      signUpWithPin,
      signOut,
    },
  }, children)
}

export const useAuth = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error("useAuth must be used within AuthProvider")
  return v
}
