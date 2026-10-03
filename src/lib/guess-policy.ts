export type GuessState = Record<number, boolean>

export function isGuessUsable(state: GuessState, level: number, guess: string, authenticated: boolean) {
  return authenticated && [1, 2, 3].includes(level) && !state[level] && guess.trim().length > 0
}

export function guessLabel(state: GuessState, level: number) {
  return state[level] ? 'GUESS USED' : '1 GUESS REMAINING'
}
