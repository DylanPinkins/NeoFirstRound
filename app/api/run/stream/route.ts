import { runSessions, type RunEvent } from '@/lib/run-sessions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('sessionId')
  if (!sessionId) return Response.json({ error: 'Missing sessionId' }, { status: 400 })

  const session = runSessions.get(sessionId)
  if (!session) return Response.json({ error: 'Session not found' }, { status: 404 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Replay buffered events first
      for (const event of session.buffer) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch { return }
      }

      if (session.done) {
        controller.close()
        return
      }

      const subscriber = (event: RunEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          if (event.type === 'all_complete') {
            session.subscribers.delete(subscriber)
            controller.close()
          }
        } catch {
          session.subscribers.delete(subscriber)
        }
      }

      session.subscribers.add(subscriber)

      req.signal.addEventListener('abort', () => {
        session.subscribers.delete(subscriber)
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
