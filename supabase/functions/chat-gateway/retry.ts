export type ProviderSlot = 'primary' | 'fallback'

/**
 * Keep retry order predictable: each configured endpoint gets two attempts,
 * then the order repeats. The gateway uses this four-slot cycle repeatedly
 * until one provider returns a usable answer.
 */
export function providerAttemptOrder(hasPrimary: boolean, hasFallback: boolean, maxAttempts: number): ProviderSlot[] {
  const configured: ProviderSlot[] = []
  if (hasPrimary) configured.push('primary')
  if (hasFallback) configured.push('fallback')
  if (configured.length === 0 || maxAttempts <= 0) return []
  if (configured.length === 1) return Array.from({ length: maxAttempts }, () => configured[0])
  const cycle: ProviderSlot[] = ['primary', 'primary', 'fallback', 'fallback']
  return Array.from({ length: maxAttempts }, (_, index) => cycle[index % cycle.length])
}
