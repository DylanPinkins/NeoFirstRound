import { createUser } from '@/lib/store'

export async function POST(req: Request) {
  const { name, email, password } = await req.json()
  if (!name || !email || !password) return Response.json({ error: 'Name, email, and password required' }, { status: 400 })
  if (password.length < 8) return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

  try {
    const user = createUser(name, email, password)
    return Response.json({
      user: { id: user.id, name: user.name, email: user.email, color: user.color },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create account'
    return Response.json({ error: message }, { status: 409 })
  }
}
