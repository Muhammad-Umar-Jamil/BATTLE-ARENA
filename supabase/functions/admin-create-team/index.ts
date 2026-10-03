import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const authHeader = req.headers.get('Authorization'); if (!authHeader?.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401)
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const token = authHeader.slice(7); const { data: authData, error } = await client.auth.getUser(token); if (error || !authData.user) return json({ error: 'UNAUTHORIZED' }, 401)
  const { data: admin } = await client.from('profiles').select('is_admin').eq('id', authData.user.id).maybeSingle(); if (!admin?.is_admin) return json({ error: 'ADMIN_REQUIRED' }, 403)
  let body: { email?: string; password?: string; username?: string }; try { body = await req.json() } catch { return json({ error: 'INVALID_JSON' }, 400) }
  const email = body.email?.trim().toLowerCase(); const password = body.password ?? ''; const username = body.username?.trim()
  if (!email || !email.includes('@') || password.length < 8 || !username || username.length > 80) return json({ error: 'INVALID_ACCOUNT' }, 400)
  const { data: created, error: createError } = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } })
  if (createError || !created.user) return json({ error: 'ACCOUNT_CREATION_FAILED' }, 400)
  return json({ id: created.user.id, username })
})
