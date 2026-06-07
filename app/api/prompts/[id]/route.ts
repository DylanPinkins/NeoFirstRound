import { getTreeByVariantId, updatePrompt, archiveTree, getUserById } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tree = getTreeByVariantId(id)
  if (!tree) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ tree })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const patch: Record<string, string> = {}
  if (typeof body.title === 'string') patch.title = body.title
  if (typeof body.body === 'string') patch.body = body.body

  const tree = updatePrompt(id, patch)
  if (!tree) return Response.json({ error: 'Not found' }, { status: 404 })
  broadcastWorkspace({ type: 'tree_updated', tree })
  return Response.json({ tree })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
