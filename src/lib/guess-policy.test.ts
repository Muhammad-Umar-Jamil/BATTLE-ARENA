import { describe, expect, it } from 'vitest'
import { guessLabel, isGuessUsable } from './guess-policy'

describe('one guess per difficulty UI policy', () => {
  it('allows one non-empty guess for an unused difficulty', () => {
    expect(isGuessUsable({}, 1, 'Alpha', true)).toBe(true)
    expect(guessLabel({}, 1)).toBe('1 GUESS REMAINING')
  })

  it('disables a difficulty after its accepted attempt is recorded', () => {
    const state = { 1: true }
    expect(isGuessUsable(state, 1, 'Another guess', true)).toBe(false)
    expect(guessLabel(state, 1)).toBe('GUESS USED')
  })

  it('keeps other difficulties independent', () => {
    const state = { 1: true }
    expect(isGuessUsable(state, 2, 'Medium guess', true)).toBe(true)
    expect(isGuessUsable(state, 3, 'Hard guess', true)).toBe(true)
  })

  it('does not consume an attempt for invalid local input', () => {
    expect(isGuessUsable({}, 1, '   ', true)).toBe(false)
    expect(isGuessUsable({}, 1, 'Alpha', false)).toBe(false)
    expect(isGuessUsable({}, 4, 'Alpha', true)).toBe(false)
  })
})
