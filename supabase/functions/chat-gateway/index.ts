import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { providerAttemptOrder, type ProviderSlot } from './retry.ts'
import { readProvider, ProviderFailure } from './provider-stream.ts'

type ChatBody = { level_id?: number; prompt?: string }
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const streamHeaders = { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' }
const encoder = new TextEncoder()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(supabaseUrl, serviceKey, { global: { headers: { Authorization: authHeader } } })
  const client = createClient(supabaseUrl, serviceKey)
  const token = authHeader.slice('Bearer '.length)
  const { data: authData, error: authError } = await userClient.auth.getUser(token)
  if (authError || !authData.user) return json({ error: 'UNAUTHORIZED' }, 401)
  let body: ChatBody
  try { body = await req.json() } catch { return json({ error: 'INVALID_JSON' }, 400) }
  const levelId = Number(body.level_id)
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (![1, 2, 3].includes(levelId) || !prompt || prompt.length > 4000) return json({ error: 'INVALID_PROMPT' }, 400)
  const { data: profile } = await client.from('profiles').select('id,is_admin,active_session_id,last_heartbeat').eq('id', authData.user.id).maybeSingle()
  if (!profile) return json({ error: 'PROFILE_NOT_FOUND' }, 403)
  if (!profile.is_admin && (!profile.active_session_id || !profile.last_heartbeat || new Date(profile.last_heartbeat).getTime() <= Date.now() - 30000)) return json({ error: 'SESSION_EXPIRED' }, 403)
  const { data: event } = await client.from('event_settings').select('status,logins_disabled,end_time').eq('id', 1).maybeSingle()
  if (!profile.is_admin && (!event || event.status !== 'running' || event.logins_disabled || (event.end_time && new Date(event.end_time).getTime() <= Date.now()))) return json({ error: 'EVENT_NOT_RUNNING' }, 403)
  const { data: existingSubmission, error: submissionError } = await client.from('submissions').select('id').eq('user_id', authData.user.id).eq('level_id', levelId).maybeSingle()
  if (submissionError) return json({ error: 'SUBMISSION_CHECK_FAILED' }, 503)
  if (existingSubmission) return json({ error: 'LEVEL_LOCKED' }, 409)
  // Read the delay for every request so an admin change applies to the next
  // prompt without rebuilding or redeploying the browser application.
  const { data: guardrail, error: guardrailError } = await client.from('guardrails').select('system_prompt,system_prompt_2,model_name,temperature,max_tokens,primary_endpoint,primary_api_key,timeout_seconds,secondary_endpoint,secondary_api_key,stream_delay_ms').eq('level_id', levelId).maybeSingle()
  const { data: secret, error: secretError } = await client.from('team_secrets').select('target_secret').eq('user_id', authData.user.id).eq('level_id', levelId).maybeSingle()
  if (guardrailError || secretError) return json({ error: 'SETTINGS_LOOKUP_FAILED', message: 'Warden settings could not be loaded from the database.' }, 503)
  if (!guardrail || !secret?.target_secret) return json({ error: 'TARGET_NOT_CONFIGURED' }, 409)
  const { data: history, error: historyError } = await client.from('chat_messages').select('role,content').eq('user_id', authData.user.id).eq('level_id', levelId).is('deleted_at', null).order('created_at', { ascending: true }).limit(40)
  if (historyError) return json({ error: 'HISTORY_LOOKUP_FAILED', message: 'Chat history could not be loaded from the database.' }, 503)
  const messages = [
    { role: 'system', content: guardrail.system_prompt.replaceAll('{{SECRET}}', secret.target_secret) },
    { role: 'system', content: guardrail.system_prompt_2.replaceAll('{{SECRET}}', secret.target_secret) },
    ...(history ?? []),
    { role: 'user', content: prompt },
  ]
  const providers: Record<ProviderSlot, { endpoint: string; key: string } | null> = {
    primary: guardrail.primary_endpoint && guardrail.primary_api_key ? { endpoint: guardrail.primary_endpoint, key: guardrail.primary_api_key } : null,
    fallback: guardrail.secondary_endpoint && guardrail.secondary_api_key ? { endpoint: guardrail.secondary_endpoint, key: guardrail.secondary_api_key } : null,
  }
  // The request keeps cycling until a configured provider returns a usable
  // answer. The four-slot cycle is primary twice, fallback twice, then repeat.
  const attempts = providerAttemptOrder(Boolean(providers.primary), Boolean(providers.fallback), 4)
  if (attempts.length === 0) return json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'The Warden is unavailable because no AI provider is configured.' }, 409)
  let stopped = false
  let activeRequest: AbortController | null = null
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const stop = () => { stopped = true; activeRequest?.abort(); clearInterval(heartbeat) }
  req.signal.addEventListener('abort', stop, { once: true })
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: unknown) => { if (!stopped) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)) }
      heartbeat = setInterval(() => emit({ type: 'ping' }), 5000)
      void (async () => {
        let answer = ''
        let selectedSlot: ProviderSlot | null = null
        let attemptCount = 0
        emit({ type: 'meta', stream_delay_ms: Math.max(10, Math.min(2000, Number(guardrail.stream_delay_ms) || 50)), fallback_used: false })
        while (!answer && !stopped) {
          const slot = attempts[attemptCount % attempts.length]
          attemptCount += 1
          const provider = providers[slot]
          if (!provider) continue
          const requestController = new AbortController()
          activeRequest = requestController
          const timeout = setTimeout(() => requestController.abort(), guardrail.timeout_seconds * 1000)
          let receivedText = false
          try {
            const response = await fetch(`${String(provider.endpoint).replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: requestController.signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', Authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ model: guardrail.model_name, messages, temperature: guardrail.temperature, max_tokens: guardrail.max_tokens, stream: true }) })
            if (!response.ok) {
              await response.body?.cancel().catch(() => undefined)
              throw new ProviderFailure('HTTP_ERROR', response.status)
            }
            answer = await readProvider(response, (content) => { receivedText = true; emit({ type: 'chunk', content }) })
            selectedSlot = slot
          } catch (error) {
            if (stopped) return
            const reason = requestController.signal.aborted ? 'TIMEOUT' : error instanceof ProviderFailure ? error.reason : 'CONNECTION_ERROR'
            const status = error instanceof ProviderFailure ? error.status : undefined
            // Only safe failure categories are logged; never provider bodies or prompts.
            console.warn(JSON.stringify({ event: 'provider_retry', provider: slot, attempt: attemptCount, reason, status }))
            if (receivedText) emit({ type: 'reset' })
            emit({ type: 'retry', provider: slot, attempt: attemptCount, reason, status })
          } finally { clearTimeout(timeout); activeRequest = null }
          if (!answer && !stopped) await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        if (stopped) return
        const { error: saveError } = await client.from('chat_messages').insert([{ user_id: authData.user.id, level_id: levelId, role: 'user', content: prompt }, { user_id: authData.user.id, level_id: levelId, role: 'assistant', content: answer }])
        if (saveError) { emit({ type: 'error', error: 'CHAT_SAVE_FAILED', message: 'The AI answered, but the database could not save this conversation. The displayed answer is not saved.' }); return }
        emit({ type: 'done', fallback_used: selectedSlot === 'fallback', provider: selectedSlot })
      })().catch(() => { if (!stopped) emit({ type: 'error', error: 'GATEWAY_FAILED', message: 'The chat server failed while processing this request. This does not confirm an AI provider failure.' }) })
        .finally(() => { clearInterval(heartbeat); req.signal.removeEventListener('abort', stop); stopped = true; try { controller.close() } catch { /* cancelled */ } })
    },
    cancel() { stop(); req.signal.removeEventListener('abort', stop) },
  })
  return new Response(stream, { headers: streamHeaders })
})
