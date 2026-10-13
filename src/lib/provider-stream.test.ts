import { describe, expect, it } from 'vitest'
import { readProvider } from '../../supabase/functions/chat-gateway/provider-stream'

const sse = (text: string) => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
const chunk = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`

describe('provider response stream', () => {
  it('forwards split Unicode text before the provider finishes', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value } })
    const emitted: string[] = []
    const reading = readProvider(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), (text) => emitted.push(text))
    const bytes = new TextEncoder().encode(chunk('Hi😀'))
    const split = bytes.indexOf(0xf0) + 2
    controller.enqueue(bytes.slice(0, split))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted).toEqual([])
    controller.enqueue(bytes.slice(split))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted).toEqual(['Hi😀'])
    controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
    controller.close()
    await expect(reading).resolves.toBe('Hi😀')
  })

  it('accepts a finish reason without requiring a DONE event', async () => {
    await expect(readProvider(sse(chunk('OK') + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'), () => {})).resolves.toBe('OK')
  })

  it('rejects interrupted replies so they can be retried', async () => {
    await expect(readProvider(sse(chunk('partial')), () => {})).rejects.toMatchObject({ reason: 'INCOMPLETE_RESPONSE' })
  })

  it('rejects embedded errors without exposing provider error text', async () => {
    await expect(readProvider(sse('data: {"error":{"message":"sensitive provider text"}}\n\n'), () => {})).rejects.toMatchObject({ reason: 'PROVIDER_ERROR', message: 'PROVIDER_ERROR' })
  })

  it('rejects malformed and empty replies', async () => {
    await expect(readProvider(sse('data: broken\n\n'), () => {})).rejects.toMatchObject({ reason: 'INVALID_RESPONSE' })
    await expect(readProvider(sse('data: [DONE]\n\n'), () => {})).rejects.toMatchObject({ reason: 'EMPTY_RESPONSE' })
    await expect(readProvider(Response.json({ choices: [{ message: { content: ' ' } }] }), () => {})).rejects.toMatchObject({ reason: 'EMPTY_RESPONSE' })
  })

  it('accepts a non-streaming JSON answer from a compatible provider', async () => {
    const emitted: string[] = []
    await expect(readProvider(Response.json({ choices: [{ message: { content: 'OK' } }] }), (text) => emitted.push(text))).resolves.toBe('OK')
    expect(emitted).toEqual(['OK'])
  })
})
