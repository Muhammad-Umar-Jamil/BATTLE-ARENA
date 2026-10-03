export async function functionErrorMessage(error: unknown, data: unknown, fallback: string) {
  if (data && typeof data === 'object') {
    const payload = data as { message?: unknown; error?: unknown }
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.error === 'string') return payload.error
  }
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context
    try {
      const payload = await context?.json?.() as { message?: unknown; error?: unknown } | undefined
      if (typeof payload?.message === 'string') return payload.message
      if (typeof payload?.error === 'string') return payload.error
    } catch { /* response body unavailable */ }
  }
  return fallback
}
