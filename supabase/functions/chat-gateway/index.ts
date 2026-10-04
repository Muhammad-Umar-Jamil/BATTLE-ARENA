import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ChatBody = { level_id?: number; prompt?: string }
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const streamHeaders = { ...cors, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' }
const encoder = new TextEncoder()

function providerText(payload: any) {
  return payload?.choices?.[0]?.delta?.content ?? payload?.choices?.[0]?.message?.content ?? ''
}

async function readProvider(response: Response, emit: (event: unknown) => void) {
  const contentType = response.headers.get('content-type') ?? ''
  let answer = ''
  if (contentType.includes('text/event-stream') && response.body) {
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
    const consume = (line: string) => {
      const value = line.trim()
      if (!value.startsWith('data:')) return
      const data = value.slice(5).trim()
      if (!data || data === '[DONE]') return
      try { const text = String(providerText(JSON.parse(data))); if (text) { answer += text; emit({ type: 'chunk', content: text }) } } catch { /* ignore keep-alive or malformed provider lines */ }
    }
    while (true) {
      const next = await reader.read(); if (next.done) break
      buffer += decoder.decode(next.value, { stream: true })
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? ''
      for (const line of lines) consume(line)
    }
    consume(buffer)
  } else {
    const payload = await response.json(); const text = String(providerText(payload))
    if (text) { answer = text; emit({ type: 'chunk', content: text }) }
  }
  return answer
}

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
  const { data: existingSubmission } = await client.from('submissions').select('id').eq('user_id', authData.user.id).eq('level_id', levelId).maybeSingle()
  if (existingSubmission) return json({ error: 'LEVEL_LOCKED' }, 409)
  // Read the delay for every request so an admin change applies to the next
  // prompt without rebuilding or redeploying the browser application.
  const { data: guardrail } = await client.from('guardrails').select('system_prompt,system_prompt_2,model_name,temperature,max_tokens,primary_endpoint,primary_api_key,timeout_seconds,secondary_endpoint,secondary_api_key,stream_delay_ms').eq('level_id', levelId).maybeSingle()
  const { data: secret } = await client.from('team_secrets').select('target_secret').eq('user_id', authData.user.id).eq('level_id', levelId).maybeSingle()
  if (!guardrail || !secret?.target_secret) return json({ error: 'TARGET_NOT_CONFIGURED' }, 409)
  const { data: history } = await client.from('chat_messages').select('role,content').eq('user_id', authData.user.id).eq('level_id', levelId).is('deleted_at', null).order('created_at', { ascending: true }).limit(40)
  const messages = [
    { role: 'system', content: guardrail.system_prompt.replaceAll('{{SECRET}}', secret.target_secret) },
    { role: 'system', content: guardrail.system_prompt_2.replaceAll('{{SECRET}}', secret.target_secret) },
    ...(history ?? []),
    { role: 'user', content: prompt },
  ]
  const providers = [
    { endpoint: guardrail.primary_endpoint, key: guardrail.primary_api_key },
    { endpoint: guardrail.secondary_endpoint, key: guardrail.secondary_api_key },
  ].filter((provider) => provider.endpoint && provider.key)
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      void (async () => {
        let answer = ''
        let fallbackUsed = false
        for (const [index, provider] of providers.entries()) {
          const requestController = new AbortController(); const timeout = setTimeout(() => requestController.abort(), guardrail.timeout_seconds * 1000)
          try {
            const response = await fetch(`${String(provider.endpoint).replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: requestController.signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json', Authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ model: guardrail.model_name, messages, temperature: guardrail.temperature, max_tokens: guardrail.max_tokens, stream: true }) })
            if (response.ok) {
              emit({ type: 'meta', stream_delay_ms: Math.max(10, Math.min(2000, Number(guardrail.stream_delay_ms) || 50)), fallback_used: index > 0 })
              answer = await readProvider(response, emit)
              if (answer) { fallbackUsed = index > 0; break }
            }
          } catch { /* try fallback */ } finally { clearTimeout(timeout) }
        }
        if (!answer) { emit({ type: 'error', error: 'PROVIDER_UNAVAILABLE' }); controller.close(); return }
        await client.from('chat_messages').insert([{ user_id: authData.user.id, level_id: levelId, role: 'user', content: prompt }, { user_id: authData.user.id, level_id: levelId, role: 'assistant', content: answer }])
        emit({ type: 'done', fallback_used: fallbackUsed }); controller.close()
      })().catch(() => { emit({ type: 'error', error: 'PROVIDER_UNAVAILABLE' }); controller.close() })
    },
  })
  return new Response(stream, { headers: streamHeaders })
})
