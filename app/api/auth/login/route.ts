import { verifyUser } from '@/lib/store'

export async function POST(req: Request) {
  const { email, password } = await req.json()
  if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 })

  const user = verifyUser(email, password)
  if (!user) return Response.json({ error: 'Invalid email or password' }, { status: 401 })

  return Response.json({
    user: { id: user.id, name: user.name, email: user.email, color: user.color },
  })
}
