-- Makerend gpt-5.5-pro is Responses-only. The gateway currently uses
-- OpenAI-compatible Chat Completions, so use a model that supports that format.
update public.guardrails
set model_name = 'gpt-4.1-mini'
where primary_endpoint = 'https://makerend.com/v1'
  and model_name = 'gpt-5.5-pro';
