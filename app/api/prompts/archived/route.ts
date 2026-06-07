import { getArchivedTrees } from '@/lib/store'

export async function GET() {
  return Response.json(getArchivedTrees())
}
