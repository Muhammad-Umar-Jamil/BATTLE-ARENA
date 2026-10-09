import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AuthProvider, useAuth } from './lib/auth-context'
import { functionUrl, supabase, supabaseAnonKey } from './lib/supabase'
import { validateGuardrail, type Guardrail, type GuardrailDraft } from './lib/guardrails'
import { guessLabel, isGuessUsable } from './lib/guess-policy'
import { functionErrorMessage } from './lib/function-error'
import { readChatStream } from './lib/chat-stream'
import { createCharacterPacer, type CharacterPacer } from './lib/character-pacer'
import { groupArchivedChats, type ArchivedChatMessage } from './lib/chat-history'
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
    if (result.error) return setError(result.error.message.includes('another browser') || result.error.message.includes('Logins') || result.error.message.includes('event') ? result.error.message : 'Invalid email or password.')
    // Fullscreen is a convenience restriction. Do not block a successful login
    // on a browser permission/promise that may remain pending in some browsers.
    void document.documentElement.requestFullscreen().catch(() => undefined)
    toast.success('Signed in successfully.')
    const destination = result.profile?.is_admin ? '/admin' : '/'
    navigate(destination)
  }

  return <main className="login-screen" data-testid="login-page">
    <nav className="arena-nav"><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span className="label">NASCON · ROUND 1</span></nav>
    <section className="login-gate" aria-labelledby="login-title">
      <div className="login-art"><div className="core-orb"><span></span><span></span><span></span><b>AI</b></div><div><p className="label accent-label">PROMPT ENGINEERING COMPETITION</p><h1 className="display-font">Make it<br /><em>talk.</em></h1><p className="muted">The arena is ready. Enter the credentials provided by your administrator.</p></div></div>
      <div className="login-form-panel"><p className="label">TEAM ACCESS</p><h2 id="login-title" className="display-font">Enter the arena.</h2><p className="muted">Your team account is created by an administrator.</p><form data-testid="login-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="email">Email<input data-testid="email-input" id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label htmlFor="password">Password<div className="password-row"><input data-testid="password-input" id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button data-testid="password-toggle" type="button" className="text-button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'HIDE' : 'SHOW'}</button></div></label>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button data-testid="login-submit" className="arena-button" type="submit" disabled={submitting}>{submitting ? 'VERIFYING…' : 'BEGIN ROUND →'}</button>
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
  const { profile, session, signOut } = useAuth(); const navigate = useNavigate()
  const [level, setLevel] = useState(1); const [prompt, setPrompt] = useState(''); const [messages, setMessages] = useState<{ role: string; content: string }[]>([]); const [busy, setBusy] = useState(false); const [thinkingMessageIndex, setThinkingMessageIndex] = useState(0); const [error, setError] = useState(''); const [guess, setGuess] = useState(''); const [result, setResult] = useState<{ similarity_score: number; awarded_points: number; base_points?: number; time_bonus?: number; time_left_minutes?: number; is_new_best: boolean; total_score?: number } | null>(null); const [guessUsed, setGuessUsed] = useState<Record<number, boolean>>({}); const [score, setScore] = useState(0); const [eventEnd, setEventEnd] = useState<string | null>(null); const [clock, setClock] = useState(Date.now()); const [fullscreenRequired, setFullscreenRequired] = useState(false); const [leaders, setLeaders] = useState<{ rank: number; username: string; total_score: number }[]>([])
  const thinkingMessages = ['Warden is tuning the signal…', 'Searching the clue lattice…', 'Cross-checking the hidden trail…', 'Assembling a useful hint…', 'The arena is thinking three moves ahead…', 'Almost ready — keep your eyes on the signal…']
  const chatHistoryRef = useRef<HTMLDivElement | null>(null)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const currentLevelLocked = Boolean(guessUsed[level])
  useEffect(() => { const history = chatHistoryRef.current; if (history) history.scrollTop = history.scrollHeight }, [messages, busy])
  useEffect(() => { void supabase.rpc('list_chat_messages', { p_level_id: level }).then(({ data }) => setMessages((data ?? []) as { role: string; content: string }[])); void supabase.rpc('list_submissions', { p_level_id: level }).then(({ data }) => { const submission = (data ?? [])[0] as { similarity_score: number; awarded_points: number } | undefined; setGuessUsed((current) => ({ ...current, [level]: Boolean(submission) })); setResult(submission ? { ...submission, is_new_best: true } : null) }) }, [level])
  useEffect(() => { setScore(profile?.total_score ?? 0) }, [profile?.total_score])
  useEffect(() => { const load = () => void supabase.rpc('public_leaderboard').then(({ data }) => setLeaders((data ?? []) as { rank: number; username: string; total_score: number }[])); load(); const timer = window.setInterval(load, 15000); return () => window.clearInterval(timer) }, [])
  useEffect(() => { void supabase.rpc('get_participant_event').then(({ data }) => setEventEnd((data?.[0] as { end_time: string | null } | undefined)?.end_time ?? null)); const onFull = () => setFullscreenRequired(Boolean(document.fullscreenEnabled && !document.fullscreenElement)); const onKey = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); if (event.key === 'F12' || (event.ctrlKey && ['i','j','u','s','p'].includes(key)) || (event.ctrlKey && event.shiftKey && key === 'c')) { event.preventDefault(); toast.error('Developer tools are disabled during the competition.') } }; const onContext = (event: MouseEvent) => { event.preventDefault(); toast.error('Context menu is disabled during the competition.') }; document.addEventListener('fullscreenchange', onFull); document.addEventListener('keydown', onKey); document.addEventListener('contextmenu', onContext); return () => { document.removeEventListener('fullscreenchange', onFull); document.removeEventListener('keydown', onKey); document.removeEventListener('contextmenu', onContext) } }, [])
  useEffect(() => { if (!eventEnd) return; const timer = window.setInterval(() => { setClock(Date.now()); if (new Date(eventEnd).getTime() <= Date.now()) { toast.error('Event Over!'); void signOut(); navigate('/login') } }, 1000); return () => window.clearInterval(timer) }, [eventEnd, navigate, signOut])
  useEffect(() => { if (!busy) { setThinkingMessageIndex(0); return }; const timer = window.setInterval(() => setThinkingMessageIndex((index) => (index + 1) % thinkingMessages.length), 1800); return () => window.clearInterval(timer) }, [busy, thinkingMessages.length])
  async function attack(event: FormEvent) {
    event.preventDefault(); if (currentLevelLocked || !prompt.trim() || busy || !session?.access_token || !supabaseAnonKey) return
    setBusy(true); setError(''); const current = prompt.trim(); setPrompt('')
    setMessages((items) => [...items, { role: 'user', content: current }, { role: 'assistant', content: '' }])
    let pacer: CharacterPacer | null = null
    try {
      const response = await fetch(functionUrl('chat-gateway'), { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey, 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ level_id: level, prompt: current }) })
      if (!response.ok || !response.body) { let data: unknown = null; try { data = await response.json() } catch { /* no JSON body */ }; setError(await functionErrorMessage({ context: { json: async () => data } }, data, 'The warden could not answer.')); setMessages((items) => items.at(-1)?.role === 'assistant' ? items.slice(0, -1) : items); return }
      let visible = ''
      let receivedMeta = false
      let receivedContent = false
      pacer = createCharacterPacer(35, (character) => {
        visible += character
        setMessages((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: visible } : item))
      })
      await readChatStream(response.body, (streamEvent) => {
        if (streamEvent.type === 'meta') {
          if (receivedMeta) throw new Error('The chat stream sent duplicate settings.')
          receivedMeta = true
          pacer!.setGap(Math.max(10, Math.min(2000, streamEvent.stream_delay_ms)))
        } else if (streamEvent.type === 'chunk') {
          if (!receivedMeta) throw new Error('The chat stream did not send its settings first.')
          receivedContent ||= streamEvent.content.length > 0
          pacer!.enqueue(streamEvent.content)
        } else if (streamEvent.type === 'done' && !receivedContent) {
          throw new Error('The warden returned an empty answer.')
        }
      })
      await pacer.finish()
    } catch (streamError) {
      if (pacer) await pacer.finish()
      setMessages((items) => items.at(-1)?.role === 'assistant' && !items.at(-1)?.content ? items.slice(0, -1) : items)
      setError(streamError instanceof Error && streamError.message !== 'PROVIDER_UNAVAILABLE' ? streamError.message : 'The warden could not answer.')
    } finally { setBusy(false) }
  }
  async function clearHistory() { if (currentLevelLocked) return; const { error: clearError } = await supabase.rpc('clear_chat_history', { p_level_id: level }); if (clearError) { setError('Unable to clear this level history.'); return } setMessages([]); toast.success(`Level ${level} chat history cleared.`) }
  async function submitGuess(event: FormEvent) { event.preventDefault(); if (busy || !isGuessUsable(guessUsed, level, guess, Boolean(session))) return; setError(''); const { data, error: submitError } = await supabase.functions.invoke('evaluate', { body: { level_id: level, submitted_word: guess.trim() } }); if (submitError || data?.error) { const { data: currentAttempts } = await supabase.rpc('list_submissions', { p_level_id: level }); if ((currentAttempts ?? []).length > 0) setGuessUsed((current) => ({ ...current, [level]: true })); setError(await functionErrorMessage(submitError, data, 'Unable to score guess.')); return } setGuessUsed((current) => ({ ...current, [level]: true })); setResult(data); if (typeof data?.total_score === 'number') setScore(data.total_score); setGuess('') }
  const remaining = eventEnd ? Math.max(0, Math.floor((new Date(eventEnd).getTime() - clock) / 1000)) : 0
  return <main data-testid="arena-page" className="arena-shell participant-arena">{fullscreenRequired && <div data-testid="fullscreen-overlay" className="fullscreen-overlay"><h2 className="display-font">Action Restricted</h2><p>Return to fullscreen to continue the competition.</p><button data-testid="fullscreen-reenter" className="arena-button" onClick={() => void document.documentElement.requestFullscreen()}>RE-ENTER FULLSCREEN</button></div>}<header className="arena-header"><div><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span data-testid="team-name" className="label">TEAM {profile?.username?.toUpperCase() ?? 'UNKNOWN'}</span></div><div className="timer"><span className="label">TIME REMAINING</span><strong data-testid="event-timer" className="display-font">{String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</strong></div><div className="score"><span className="label">SCORE</span><strong data-testid="team-score" className="display-font">{score}</strong></div><button type="button" className="mobile-leaders outline-button" aria-label="Leaderboard and account" aria-expanded={showLeaderboard} onClick={() => setShowLeaderboard((open) => !open)}>☰</button></header><div className="arena-grid"><aside className="arena-rail"><span className="label">DIFFICULTY</span>{['Easy', 'Medium', 'Hard'].map((name, index) => <button data-testid={`difficulty-${index + 1}`} className={`level-button ${level === index + 1 ? 'active' : ''}`} onClick={() => setLevel(index + 1)} disabled={busy} key={name}><span><small data-testid={`guess-status-${index + 1}`}>{guessLabel(guessUsed, index + 1)}</small><b className="display-font">{name}</b></span><strong className="display-font">+{[100, 250, 500][index]}</strong></button>)}<span className="label rail-section">TARGETS</span>{['Target 01', 'Target 02', 'Target 03'].map((target, index) => <button className="target-button" key={target}><i>0{index + 1}</i><span>{target}</span><small>{index + 1 === level ? 'ACTIVE' : 'SEALED'}</small></button>)}</aside><section className="arena-center"><div className="section-heading"><div><span className="display-font">Warden</span><span className="label">TARGET 0{level} · {['EASY', 'MEDIUM', 'HARD'][level - 1]}</span></div><button data-testid="clear-chat" className="outline-button clear-chat-button" onClick={() => void clearHistory()} disabled={currentLevelLocked || busy}>CLEAR LEVEL {level} CHAT</button></div><div data-testid="chat-history" ref={chatHistoryRef} className="chat-history" aria-live="polite">{messages.length === 0 && !busy && <div className="empty-arena"><div className="core-orb small"><b>AI</b></div><h2 className="display-font">The Warden is waiting.</h2><p>Send a prompt to begin.</p></div>}{messages.map((message, index) => <div className={`chat-message ${message.role}`} key={index}><span className="label">{message.role === 'user' ? 'YOU' : 'WARDEN'}</span><p>{message.content}</p></div>)}{busy && <div data-testid="warden-thinking" className="thinking-panel"><span className="thinking-orb" aria-hidden="true" /><div><strong>{thinkingMessages[thinkingMessageIndex]}</strong><small>Live clue stream active · the next signal is forming</small></div><div className="thinking-dots" aria-hidden="true"><i /><i /><i /></div></div>}</div>{error && <p className="error-banner" role="alert">{error}</p>}<form data-testid="chat-form" className="composer" onSubmit={attack}><textarea data-testid="chat-input" maxLength={2000} rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={currentLevelLocked ? `Level ${level} is locked after your guess.` : "Write your prompt. Every answer is a clue."} disabled={busy || currentLevelLocked} /><button data-testid="chat-submit" className="arena-button purple" disabled={busy || currentLevelLocked}>{busy ? 'WEAVING CLUES…' : 'ATTACK'}</button></form><form data-testid="guess-form" className="guess-form" onSubmit={submitGuess}><input data-testid="guess-input" maxLength={500} value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={guessUsed[level] ? 'Guess used for this difficulty' : 'Enter extracted secret'} disabled={guessUsed[level]} /><button data-testid="guess-submit" className="outline-button" disabled={guessUsed[level]}>{guessUsed[level] ? 'GUESS USED' : 'SUBMIT GUESS'}</button></form>{currentLevelLocked && <p data-testid="level-locked" className="level-locked-message">LEVEL {level} LOCKED · GUESS SUBMITTED</p>}{result && <div data-testid="guess-result" className={`result-card ${result.similarity_score >= 80 ? 'good' : result.similarity_score >= 50 ? 'mid' : 'low'}`}><strong>{result.similarity_score}% match · {result.awarded_points} points</strong>{result.is_new_best && <span> GUESS RECORDED</span>}</div>}</section><aside className={`arena-panel ${showLeaderboard ? 'open' : ''}`}><div className="panel-block"><span className="label accent-label">TARGET STATUS</span><h2 className="display-font">Active</h2><p className="muted">Your conversation is saved automatically for this level.</p></div><div className="panel-block"><span className="label">LEADERBOARD</span>{leaders.slice(0,5).map((leader) => <div data-testid={`leaderboard-row-${leader.username}`} className="leader-row" key={leader.username}><span>{leader.rank <= 3 ? ['🥇','🥈','🥉'][leader.rank - 1] : leader.rank}</span><b>{leader.username}</b><strong>{leader.total_score}</strong></div>)}</div><button data-testid="logout-button" className="outline-button" onClick={async () => { if (document.fullscreenElement) await document.exitFullscreen(); await signOut(); navigate('/login') }}>LOG OUT</button></aside></div></main>
}

