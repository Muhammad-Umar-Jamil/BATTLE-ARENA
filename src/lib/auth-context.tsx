import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'

export type Profile = { id: string; username: string; total_score: number; is_admin: boolean }
type AuthResult = { error: Error | null; profile?: Profile | null }
type AuthValue = { user: User | null; session: Session | null; profile: Profile | null; loading: boolean; signIn: (email: string, password: string) => Promise<AuthResult>; signOut: () => Promise<AuthResult> }
const AuthContext = createContext<AuthValue | undefined>(undefined)
const SESSION_STORAGE_KEY = 'battle-arena.session-id'

function getClientSessionId() {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) return existing
  const next = crypto.randomUUID()
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, next)
  return next
}

async function acquireSession() {
  const { data, error } = await supabase.rpc('acquire_active_session', { p_new_session_id: getClientSessionId() })
  if (error) return new Error('Unable to acquire a competition session.')
  if (data !== 'OK') {
    if (data === 'LOCKED') return new Error('Account already active in another browser. Try again after 31 seconds.')
    if (data === 'DISABLED') return new Error('Logins are currently disabled by the administrator.')
    if (data === 'EVENT_NOT_STARTED') return new Error('The event is not currently running.')
    return new Error('This account cannot start a session right now.')
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase.from('profiles').select('id, username, total_score, is_admin').eq('id', userId).maybeSingle()
    if (error) { setProfile(null); return null }
    const nextProfile = data as Profile | null
    setProfile(nextProfile)
    return nextProfile
  }

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return }
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) { setProfile(null); setLoading(false) }
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let active = true
    setLoading(true)
    void acquireSession().then(async (sessionError) => {
      if (sessionError) { await supabase.auth.signOut(); return null }
      return fetchProfile(session.user.id)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    if (!session?.user) return
    let active = true
    const heartbeat = window.setInterval(async () => {
      const { data, error } = await supabase.rpc('heartbeat_active_session', { p_session_id: getClientSessionId() })
      if (active && (error || data !== 'OK')) {
        await supabase.auth.signOut()
      }
    }, 15_000)
    return () => { active = false; window.clearInterval(heartbeat) }
  }, [session?.user.id])

  const value = useMemo<AuthValue>(() => ({
    user: session?.user ?? null,
    session,
    profile,
    loading,
    signIn: async (email, password) => {
      if (!supabaseConfigured) return { error: new Error('Supabase is not configured.') }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session) return { error }
      setSession(data.session)
      const sessionError = await acquireSession()
      if (sessionError) { await supabase.auth.signOut(); setSession(null); return { error: sessionError } }
      const nextProfile = await fetchProfile(data.user.id)
      return { error: null, profile: nextProfile }
    },
    signOut: async () => {
      if (!supabaseConfigured) return { error: null }
      await supabase.rpc('release_active_session', { p_session_id: getClientSessionId() })
      const { error } = await supabase.auth.signOut()
      return { error }
    },
  }), [loading, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used inside AuthProvider'); return context }
