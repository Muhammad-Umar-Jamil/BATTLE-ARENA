import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ChatBody = { level_id?: number; prompt?: string }
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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
  const { data: guardrail } = await client.from('guardrails').select('system_prompt,system_prompt_2,model_name,temperature,max_tokens,primary_endpoint,primary_api_key,timeout_seconds,secondary_endpoint,secondary_api_key').eq('level_id', levelId).maybeSingle()
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
  let answer = ''
  let fallbackUsed = false
  for (const [index, provider] of providers.entries()) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), guardrail.timeout_seconds * 1000)
    try {
      const response = await fetch(`${String(provider.endpoint).replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.key}` }, body: JSON.stringify({ model: guardrail.model_name, messages, temperature: guardrail.temperature, max_tokens: guardrail.max_tokens }) })
      if (response.ok) { const result = await response.json(); answer = result?.choices?.[0]?.message?.content ?? ''; if (answer) { fallbackUsed = index > 0; break } }
    } catch { /* try fallback */ } finally { clearTimeout(timeout) }
  }
  if (!answer) return json({ error: 'PROVIDER_UNAVAILABLE' }, 502)
  await client.from('chat_messages').insert([{ user_id: authData.user.id, level_id: levelId, role: 'user', content: prompt }, { user_id: authData.user.id, level_id: levelId, role: 'assistant', content: answer }])
  return json({ answer, fallback_used: fallbackUsed })
})
