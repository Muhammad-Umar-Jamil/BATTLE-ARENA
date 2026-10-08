import { describe, expect, it } from 'vitest'
import { createCharacterPacer } from './character-pacer'

describe('character pacer', () => {
  it('emits queued characters in order and waits between characters', async () => {
    const emitted: string[] = []
    const waits: number[] = []
    const pacer = createCharacterPacer(40, (character) => emitted.push(character), async (milliseconds) => { waits.push(milliseconds) })
    pacer.enqueue('Hi')
    pacer.enqueue('!')
    await pacer.finish()
    expect(emitted.join('')).toBe('Hi!')
    expect(waits).toEqual([40, 40])
  })

  it('does not wait after the final character', async () => {
    const waits: number[] = []
    const pacer = createCharacterPacer(100, () => {}, async (milliseconds) => { waits.push(milliseconds) })
    pacer.enqueue('OK')
    await pacer.finish()
    expect(waits).toEqual([100])
  })

  it('updates the gap while the stream is starting', async () => {
    const waits: number[] = []
    const pacer = createCharacterPacer(35, () => {}, async (milliseconds) => { waits.push(milliseconds) })
    pacer.setGap(120)
    pacer.enqueue('AB')
    await pacer.finish()
    expect(waits).toEqual([120])
  })

  it('preserves the remaining gap when another chunk arrives after the queue empties', async () => {
    let clock = 0
    const waits: number[] = []
    const emitted: string[] = []
    const pacer = createCharacterPacer(40, (character) => emitted.push(character), async (milliseconds) => {
      waits.push(milliseconds)
      clock += milliseconds
    }, () => clock)
    pacer.enqueue('A')
    await Promise.resolve()
    clock += 15
    pacer.enqueue('B')
    await pacer.finish()
    expect(emitted.join('')).toBe('AB')
    expect(waits).toEqual([25])
  })

  it('does not wait when a later chunk arrives after the full gap', async () => {
    let clock = 0
    const waits: number[] = []
    const pacer = createCharacterPacer(40, () => {}, async (milliseconds) => { waits.push(milliseconds) }, () => clock)
    pacer.enqueue('A')
    await Promise.resolve()
    clock = 70
    pacer.enqueue('B')
    await pacer.finish()
    expect(waits).toEqual([])
  })

  it('emits Unicode characters without splitting surrogate pairs', async () => {
    const emitted: string[] = []
    const pacer = createCharacterPacer(0, (character) => emitted.push(character))
    pacer.enqueue('A😀é')
    await pacer.finish()
    expect(emitted).toEqual(['A', '😀', 'é'])
  })
})
