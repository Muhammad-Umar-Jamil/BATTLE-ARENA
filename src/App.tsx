import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from './lib/auth-context'
import './App.css'

function LoadingScreen() { return <main className="center-screen" role="status" aria-live="polite">Loading your session…</main> }

function LoginPage() {
  const { user, loading, signIn } = useAuth(); const navigate = useNavigate()
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false)
  if (loading) return <LoadingScreen />; if (user) return <Navigate to="/" replace />
  async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); if (!email.trim()) return setError('Email is required.'); if (!email.includes('@')) return setError('Enter a valid email address.'); if (!password) return setError('Password is required.'); if (password.length < 6) return setError('Password must be at least 6 characters.'); setSubmitting(true); const result = await signIn(email.trim(), password); setSubmitting(false); if (result.error) return setError('Invalid email or password.'); toast.success('Signed in successfully.'); navigate('/') }
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="login-title"><p className="eyebrow">BATTLE ARENA</p><h1 id="login-title">Team login</h1><p className="muted">Use the account provided by your administrator.</p><form onSubmit={handleSubmit} noValidate><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /><label htmlFor="password">Password</label><div className="password-row"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="secondary-button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div>{error && <p className="error-banner" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button></form></section><Toaster position="top-center" /></main>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) { const { user, loading } = useAuth(); const location = useLocation(); if (loading) return <LoadingScreen />; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />; return <>{children}</> }
function ArenaPage() { const { profile, signOut } = useAuth(); const navigate = useNavigate(); return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">BATTLE ARENA</p><h1>Welcome, {profile?.username ?? 'team'}</h1></div><button className="secondary-button" onClick={async () => { await signOut(); navigate('/login') }}>Log out</button></header><section className="placeholder-card"><p className="eyebrow">PHASE 1 COMPLETE</p><h2>The arena is ready for the next phase.</h2><p className="muted">Authentication is connected to Supabase. Provider settings remain empty until configured.</p></section></main> }
function AdminPage() { const { profile } = useAuth(); if (!profile?.is_admin) return <Navigate to="/" replace />; return <main className="app-shell"><section className="placeholder-card"><p className="eyebrow">ADMIN</p><h1>Admin controls</h1><p className="muted">Provider settings are intentionally empty in Phase 1.</p></section></main> }
function AppRoutes() { return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} /><Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
export default function App() { return <AuthProvider><AppRoutes /></AuthProvider> }

