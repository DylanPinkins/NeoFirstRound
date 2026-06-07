import { getTreeByVariantId, archiveTree, getUserById } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = req.headers.get('X-User-Id') ?? ''
  const user = getUserById(userId)

  const tree = getTreeByVariantId(id)
  if (!tree) return Response.json({ error: 'Not found' }, { status: 404 })

  const archived = archiveTree(tree.root.id, user?.id ?? userId)
  if (!archived) return Response.json({ error: 'Not found' }, { status: 404 })

  broadcastWorkspace({ type: 'tree_deleted', rootId: tree.root.id })
  return Response.json({ ok: true })
}
