import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
function normalize(value: string) { return value.toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ') }
function similarity(a: string, b: string) { const left=normalize(a),right=normalize(b); if(left===right)return 100; if(!left||!right)return 0; const m=Array.from({length:left.length+1},(_,i)=>Array.from({length:right.length+1},(_,j)=>i===0?j:j===0?i:0)); for(let i=1;i<=left.length;i++)for(let j=1;j<=right.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(left[i-1]===right[j-1]?0:1)); return Math.max(0,Math.round((1-m[left.length][right.length]/Math.max(left.length,right.length))*100)) }
Deno.serve(async (req) => {
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors}); if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405)
 const auth=req.headers.get('Authorization'); if(!auth?.startsWith('Bearer '))return json({error:'UNAUTHORIZED'},401)
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; const userClient=createClient(url,key,{global:{headers:{Authorization:auth}}}); const client=createClient(url,key); const {data:who,error:ae}=await userClient.auth.getUser(auth.slice(7)); if(ae||!who.user)return json({error:'UNAUTHORIZED'},401)
 let body:{level_id?:number;submitted_word?:string}; try{body=await req.json()}catch{return json({error:'INVALID_JSON'},400)}; const levelId=Number(body.level_id),word=typeof body.submitted_word==='string'?body.submitted_word.trim():''; if(![1,2,3].includes(levelId)||!word||word.length>500)return json({error:'INVALID_SUBMISSION'},400)
 const {data:profile}=await client.from('profiles').select('is_admin,active_session_id,last_heartbeat').eq('id',who.user.id).maybeSingle(); if(!profile||(!profile.is_admin&&(!profile.active_session_id||!profile.last_heartbeat||new Date(profile.last_heartbeat).getTime()<=Date.now()-30000)))return json({error:'SESSION_EXPIRED'},403)
 const {data:event}=await client.from('event_settings').select('status,logins_disabled,end_time').eq('id',1).maybeSingle(); if(!profile.is_admin&&(!event||event.status!=='running'||event.logins_disabled||(event.end_time&&new Date(event.end_time).getTime()<=Date.now())))return json({error:'EVENT_NOT_RUNNING'},403)
 const [{data:secret},{data:guardrail}]=await Promise.all([client.from('team_secrets').select('target_secret').eq('user_id',who.user.id).eq('level_id',levelId).maybeSingle(),client.from('guardrails').select('max_points').eq('level_id',levelId).maybeSingle()]); if(!secret?.target_secret||!guardrail)return json({error:'TARGET_NOT_CONFIGURED'},409)
 const {data:existing,error:existingError}=await client.from('submissions').select('id').eq('user_id',who.user.id).eq('level_id',levelId).maybeSingle();
 if(existingError)return json({error:'SCORING_UNAVAILABLE'},503)
 if(existing)return json({error:'GUESS_ALREADY_USED',message:'You have already used your guess for this difficulty.'},409)
 const score=similarity(secret.target_secret,word),points=Math.round(score/100*guardrail.max_points); const {data:result,error}=await userClient.rpc('record_submission',{p_level_id:levelId,p_submitted_word:word,p_similarity_score:score,p_awarded_points:points});
 if(error){
   if(error.code==='23505'||error.message?.includes('GUESS_ALREADY_USED')) return json({error:'GUESS_ALREADY_USED',message:'You have already used your guess for this difficulty.'},409)
   return json({error:'SCORING_FAILED'},500)
 }
 return json(result?.[0]??result)
})
