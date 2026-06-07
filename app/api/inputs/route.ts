import testInputsData from '@/data/test_inputs.json'

export async function GET() {
  return Response.json(testInputsData.inputs)
}
