import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from './lib/auth-context'
import './App.css'

function LoadingScreen() {
  return <main className="center-screen" role="status" aria-live="polite">Loading your session…</main>
}

function LoginPage() {
  const { user, profile, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!email.trim()) return setError('Email is required.')
    if (!email.includes('@')) return setError('Enter a valid email address.')
    if (!password) return setError('Password is required.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')
    setSubmitting(true)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) return setError('Invalid email or password.')
    toast.success('Signed in successfully.')
    const destination = profile?.is_admin ? '/admin' : '/'
    navigate(destination)
  }

  return <main className="login-screen">
    <nav className="arena-nav"><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span className="label">NASCON · ROUND 1</span></nav>
    <section className="login-gate" aria-labelledby="login-title">
      <div className="login-art"><div className="core-orb"><span></span><span></span><span></span><b>AI</b></div><div><p className="label accent-label">PROMPT ENGINEERING COMPETITION</p><h1 className="display-font">Make it<br /><em>talk.</em></h1><p className="muted">The arena is ready. Enter the credentials provided by your administrator.</p></div></div>
      <div className="login-form-panel"><p className="label">TEAM ACCESS</p><h2 id="login-title" className="display-font">Enter the arena.</h2><p className="muted">Your team account is created by an administrator.</p><form onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email<input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label htmlFor="password">Password<div className="password-row"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="text-button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'HIDE' : 'SHOW'}</button></div></label>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button className="arena-button" type="submit" disabled={submitting}>{submitting ? 'VERIFYING…' : 'BEGIN ROUND →'}</button>
      </form></div>
    </section>
    <footer className="login-facts"><div><strong className="display-font">60</strong><span className="label">MINUTES</span></div><div><strong className="display-font">∞</strong><span className="label">PROMPTS</span></div><div><strong className="display-font">∞</strong><span className="label">GUESSES</span></div></footer>
    <Toaster position="top-center" theme="dark" />
  </main>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth(); const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <>{children}</>
}

function ArenaPage() {
  const { profile, signOut } = useAuth(); const navigate = useNavigate()
  return <main className="arena-shell"><header className="arena-header"><div><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span className="label">TEAM {profile?.username?.toUpperCase() ?? 'UNKNOWN'}</span></div><div className="timer"><span className="label">TIME REMAINING</span><strong className="display-font">--:--</strong></div><div className="score"><span className="label">SCORE</span><strong className="display-font">{profile?.total_score ?? 0}</strong></div></header><div className="arena-grid"><aside className="arena-rail"><span className="label">DIFFICULTY</span>{['Easy', 'Medium', 'Hard'].map((level, index) => <button className={`level-button ${index === 0 ? 'active' : ''}`} key={level}><span><small>0 / 5 BREACHED</small><b className="display-font">{level}</b></span><strong className="display-font">+{[100, 250, 500][index]}</strong></button>)}<span className="label rail-section">TARGETS</span>{['Target 01', 'Target 02', 'Target 03'].map((target, index) => <button className="target-button" key={target}><i>0{index + 1}</i><span>{target}</span><small>SEALED</small></button>)}</aside><section className="arena-center"><div className="section-heading"><span className="display-font">Warden</span><span className="label">TARGET 01 · EASY</span></div><div className="empty-arena"><div className="core-orb small"><b>AI</b></div><h2 className="display-font">The Warden is waiting.</h2><p>Chat and target tools will be connected in the next phase.</p></div><div className="composer"><textarea disabled rows={2} placeholder="Write your prompt. Every answer is a clue." /><button className="arena-button purple" disabled>ATTACK</button></div></section><aside className="arena-panel"><div className="panel-block"><span className="label accent-label">TARGET STATUS</span><h2 className="display-font">Sealed</h2><p className="muted">Your level targets will appear here after the arena controls are connected.</p></div><div className="panel-block"><span className="label">LEADERBOARD</span><div className="leader-row"><span>01</span><b>Waiting for round</b><strong>—</strong></div></div><button className="outline-button" onClick={async () => { await signOut(); navigate('/login') }}>LOG OUT</button></aside></div></main>
}

function AdminPage() { const { profile } = useAuth(); if (!profile?.is_admin) return <Navigate to="/" replace />; return <main className="arena-shell"><section className="admin-placeholder"><p className="label accent-label">ADMIN CONTROL</p><h1 className="display-font">Provider settings.</h1><p className="muted">Primary and fallback provider settings will be connected in a later phase. No provider keys are configured.</p></section></main> }
function AppRoutes() { return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} /><Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
export default function App() { return <AuthProvider><AppRoutes /></AuthProvider> }


