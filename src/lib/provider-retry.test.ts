import { describe, expect, it } from 'vitest'
import { providerAttemptOrder } from '../../supabase/functions/chat-gateway/retry'

describe('provider retry order', () => {
  it('tries primary twice, fallback twice, then repeats', () => {
    expect(providerAttemptOrder(true, true, 8)).toEqual(['primary', 'primary', 'fallback', 'fallback', 'primary', 'primary', 'fallback', 'fallback'])
  })

  it('continues the same cycle beyond eight failures', () => {
    const cycle = providerAttemptOrder(true, true, 4)
    const attempts = Array.from({ length: 101 }, (_, index) => cycle[index % cycle.length])
    expect(attempts).toEqual(providerAttemptOrder(true, true, 101))
    expect(attempts.slice(8, 12)).toEqual(['primary', 'primary', 'fallback', 'fallback'])
    expect(attempts[100]).toBe('primary')
  })

  it('keeps retrying the only configured endpoint', () => {
    expect(providerAttemptOrder(true, false, 3)).toEqual(['primary', 'primary', 'primary'])
    expect(providerAttemptOrder(false, true, 3)).toEqual(['fallback', 'fallback', 'fallback'])
  })

  it('does not attempt when no provider is configured', () => {
    expect(providerAttemptOrder(false, false, 8)).toEqual([])
  })
})
