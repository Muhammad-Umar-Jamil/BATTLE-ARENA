export type ScoreBreakdown = { similarityScore: number; basePoints: number; timeLeftMinutes: number; timeBonus: number; awardedPoints: number }

export function calculateScore(similarityScore: number, maxPoints: number, timeLeftMinutes: number): ScoreBreakdown {
  const safeSimilarity = Math.max(0, Math.min(100, Math.round(similarityScore)))
  const basePoints = Math.round((safeSimilarity / 100) * maxPoints)
  const safeTime = Math.max(0, timeLeftMinutes)
  const timeBonus = Math.round(0.2 * safeTime * basePoints)
  return { similarityScore: safeSimilarity, basePoints, timeLeftMinutes: safeTime, timeBonus, awardedPoints: basePoints + timeBonus }
}
