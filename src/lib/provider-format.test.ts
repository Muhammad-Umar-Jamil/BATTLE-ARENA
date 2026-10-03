import { describe, expect, it } from 'vitest'

function supportsChatCompletions(model: string) {
  return model !== 'gpt-5.5-pro' && model !== 'gpt-5.2-pro-2025-12-11'
}

describe('Makerend chat provider compatibility', () => {
  it('rejects Responses-only models for the chat gateway', () => {
    expect(supportsChatCompletions('gpt-5.5-pro')).toBe(false)
    expect(supportsChatCompletions('gpt-5.2-pro-2025-12-11')).toBe(false)
  })

  it('accepts a model listed by Makerend for OpenAI Chat Completions', () => {
    expect(supportsChatCompletions('gpt-4.1-mini')).toBe(true)
  })
})
