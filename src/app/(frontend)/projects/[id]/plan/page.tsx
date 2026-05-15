/**
 * /projects/[id]/plan/page.tsx  (Server Component)
 * Fetches the project server-side, passes props to the client interface.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { M1PlanInterface } from '../../../../../components/M1PlanInterface'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PlanPage({ params }: PageProps) {
  const { id } = await params
  const payload = await getPayload({ config })

  let project: {
    id: string | number
    name: string
    repoUrl?: string
    repoOwner?: string
    repoName?: string
  } | null = null

  try {
    project = (await payload.findByID({
      collection: 'projects',
      id,
      overrideAccess: true,
    })) as typeof project
  } catch {
    notFound()
  }

  if (!project) notFound()

  // Derive owner/repo from explicit fields or repoUrl
  let repoOwner = project.repoOwner || ''
  let repoName = project.repoName || ''

  if ((!repoOwner || !repoName) && project.repoUrl) {
    const match = project.repoUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/)
    if (match) {
      repoOwner = repoOwner || match[1]
      repoName = repoName || match[2].replace(/\.git$/, '')
    }
  }

  return (
    <M1PlanInterface
      projectId={String(project.id)}
      projectName={project.name}
      repoOwner={repoOwner || undefined}
      repoName={repoName || undefined}
    />
  )
}
