/**
 * /projects/[id]/plan/[runId]/page.tsx  (Server Component wrapper)
 */
import { RunDetailPage } from '../../../../../../components/RunDetailPage'

interface PageProps {
  params: Promise<{ id: string; runId: string }>
}

export default async function RunDetailPageWrapper({ params }: PageProps) {
  const { id, runId } = await params
  return <RunDetailPage projectId={id} runId={runId} />
}
