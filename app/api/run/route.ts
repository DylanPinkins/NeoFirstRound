import { getTreeByVariantId, getUserById, addVersion } from '@/lib/store'
import { emitToSession, runSessions, type RunSessionData } from '@/lib/run-sessions'
import { streamModel } from '@/model_stub'
import testInputsData from '@/data/test_inputs.json'
import * as crypto from 'crypto'

export async function POST(req: Request) {
  const { promptTreeRootId, inputId } = await req.json()
  const userId = req.headers.get('X-User-Id') ?? ''
  const user = getUserById(userId)

  const tree = getTreeByVariantId(promptTreeRootId)
  const input = testInputsData.inputs.find((i) => i.id === inputId)
  if (!tree || !input) return Response.json({ error: 'Prompt tree or input not found' }, { status: 404 })

  const sessionId = `s_${crypto.randomBytes(6).toString('hex')}`
  const session: RunSessionData = { buffer: [], subscribers: new Set(), done: false }
  runSessions.set(sessionId, session)

  const variants = tree.variants
  let completedCount = 0

  // Save version snapshots before running
  if (user) {
    variants.forEach((variant) => {
      addVersion({
        promptId: variant.id,
        body: variant.body,
        userId: user.id,
        userName: user.name,
        reason: 'run',
        createdAt: new Date().toISOString(),
      })
    })
  }

  // Run all variants in parallel — last variant is slowed if multiple exist (for demo)
  variants.forEach((variant, idx) => {
    const slow = variants.length > 1 && idx === variants.length - 1
    const startedAt = Date.now()

    void (async () => {
      try {
        for await (const chunk of streamModel(variant.body, input.text, slow ? { slow: true } : {})) {
          emitToSession(sessionId, { type: 'chunk', variantId: variant.id, text: chunk.text })
        }
        emitToSession(sessionId, { type: 'complete', variantId: variant.id, durationMs: Date.now() - startedAt })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        emitToSession(sessionId, { type: 'error', variantId: variant.id, error: message })
      } finally {
        completedCount++
        if (completedCount === variants.length) {
          emitToSession(sessionId, { type: 'all_complete' })
          session.done = true
          // Clean up after 2 minutes
          setTimeout(() => runSessions.delete(sessionId), 120_000)
        }
      }
    })()
  })

  return Response.json({ sessionId })
}
