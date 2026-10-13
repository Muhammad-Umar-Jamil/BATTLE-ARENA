export type ServerClockAnchor = { serverMs: number; monotonicMs: number }

export function createServerClockAnchor(serverNow: string, requestStartedAt: number, responseReceivedAt: number): ServerClockAnchor {
  const roundTripMs = Math.max(0, responseReceivedAt - requestStartedAt)
  return { serverMs: new Date(serverNow).getTime() + roundTripMs / 2, monotonicMs: responseReceivedAt }
}

export function readServerClock(anchor: ServerClockAnchor, monotonicNow: number): number {
  return anchor.serverMs + Math.max(0, monotonicNow - anchor.monotonicMs)
}

export function secondsRemaining(endTime: string, serverNowMs: number): number {
  return Math.max(0, Math.floor((new Date(endTime).getTime() - serverNowMs) / 1000))
}
