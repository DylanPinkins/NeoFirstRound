import { restoreTree } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tree = restoreTree(id)
  if (!tree) return Response.json({ error: 'Not found in archive' }, { status: 404 })
  broadcastWorkspace({ type: 'tree_created', tree })
  return Response.json({ tree })
}
