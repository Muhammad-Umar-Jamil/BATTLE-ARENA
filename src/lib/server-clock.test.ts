import { describe, expect, it } from 'vitest'
import { createServerClockAnchor, readServerClock, secondsRemaining } from './server-clock'

describe('server clock', () => {
  it('uses server time and compensates for half of the request delay', () => {
    const anchor = createServerClockAnchor('2026-10-13T10:00:00.000Z', 100, 500)
    expect(anchor).toEqual({ serverMs: Date.parse('2026-10-13T10:00:00.200Z'), monotonicMs: 500 })
  })

  it('advances from monotonic elapsed time without consulting the laptop wall clock', () => {
    const anchor = createServerClockAnchor('2026-10-13T10:00:00.000Z', 100, 100)
    expect(readServerClock(anchor, 5100)).toBe(Date.parse('2026-10-13T10:00:05.000Z'))
  })

  it('counts down to zero and never shows a negative duration', () => {
    const end = '2026-10-13T10:01:00.000Z'
    expect(secondsRemaining(end, Date.parse('2026-10-13T10:00:58.900Z'))).toBe(1)
    expect(secondsRemaining(end, Date.parse('2026-10-13T10:01:01.000Z'))).toBe(0)
  })
})
