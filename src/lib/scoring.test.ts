import { describe, expect, it } from 'vitest'
import { calculateScore } from './scoring'

describe('time-based scoring', () => {
  it('adds base score plus 0.2 times minutes left times base score', () => {
    expect(calculateScore(100, 100, 10)).toEqual({ similarityScore: 100, basePoints: 100, timeLeftMinutes: 10, timeBonus: 200, awardedPoints: 300 })
  })

  it('gives no time bonus after the event ends', () => {
    expect(calculateScore(100, 100, 0).awardedPoints).toBe(100)
  })
})
