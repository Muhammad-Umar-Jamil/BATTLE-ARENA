export type CharacterPacer = {
  enqueue: (text: string) => void
  setGap: (milliseconds: number) => void
  finish: () => Promise<void>
}

export function createCharacterPacer(
  gapMs: number,
  emit: (character: string) => void,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): CharacterPacer {
  let queue = ''
  let currentGap = Math.max(0, gapMs)
  let running = false
  let finished = false
  let resolveFinished: (() => void) | null = null

  const pump = async () => {
    if (running) return
    running = true
    while (queue.length > 0) {
      const character = queue[0]
      queue = queue.slice(1)
      emit(character)
      if (queue.length > 0 && currentGap > 0) await sleep(currentGap)
    }
    running = false
    if (finished) resolveFinished?.()
  }

  return {
    enqueue(text) {
      if (finished) return
      queue += text
      void pump()
    },
    setGap(milliseconds) { currentGap = Math.max(0, milliseconds) },
    finish() {
      finished = true
      if (!running && queue.length === 0) return Promise.resolve()
      return new Promise<void>((resolve) => { resolveFinished = resolve; void pump() })
    },
  }
}
