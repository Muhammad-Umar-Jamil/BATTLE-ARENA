import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from './lib/auth-context'
import { supabase } from './lib/supabase'
import { validateGuardrail, type Guardrail, type GuardrailDraft } from './lib/guardrails'
import './App.css'

function LoadingScreen() {
  return <main className="center-screen" role="status" aria-live="polite">Loading your session…</main>
}

function LoginPage() {
  const { user, loading, signIn } = useAuth()
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
    if (result.error) return setError(result.error.message.includes('another browser') ? result.error.message : 'Invalid email or password.')
    toast.success('Signed in successfully.')
    const destination = result.profile?.is_admin ? '/admin' : '/'
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

function toDraft(row: Guardrail): GuardrailDraft {
  return { ...row, primary_api_key: '', secondary_api_key: '' }
}

function AdminPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [guardrails, setGuardrails] = useState<GuardrailDraft[]>([])
  const [openLevel, setOpenLevel] = useState(1)
  const [loading, setLoading] = useState(true)
  const [savingLevel, setSavingLevel] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function loadGuardrails() {
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('get_guardrails_admin')
    if (loadError) setError('Unable to load guardrail settings.')
    else setGuardrails(((data ?? []) as Guardrail[]).map(toDraft))
    setLoading(false)
  }

  useEffect(() => {
    if (profile?.is_admin) void loadGuardrails()
  }, [profile?.is_admin])

  if (!profile?.is_admin) return <Navigate to="/" replace />

  function updateDraft(levelId: number, field: keyof GuardrailDraft, value: string | number) {
    setGuardrails((current) => current.map((draft) => draft.level_id === levelId ? { ...draft, [field]: value } : draft))
  }

  async function saveDraft(draft: GuardrailDraft) {
    setError('')
    const validationError = validateGuardrail(draft)
    if (validationError) { setError(`Level ${draft.level_id}: ${validationError}`); return }
    setSavingLevel(draft.level_id)
    const { error: saveError } = await supabase.rpc('save_guardrail', {
      p_level_id: draft.level_id,
      p_system_prompt: draft.system_prompt,
      p_model_name: draft.model_name,
      p_temperature: draft.temperature,
      p_max_tokens: draft.max_tokens,
      p_primary_endpoint: draft.primary_endpoint,
      p_primary_api_key: draft.primary_api_key,
      p_timeout_seconds: draft.timeout_seconds,
      p_secondary_endpoint: draft.secondary_endpoint,
      p_secondary_api_key: draft.secondary_api_key,
      p_stream_delay_ms: draft.stream_delay_ms,
      p_max_points: draft.max_points,
    })
    setSavingLevel(null)
    if (saveError) setError(`Level ${draft.level_id}: unable to save these settings.`)
    else {
      toast.success(`Level ${draft.level_id} settings saved.`)
      await loadGuardrails()
    }
  }

  return <main className="arena-shell admin-shell">
    <header className="arena-header"><div><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span className="label accent-label">ADMIN CONTROL</span></div><button className="outline-button" onClick={async () => { await signOut(); navigate('/login') }}>LOG OUT</button></header>
    <section className="admin-content"><div className="admin-heading"><div><p className="label accent-label">ROUND SETTINGS</p><h1 className="display-font">Guardrails.</h1><p className="muted">Configure each level. Provider credentials stay on the server and are never returned here.</p></div><span className="admin-badge">{profile.username}</span></div>
      {error && <p className="error-banner admin-error" role="alert">{error}</p>}
      {loading ? <p className="muted" role="status">Loading level settings…</p> : <div className="guardrail-list">{guardrails.map((draft) => <article className={`guardrail-card ${openLevel === draft.level_id ? 'open' : ''}`} key={draft.level_id}>
        <button className="guardrail-summary" onClick={() => setOpenLevel((level) => level === draft.level_id ? 0 : draft.level_id)} aria-expanded={openLevel === draft.level_id}><span><span className="label">LEVEL {draft.level_id}</span><strong className="display-font">{draft.model_name}</strong></span><span className="summary-meta">{draft.primary_key_configured ? 'PRIMARY KEY SET' : 'PROVIDER NOT CONFIGURED'} <b>{openLevel === draft.level_id ? '−' : '+'}</b></span></button>
        {openLevel === draft.level_id && <div className="guardrail-form"><div className="settings-grid">
          <label>Model name<input value={draft.model_name} onChange={(event) => updateDraft(draft.level_id, 'model_name', event.target.value)} /></label>
          <label>Primary endpoint <small>optional while provider is empty</small><input type="url" placeholder="https://…" value={draft.primary_endpoint ?? ''} onChange={(event) => updateDraft(draft.level_id, 'primary_endpoint', event.target.value)} /></label>
          <label>Primary API key <small>{draft.primary_key_configured ? 'stored securely; blank keeps it' : 'not configured'}</small><input type="password" autoComplete="new-password" value={draft.primary_api_key} onChange={(event) => updateDraft(draft.level_id, 'primary_api_key', event.target.value)} /></label>
          <label>Fallback endpoint <small>optional</small><input type="url" placeholder="https://…" value={draft.secondary_endpoint ?? ''} onChange={(event) => updateDraft(draft.level_id, 'secondary_endpoint', event.target.value)} /></label>
          <label>Fallback API key <small>{draft.secondary_key_configured ? 'stored securely; blank keeps it' : 'not configured'}</small><input type="password" autoComplete="new-password" value={draft.secondary_api_key} onChange={(event) => updateDraft(draft.level_id, 'secondary_api_key', event.target.value)} /></label>
          <label>Request timeout (seconds)<input type="number" min="5" max="120" value={draft.timeout_seconds} onChange={(event) => updateDraft(draft.level_id, 'timeout_seconds', Number(event.target.value))} /></label>
          <label>Max tokens<input type="number" min="1" max="8192" value={draft.max_tokens} onChange={(event) => updateDraft(draft.level_id, 'max_tokens', Number(event.target.value))} /></label>
          <label>Max points<input type="number" min="1" max="1000" value={draft.max_points} onChange={(event) => updateDraft(draft.level_id, 'max_points', Number(event.target.value))} /></label>
          <label>Typewriter delay (ms)<input type="number" min="10" max="2000" value={draft.stream_delay_ms} onChange={(event) => updateDraft(draft.level_id, 'stream_delay_ms', Number(event.target.value))} /></label>
          <label className="range-field">Temperature <output>{draft.temperature.toFixed(1)}</output><input type="range" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => updateDraft(draft.level_id, 'temperature', Number(event.target.value))} /></label>
        </div><label>Base system prompt <small>Use the literal placeholder {'{{SECRET}}'} for the team target.</small><textarea rows={6} value={draft.system_prompt} onChange={(event) => updateDraft(draft.level_id, 'system_prompt', event.target.value)} /></label><div className="guardrail-actions"><span className="muted">Changes apply to the next request.</span><button className="arena-button" onClick={() => void saveDraft(draft)} disabled={savingLevel === draft.level_id}>{savingLevel === draft.level_id ? 'SAVING…' : 'SAVE LEVEL'}</button></div></div>}
      </article>)}</div>}
    </section><Toaster position="top-center" theme="dark" />
  </main>
}
function AppRoutes() { return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} /><Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
export default function App() { return <AuthProvider><AppRoutes /></AuthProvider> }





