import { promoteVariant, updatePrompt } from '@/lib/store'
import { broadcastWorkspace } from '@/lib/events'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let aiTitle: string | undefined
  try {
    const body = await req.json()
    aiTitle = body.aiTitle
  } catch {
    // body is optional
  }

  const tree = promoteVariant(id)
  if (!tree) return Response.json({ error: 'Prompt not found' }, { status: 404 })

  if (aiTitle) {
    updatePrompt(id, { title: aiTitle })
  }

  const finalTree = promoteVariant(id) ?? tree
  broadcastWorkspace({ type: 'variant_promoted', rootId: finalTree.root.id, mainId: id, tree: finalTree })
  return Response.json({ tree: finalTree })
}
