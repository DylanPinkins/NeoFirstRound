export type RunEvent =
  | { type: 'chunk'; variantId: string; text: string }
  | { type: 'complete'; variantId: string; durationMs: number }
  | { type: 'error'; variantId: string; error: string }
  | { type: 'all_complete' }

export interface RunSessionData {
  buffer: RunEvent[]
  subscribers: Set<(event: RunEvent) => void>
  done: boolean
}

declare global {
  // eslint-disable-next-line no-var
  var __runSessions: Map<string, RunSessionData> | undefined
}

if (!global.__runSessions) {
  global.__runSessions = new Map<string, RunSessionData>()
}

export const runSessions = global.__runSessions!

export function emitToSession(sessionId: string, event: RunEvent) {
  const session = runSessions.get(sessionId)
  if (!session) return
  session.buffer.push(event)
  for (const sub of session.subscribers) sub(event)
}