function toDraft(row: Guardrail): GuardrailDraft {
  return { ...row, primary_api_key: '', secondary_api_key: '' }
}

type EventSettings = { status: string; logins_disabled: boolean; start_time: string | null; end_time: string | null }
type TeamRow = { id: string; username: string; total_score: number; last_heartbeat: string | null; is_active: boolean; easy_guess_used: boolean; medium_guess_used: boolean; hard_guess_used: boolean }
type SecretRow = { user_id: string; username: string; level_id: number; target_secret: string }
type ClearedChatRow = ArchivedChatMessage

function AdminPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [guardrails, setGuardrails] = useState<GuardrailDraft[]>([])
  const [openLevel, setOpenLevel] = useState(1)
  const [loading, setLoading] = useState(true)
  const [savingLevel, setSavingLevel] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [event, setEvent] = useState<EventSettings | null>(null)
  const [duration, setDuration] = useState(60)
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [secrets, setSecrets] = useState<SecretRow[]>([])
  const [bulkSecret, setBulkSecret] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [teamEmail, setTeamEmail] = useState(''); const [teamPassword, setTeamPassword] = useState(''); const [teamName, setTeamName] = useState('')
  const [activeAdminTab, setActiveAdminTab] = useState<'event' | 'teams' | 'secrets' | 'history' | 'guardrails'>('event')
  const [clearedChats, setClearedChats] = useState<ClearedChatRow[]>([])
  const [openHistoryTeams, setOpenHistoryTeams] = useState<Set<string>>(new Set())
  const [openHistoryLevels, setOpenHistoryLevels] = useState<Set<string>>(new Set())

  async function loadGuardrails() {
    setLoading(true)
    const { data, error: loadError } = await supabase.rpc('get_guardrails_admin')
    if (loadError) setError('Unable to load guardrail settings.')
    else setGuardrails(((data ?? []) as Guardrail[]).map(toDraft))
    setLoading(false)
  }

  async function loadAdminData() {
    const [eventResult, teamsResult, secretsResult, clearedChatsResult] = await Promise.all([
      supabase.rpc('get_event_settings'), supabase.rpc('admin_list_teams'), supabase.rpc('admin_list_team_secrets'), supabase.rpc('admin_list_cleared_chat_history'),
    ])
    if (!eventResult.error) setEvent((eventResult.data?.[0] ?? null) as EventSettings | null)
    if (!teamsResult.error) setTeams((teamsResult.data ?? []) as TeamRow[])
    if (!secretsResult.error) setSecrets((secretsResult.data ?? []) as SecretRow[])
    if (!clearedChatsResult.error) { setClearedChats((clearedChatsResult.data ?? []) as ClearedChatRow[]); setOpenHistoryTeams(new Set()); setOpenHistoryLevels(new Set()) }
  }

  useEffect(() => {
    if (profile?.is_admin) { void loadGuardrails(); void loadAdminData() }
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
      p_system_prompt_2: draft.system_prompt_2,
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

  async function startEvent() {
    const { error: startError } = await supabase.rpc('start_event', { p_duration_minutes: duration })
    if (startError) setError('Unable to start event.')
    else { toast.success('Event started.'); await loadAdminData() }
  }

  async function stopEvent() {
    const { error: stopError } = await supabase.rpc('stop_event')
    if (stopError) setError('Unable to stop event.')
    else { toast.success('Event stopped and teams logged out.'); await loadAdminData() }
  }

  async function toggleLogins(disabled: boolean) {
    const { error: lockError } = await supabase.rpc('set_login_lock', { p_disabled: disabled })
    if (lockError) setError('Unable to update login lock.')
    else await loadAdminData()
  }

  async function saveSecret(secret: SecretRow) {
    if (!secret.target_secret.trim()) return setError('A team secret cannot be empty.')
    const { error: saveError } = await supabase.rpc('save_team_secret', { p_user_id: secret.user_id, p_level_id: secret.level_id, p_target_secret: secret.target_secret })
    if (saveError) setError(`Unable to save ${secret.username} Level ${secret.level_id}.`)
    else toast.success(`Saved ${secret.username} Level ${secret.level_id}.`)
  }
  async function saveBulkSecret(event: FormEvent) {
    event.preventDefault()
    const value = bulkSecret.trim()
    if (!value) return setError('Enter a word before applying it to all teams.')
    if (!window.confirm('Replace every team target for Levels 1, 2, and 3 with this word?')) return
    setError('')
    setBulkSaving(true)
    const { data, error: saveError } = await supabase.rpc('set_all_team_secrets', { p_target_secret: value })
    setBulkSaving(false)
    if (saveError) { setError('Unable to apply the shared word to all teams.'); return }
    setBulkSecret('')
    toast.success(`Applied the shared word to ${Number(data ?? 0)} team-level targets.`)
    await loadAdminData()
  }
  async function createTeam(event: FormEvent) { event.preventDefault(); setError(''); const name = teamName.trim(); const { data, error: createError } = await supabase.functions.invoke('admin-create-team', { body: { email: teamEmail, password: teamPassword, username: name } }); if (createError || data?.error) { setError(data?.error ?? 'Unable to create team.'); return } toast.success(`Team ${name} created.`); setTeamEmail(''); setTeamPassword(''); setTeamName(''); await loadAdminData() }

  return <main data-testid="admin-page" className="arena-shell admin-shell">
    <header className="arena-header"><div><div className="arena-logo display-font">AI Battle <strong>Arena</strong></div><span className="label accent-label">ADMIN CONTROL</span></div><button data-testid="admin-logout" className="outline-button" onClick={async () => { await signOut(); navigate('/login') }}>LOG OUT</button></header>
    <section className="admin-content"><div className="admin-heading"><div><p className="label accent-label">ROUND SETTINGS</p><h1 className="display-font">Control room.</h1><p className="muted">Manage the event, teams, secrets, and level guardrails. Sensitive values stay server-side.</p></div><span className="admin-badge">{profile.username}</span></div>
      {error && <p className="error-banner admin-error" role="alert">{error}</p>}<nav className="admin-tabs" aria-label="Admin sections">{[['event','EVENT'],['teams','TEAMS'],['secrets','SECRETS'],['history','CLEARED HISTORY'],['guardrails','GUARDRAILS']].map(([id,label]) => <button data-testid={`admin-tab-${id}`} key={id} className={`admin-tab ${activeAdminTab === id ? 'active' : ''}`} onClick={() => setActiveAdminTab(id as typeof activeAdminTab)}>{label}</button>)}</nav>
      <section data-testid="admin-event-panel" className="admin-control-card" style={{ display: activeAdminTab === 'event' ? 'block' : 'none' }}><div className="admin-card-heading"><div><span className="label accent-label">EVENT CONTROL</span><h2 className="display-font">{event?.status ?? 'loading'}</h2></div><span className={`status-pill ${event?.status ?? ''}`}>{event?.logins_disabled ? 'LOGINS LOCKED' : 'LOGINS OPEN'}</span></div><div className="event-actions"><label>Duration (minutes)<input data-testid="event-duration" type="number" min="1" max="480" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label><button data-testid="start-event" className="arena-button" onClick={() => void startEvent()}>START EVENT</button><button data-testid="stop-event" className="outline-button" onClick={() => void stopEvent()}>STOP EVENT</button><button data-testid="toggle-logins" className="outline-button" onClick={() => void toggleLogins(!(event?.logins_disabled ?? false))}>{event?.logins_disabled ? 'ENABLE LOGINS' : 'DISABLE LOGINS'}</button></div><p className="muted">{event?.end_time ? `Ends ${new Date(event.end_time).toLocaleString()}` : 'The event is not running.'}</p></section>
      <section data-testid="admin-teams-panel" className="admin-control-card" style={{ display: activeAdminTab === 'teams' ? 'block' : 'none' }}><div className="admin-card-heading"><div><span className="label accent-label">TEAM SESSIONS</span><h2 className="display-font">{teams.length} teams</h2></div><div><button data-testid="refresh-teams" className="outline-button" onClick={() => void loadAdminData()}>REFRESH</button> <button data-testid="force-logout-all" className="outline-button" onClick={async () => { await supabase.rpc('force_logout_all_teams'); toast.success('All teams logged out.'); await loadAdminData() }}>FORCE LOGOUT ALL</button></div></div><div className="team-table">{teams.length === 0 ? <p className="muted">No team accounts yet.</p> : teams.map((team) => <div className="team-row" data-testid={`team-row-${team.username}`} key={team.id}><strong>{team.username}</strong><span>{team.is_active ? '● ACTIVE' : '○ OFFLINE'}</span><span>{team.total_score} pts</span><span title="Guess usage">E {team.easy_guess_used ? 'used' : 'open'} · M {team.medium_guess_used ? 'used' : 'open'} · H {team.hard_guess_used ? 'used' : 'open'}</span><button data-testid={`force-logout-${team.username}`} className="text-button" onClick={async () => { await supabase.rpc('force_logout_team', { p_user_id: team.id }); await loadAdminData() }}>FORCE LOGOUT</button></div>)}</div></section>
      <section data-testid="admin-team-registration" className="admin-control-card team-registration-card" style={{ display: activeAdminTab === 'teams' ? 'block' : 'none' }}><div className="admin-card-heading"><div><span className="label accent-label">TEAM REGISTRATION</span><h2 className="display-font">Register a new team</h2><p className="muted">Only an administrator can create team accounts. Teams cannot register themselves.</p></div><span className="admin-badge">ADMIN ONLY</span></div><form className="settings-grid" onSubmit={createTeam}><label>Email<input data-testid="team-email" type="email" autoComplete="off" value={teamEmail} onChange={(e) => setTeamEmail(e.target.value)} required /></label><label>Password<input data-testid="team-password" type="password" autoComplete="new-password" minLength={8} value={teamPassword} onChange={(e) => setTeamPassword(e.target.value)} required /></label><label>Team name<input data-testid="team-name-input" autoComplete="off" value={teamName} onChange={(e) => setTeamName(e.target.value)} required /></label><button data-testid="create-team" className="arena-button" type="submit">REGISTER NEW TEAM</button></form></section>
      <section data-testid="admin-secrets-panel" className="admin-control-card" style={{ display: activeAdminTab === 'secrets' ? 'block' : 'none' }}><div className="admin-card-heading"><div><span className="label accent-label">TEAM SECRETS</span><h2 className="display-font">Target vault</h2></div></div><p className="muted">Secrets are never sent to participants. Save each team and level separately.</p><form data-testid="bulk-secret-form" className="bulk-secret-form" onSubmit={saveBulkSecret}><label>Same word for every team · Levels 1, 2, and 3<small>This replaces all existing team targets.</small><div className="bulk-secret-controls"><input data-testid="bulk-secret-input" type="text" maxLength={500} value={bulkSecret} onChange={(event) => setBulkSecret(event.target.value)} placeholder="Enter shared target word" /><button data-testid="bulk-secret-save" className="arena-button" type="submit" disabled={bulkSaving}>{bulkSaving ? 'APPLYING…' : 'APPLY TO ALL TEAMS'}</button></div></label></form><div className="secret-table">{secrets.length === 0 ? <p className="muted">No teams to configure.</p> : secrets.map((secret) => <div className="secret-row" data-testid={`secret-row-${secret.username}-${secret.level_id}`} key={`${secret.user_id}-${secret.level_id}`}><strong>{secret.username} · L{secret.level_id}</strong><input data-testid={`secret-input-${secret.username}-${secret.level_id}`} type="text" value={secret.target_secret} onChange={(e) => setSecrets((current) => current.map((item) => item.user_id === secret.user_id && item.level_id === secret.level_id ? { ...item, target_secret: e.target.value } : item))} /><button data-testid={`secret-save-${secret.username}-${secret.level_id}`} className="outline-button" onClick={() => void saveSecret(secret)}>SAVE</button></div>)}</div></section>
      <section data-testid="admin-history-panel" className="admin-control-card" style={{ display: activeAdminTab === 'history' ? 'block' : 'none' }}><div className="admin-card-heading"><div><span className="label accent-label">CLEARED CHAT HISTORY</span><h2 className="display-font">Archived conversations</h2></div><button data-testid="refresh-cleared-history" className="outline-button" onClick={() => void loadAdminData()}>REFRESH</button></div><p className="muted">Cleared participant chats remain available to administrators for review.</p><div className="chat-archive-list">{clearedChats.length === 0 ? <p className="muted">No cleared chat history.</p> : groupArchivedChats(clearedChats).map((team) => { const teamOpen = openHistoryTeams.has(team.username); return <article className={`chat-archive-team ${teamOpen ? 'open' : ''}`} data-testid={`cleared-team-${team.username}`} key={team.username}><button type="button" className="chat-archive-team-toggle" aria-expanded={teamOpen} data-testid={`cleared-team-toggle-${team.username}`} onClick={() => setOpenHistoryTeams((current) => { const next = new Set(current); if (next.has(team.username)) next.delete(team.username); else next.add(team.username); return next })}><span><strong>{team.username}</strong><small>{team.messageCount} archived {team.messageCount === 1 ? 'message' : 'messages'}</small></span><b aria-hidden="true">{teamOpen ? '−' : '+'}</b></button>{teamOpen && <div className="chat-archive-levels">{team.levels.map((level) => { const levelKey = `${team.username}-${level.levelId}`; const levelOpen = openHistoryLevels.has(levelKey); return <div className={`chat-archive-level ${levelOpen ? 'open' : ''}`} data-testid={`cleared-level-${team.username}-${level.levelId}`} key={levelKey}><button type="button" className="chat-archive-level-toggle" aria-expanded={levelOpen} data-testid={`cleared-level-toggle-${team.username}-${level.levelId}`} onClick={() => setOpenHistoryLevels((current) => { const next = new Set(current); if (next.has(levelKey)) next.delete(levelKey); else next.add(levelKey); return next })}><span><strong>Level {level.levelId}</strong><small>{level.messageCount} {level.messageCount === 1 ? 'message' : 'messages'}</small></span><b aria-hidden="true">{levelOpen ? '−' : '+'}</b></button>{levelOpen && <div className="chat-archive-messages">{level.messages.map((chat) => <article className={`chat-archive-row ${chat.role}`} data-testid={`cleared-chat-${chat.id}`} key={chat.id}><div><strong>{chat.role === 'user' ? 'PROMPT' : 'WARDEN'}</strong><small>Sent {new Date(chat.created_at).toLocaleString()} · Cleared {new Date(chat.deleted_at).toLocaleString()}</small></div><p>{chat.content}</p></article>)}</div>}</div>})}</div>}</article> })}</div></section>
      <div className="admin-section-title" style={{ display: activeAdminTab === 'guardrails' ? 'block' : 'none' }}><span className="label accent-label">LEVEL GUARDRAILS</span></div>
      {loading ? <p className="muted" role="status" style={{ display: activeAdminTab === 'guardrails' ? 'block' : 'none' }}>Loading level settings…</p> : <div className="guardrail-list" style={{ display: activeAdminTab === 'guardrails' ? 'grid' : 'none' }}>{guardrails.map((draft) => <article className={`guardrail-card ${openLevel === draft.level_id ? 'open' : ''}`} key={draft.level_id}>
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
          <label>Character gap (ms)<small>Time between each printed character</small><input type="number" min="10" max="2000" value={draft.stream_delay_ms} onChange={(event) => updateDraft(draft.level_id, 'stream_delay_ms', Number(event.target.value))} /></label>
          <label className="range-field">Temperature <output>{draft.temperature.toFixed(1)}</output><input type="range" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => updateDraft(draft.level_id, 'temperature', Number(event.target.value))} /></label>
        </div><label>System Prompt #1 <small>Use the literal placeholder {'{{SECRET}}'} for the team target.</small><textarea rows={6} value={draft.system_prompt} onChange={(event) => updateDraft(draft.level_id, 'system_prompt', event.target.value)} /></label><label>System Prompt #2 <small>Forbidden-word injection rules, sent after Prompt #1.</small><textarea rows={6} value={draft.system_prompt_2} onChange={(event) => updateDraft(draft.level_id, 'system_prompt_2', event.target.value)} /></label><div className="guardrail-actions"><span className="muted">Changes apply to the next request.</span><button className="arena-button" onClick={() => void saveDraft(draft)} disabled={savingLevel === draft.level_id}>{savingLevel === draft.level_id ? 'SAVING…' : 'SAVE LEVEL'}</button></div></div>}
      </article>)}</div>}
    </section><Toaster position="top-center" theme="dark" />
  </main>
}
function AppRoutes() { return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<ProtectedRoute><ArenaPage /></ProtectedRoute>} /><Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes> }
export default function App() { return <AuthProvider><AppRoutes /></AuthProvider> }









