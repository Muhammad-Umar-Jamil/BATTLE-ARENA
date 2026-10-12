import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401)
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: caller, error: authError } = await client.auth.getUser(auth.slice(7))
  if (authError || !caller.user) return json({ error: 'UNAUTHORIZED' }, 401)
  const { data: admin, error: adminError } = await client.from('profiles').select('is_admin').eq('id', caller.user.id).maybeSingle()
  if (adminError) return json({ error: 'ACCOUNT_LOOKUP_FAILED' }, 503)
  if (!admin?.is_admin) return json({ error: 'ADMIN_REQUIRED' }, 403)
  let body: unknown
  try { body = await req.json() } catch { return json({ error: 'INVALID_JSON' }, 400) }
  const id = body && typeof body === 'object' && 'team_id' in body ? body.team_id : null
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: 'INVALID_TEAM' }, 400)
  const { data: team, error: teamError } = await client.from('profiles').select('is_admin').eq('id', id).maybeSingle()
  if (teamError) return json({ error: 'ACCOUNT_LOOKUP_FAILED' }, 503)
  if (!team) return json({ error: 'TEAM_NOT_FOUND' }, 404)
  if (team.is_admin || id === caller.user.id) return json({ error: 'CANNOT_DELETE_ADMIN' }, 403)
  // Auth deletion cascades through profiles to active/archived chat, targets and guesses.
  const { error: deleteError } = await client.auth.admin.deleteUser(id)
  if (deleteError) return json({ error: 'TEAM_DELETION_FAILED' }, 500)
  return json({ deleted: true })
})
