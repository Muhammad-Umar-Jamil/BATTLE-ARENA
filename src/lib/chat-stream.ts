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

export async function readChatStream(stream: ReadableStream<Uint8Array>, onEvent: (event: ChatStreamEvent) => void): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  const consume = (line: string) => {
    if (!line.trim()) return
    const event = parseChatStreamLine(line)
    if (!event) throw new Error('The chat stream contained an invalid event.')
    if (event.type === 'error') throw new Error(event.error)
    if (completed) throw new Error('The chat stream continued after completion.')
    onEvent(event)
    if (event.type === 'done') completed = true
  }
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      buffer += decoder.decode(next.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) consume(line)
    }
    buffer += decoder.decode()
    if (buffer) consume(buffer)
    if (!completed) throw new Error('The chat stream ended before the answer completed.')
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
}
