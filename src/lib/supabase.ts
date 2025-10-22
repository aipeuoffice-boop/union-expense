import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  // Helps diagnose bad env in production builds
  const missing = [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
    !supabaseAnonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean).join(', ')
  throw new Error(`Missing env: ${missing}. On Vercel, set them in Project → Settings → Environment Variables.`)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
