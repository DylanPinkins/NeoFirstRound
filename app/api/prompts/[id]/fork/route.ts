import { forkPrompt, getUserById } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('X-User-Id') ?? ''
  const user = getUserById(userId)

  const result = forkPrompt(id, user?.id ?? userId)
  if (!result) return Response.json({ error: 'Prompt not found' }, { status: 404 })

  broadcastWorkspace({ type: 'variant_forked', rootId: result.tree.root.id, variant: result.variant, tree: result.tree })
  return Response.json({ variant: result.variant, tree: result.tree }, { status: 201 })
}
