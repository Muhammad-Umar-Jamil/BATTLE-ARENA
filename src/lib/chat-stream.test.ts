import { describe, expect, it } from 'vitest'
import { parseChatStreamLine, readChatStream, type ChatStreamEvent } from './chat-stream'

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

  it('delivers split UTF-8 lines before the stream finishes', async () => {
    const bytes = new TextEncoder().encode('{"type":"meta","stream_delay_ms":40,"fallback_used":false}\n{"type":"chunk","content":"😀"}\n{"type":"done"}\n')
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    const events: ChatStreamEvent[] = []
    const reading = readChatStream(stream, (event) => events.push(event))
    const split = bytes.indexOf(0xf0) + 2
    controller.enqueue(bytes.slice(0, 25))
    controller.enqueue(bytes.slice(25, split))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events.map((event) => event.type)).toEqual(['meta'])
    controller.enqueue(bytes.slice(split))
    controller.close()
    await reading
    expect(events[1]).toEqual({ type: 'chunk', content: '😀' })
    expect(events[2]).toEqual({ type: 'done' })
  })

  it('reports a provider error and an unfinished stream', async () => {
    const stream = (line: string) => new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(line)); controller.close() },
    })
    await expect(readChatStream(stream('{"type":"error","error":"Provider failed"}\n'), () => {})).rejects.toThrow('Provider failed')
    await expect(readChatStream(stream('{"type":"chunk","content":"partial"}\n'), () => {})).rejects.toThrow('ended before')
  })
})
