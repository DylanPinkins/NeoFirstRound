import { addVersion, getUserById } from '@/lib/store'

export async function POST(req: Request) {
  const userId = req.headers.get('X-User-Id') ?? ''
  const user = getUserById(userId)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { promptId, body, reason } = await req.json()
  if (!promptId || typeof body !== 'string') return Response.json({ error: 'promptId and body required' }, { status: 400 })

  const version = addVersion({
    promptId,
    body,
    userId: user.id,
    userName: user.name,
    reason: reason ?? 'auto-save',
    createdAt: new Date().toISOString(),
  })

  return Response.json({ version }, { status: 201 })
}
