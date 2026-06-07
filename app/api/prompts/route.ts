import { getAllTrees, createTree, getUserById } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function GET() {
  return Response.json(getAllTrees())
}

export async function POST(req: Request) {
  const userId = req.headers.get('X-User-Id') ?? 'anonymous'
  const { title, body } = await req.json()

  if (!title?.trim()) return Response.json({ error: 'Title is required' }, { status: 400 })

  const user = getUserById(userId)
  const tree = createTree(title.trim(), body ?? '', user?.id ?? userId)
  broadcastWorkspace({ type: 'tree_created', tree })
  return Response.json({ tree }, { status: 201 })
}
