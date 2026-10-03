export type Guardrail = {
  level_id: number
  system_prompt: string
  system_prompt_2: string
  model_name: string
  temperature: number
  max_tokens: number
  primary_endpoint: string | null
  primary_key_configured: boolean
  timeout_seconds: number
  secondary_endpoint: string | null
  secondary_key_configured: boolean
  stream_delay_ms: number
  max_points: number
  updated_at: string
}

export type GuardrailDraft = Omit<Guardrail, 'updated_at'> & {
  primary_api_key: string
  secondary_api_key: string
}

export function validateGuardrail(draft: GuardrailDraft): string | null {
  if (!draft.system_prompt.trim()) return 'System prompt is required.'
  if (!draft.system_prompt.includes('{{SECRET}}')) return 'System prompt must include {{SECRET}}.'
  if (!draft.model_name.trim()) return 'Model name is required.'
  if (draft.primary_endpoint && !draft.primary_endpoint.startsWith('https://')) return 'Primary endpoint must start with https://.'
  if (draft.secondary_endpoint && !draft.secondary_endpoint.startsWith('https://')) return 'Fallback endpoint must start with https://.'
  if (draft.temperature < 0 || draft.temperature > 2) return 'Temperature must be between 0 and 2.'
  if (draft.max_tokens < 1 || draft.max_tokens > 8192) return 'Max tokens must be between 1 and 8192.'
  if (draft.timeout_seconds < 5 || draft.timeout_seconds > 120) return 'Timeout must be between 5 and 120 seconds.'
  if (draft.stream_delay_ms < 10 || draft.stream_delay_ms > 2000) return 'Stream delay must be between 10 and 2000 milliseconds.'
  if (draft.max_points < 1 || draft.max_points > 1000) return 'Max points must be between 1 and 1000.'
  return null
}
