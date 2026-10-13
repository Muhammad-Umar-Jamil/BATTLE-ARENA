export class ProviderFailure extends Error {
  reason: string
  status?: number
  constructor(reason: string, status?: number) { super(reason); this.reason = reason; this.status = status }
}

/** Forward only answer text. Provider error bodies may contain secrets. */
export async function readProvider(response: Response, emit: (text: string) => void): Promise<string> {
  let answer = ''
  const consumePayload = (payload: { error?: unknown; choices?: { delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: unknown }[] }) => {
    if (payload?.error) throw new ProviderFailure('PROVIDER_ERROR')
    const choice = payload?.choices?.[0]
    const content = choice?.delta?.content ?? choice?.message?.content
    if (typeof content === 'string' && content) { answer += content; emit(content) }
    return choice?.finish_reason != null
  }
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream') && response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let completed = false
    const consume = (line: string) => {
      const value = line.trim()
      if (!value.startsWith('data:')) return
      const data = value.slice(5).trim()
      if (!data) return
      if (data === '[DONE]') { completed = true; return }
      let payload
      try { payload = JSON.parse(data) } catch { throw new ProviderFailure('INVALID_RESPONSE') }
      completed = consumePayload(payload) || completed
    }
    try {
      while (!completed) {
        const next = await reader.read()
        if (next.done) break
        buffer += decoder.decode(next.value, { stream: true })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) { consume(line); if (completed) break }
      }
      if (!completed) { buffer += decoder.decode(); if (buffer) consume(buffer) }
      if (!completed) throw new ProviderFailure('INCOMPLETE_RESPONSE')
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
  } else {
    let payload
    try { payload = await response.json() } catch { throw new ProviderFailure('INVALID_RESPONSE') }
    consumePayload(payload)
  }
  if (!answer.trim()) throw new ProviderFailure('EMPTY_RESPONSE')
  return answer
}
