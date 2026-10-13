export type CharacterPacer = {
  enqueue: (text: string) => void
  setGap: (milliseconds: number) => void
  reset: () => void
  finish: () => Promise<void>
}

export function createCharacterPacer(
  gapMs: number,
  emit: (character: string) => void,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => number = Date.now,
): CharacterPacer {
  const queue: string[] = []
  let currentGap = Math.max(0, gapMs)
  let running = false
  let finished = false
  let lastEmittedAt: number | null = null
  let generation = 0
  let resolveFinished: (() => void) | null = null

  const pump = async () => {
    if (running) return
    running = true
    while (queue.length > 0) {
      const currentGeneration = generation
      if (lastEmittedAt !== null) {
        const remaining = currentGap - (now() - lastEmittedAt)
        if (remaining > 0) await sleep(remaining)
      }
      if (currentGeneration !== generation || queue.length === 0) continue
      const character = queue.shift()!
      emit(character)
      lastEmittedAt = now()
    }
    running = false
    if (finished) resolveFinished?.()
  }

  return {
    enqueue(text) {
      if (finished) return
      queue.push(...Array.from(text))
      void pump()
    },
    setGap(milliseconds) { currentGap = Math.max(0, milliseconds) },
    reset() { generation += 1; queue.length = 0; lastEmittedAt = null },
    finish() {
      finished = true
      if (!running && queue.length === 0) return Promise.resolve()
      return new Promise<void>((resolve) => { resolveFinished = resolve; void pump() })
    },
  }
}
