-- Makerend is the default primary provider for every level.
-- The API key is intentionally excluded from migrations and is entered only
-- through the protected Supabase SQL editor / server-side configuration.
update public.guardrails
set primary_endpoint = 'https://makerend.com/v1',
    model_name = 'gpt-5.5-pro'
where level_id between 1 and 3;
