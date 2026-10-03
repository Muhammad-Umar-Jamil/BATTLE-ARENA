import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from './supabase'

export type Profile = { id: string; username: string; total_score: number; is_admin: boolean }
type AuthResult = { error: Error | null; profile?: Profile | null }
type AuthValue = { user: User | null; session: Session | null; profile: Profile | null; loading: boolean; signIn: (email: string, password: string) => Promise<AuthResult>; signOut: () => Promise<AuthResult> }
const AuthContext = createContext<AuthValue | undefined>(undefined)

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
    void fetchProfile(session.user.id).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
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
      const nextProfile = await fetchProfile(data.user.id)
      return { error: null, profile: nextProfile }
    },
    signOut: async () => {
      if (!supabaseConfigured) return { error: null }
      const { error } = await supabase.auth.signOut()
      return { error }
    },
  }), [loading, profile, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used inside AuthProvider'); return context }
