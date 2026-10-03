import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to clean staging E2E data.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)
const { data: teams, error } = await supabase.from('profiles').select('id').like('username', 'E2E-%').eq('is_admin', false)
if (error) throw error
for (const team of teams ?? []) {
  const { error: deleteError } = await supabase.auth.admin.deleteUser(team.id)
  if (deleteError) throw deleteError
}
console.log(`Deleted ${teams?.length ?? 0} E2E team accounts.`)
