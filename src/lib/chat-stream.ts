export type ChatStreamEvent =
  | { type: 'meta'; stream_delay_ms: number; fallback_used: boolean }
  | { type: 'chunk'; content: string }
  | { type: 'done'; fallback_used?: boolean }
  | { type: 'error'; error: string }

export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const event = JSON.parse(trimmed) as ChatStreamEvent
    if (event.type === 'meta' || event.type === 'chunk' || event.type === 'done' || event.type === 'error') return event
  } catch { /* incomplete or invalid line; caller can ignore it */ }
  return null
}
