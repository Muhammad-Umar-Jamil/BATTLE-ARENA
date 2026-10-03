import { describe, expect, it } from 'vitest'
import { parseChatStreamLine } from './chat-stream'

describe('chat stream protocol', () => {
  it('parses metadata, chunks, and completion', () => {
    expect(parseChatStreamLine('{"type":"meta","stream_delay_ms":40,"fallback_used":false}')).toEqual({ type: 'meta', stream_delay_ms: 40, fallback_used: false })
    expect(parseChatStreamLine('{"type":"chunk","content":"Hi"}')).toEqual({ type: 'chunk', content: 'Hi' })
    expect(parseChatStreamLine('{"type":"done"}')).toEqual({ type: 'done' })
  })

  it('ignores blank or malformed lines', () => {
    expect(parseChatStreamLine('')).toBeNull()
    expect(parseChatStreamLine('not json')).toBeNull()
  })
})
