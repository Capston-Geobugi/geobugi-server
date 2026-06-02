import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
let supabaseClient = null

export function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are missing.')
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }

  return supabaseClient
}

export const supabase = new Proxy(
  {},
  {
    get(_target, property) {
      return getSupabase()[property]
    }
  }
)
