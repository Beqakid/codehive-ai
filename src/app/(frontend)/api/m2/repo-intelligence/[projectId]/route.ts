/**
 * GET /api/m2/repo-intelligence/[projectId]
 *
 * Returns the latest persisted repo intelligence for a project.
 * If none exists in D1, triggers a fresh scan and returns results.
 * DO NOT add `export const runtime = 'edge'`
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { validateRepoAccess, fetchRepoMetadata, fetchFileTree, fetchKeyFiles, parseRepoUrl } from '../../../../../lib/repoService'
import { analyzeRepository, findCentralFiles } from '../../../../../lib/repoIntelligence'
import { classifyProtectedFiles } from '../../../../../lib/protectedFiles'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> => {
  if (!FEATURE_FLAGS.M2_REPO_INTELLIGENCE) {
    return Response.json({ error: 'M2_REPO_INTELLIGENCE feature flag is disabled' }, { status: 403 })
  }

  const { projectId } = await params

  try {
    const payload = await getPayload({ config })

    // Try to load from D1 first
    const existing = await payload.find({
      collection: 'repo-intelligence',
      where: { projectId: { equals: projectId } },
      sort: '-lastIndexedAt',
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      return Response.json({
        source: 'cache',
        intelligence: existing.docs[0],
      })
    }

    // Fresh scan
    const project = (await payload.findByID({
      collection: 'projects',
      id: projectId,
      overrideAccess: true,
    })) as { id: string | number; name: string; repoUrl?: string; repoOwner?: string; repoName?: string; defaultBranch?: string }

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    let owner = project.repoOwner || ''
    let repo = project.repoName || ''
    if ((!owner || !repo) && project.repoUrl) {
      const parsed = parseRepoUrl(project.repoUrl)
      if (parsed) { owner = owner || parsed.owner; repo = repo || parsed.repo }
    }
    if (!owner || !repo) {
      return Response.json({ error: 'Cannot determine repository for this project' }, { status: 400 })
    }

    const hasAccess = await validateRepoAccess(owner, repo)
    if (!hasAccess) {
      return Response.json({ error: `Cannot access ${owner}/${repo}` }, { status: 403 })
    }

    const repoMetadata = await fetchRepoMetadata(owner, repo)
    const { tree } = await fetchFileTree(owner, repo, repoMetadata.defaultBranch)
    const keyFiles = await fetchKeyFiles(owner, repo, repoMetadata.defaultBranch)

    const intelligence = analyzeRepository(owner, repo, tree, keyFiles)
    const centralFiles = findCentralFiles(intelligence.dependencyEdges)
    const protectedFiles = classifyProtectedFiles(intelligence.fileMap.map((f) => f.filePath))

    // Save to D1
    let saved = null
    try {
      saved = await payload.create({
        collection: 'repo-intelligence',
        data: {
          projectId,
          owner,
          repo,
          frameworkSummary: intelligence.frameworkSummary,
          architectureSummary: intelligence.architectureSummary,
          techStack: intelligence.techStack,
          importantFiles: intelligence.importantFiles,
          protectedAreas: intelligence.protectedAreas,
          envVarsDetected: intelligence.envVarsDetected,
          routeStructure: intelligence.routeStructure,
          authSystem: intelligence.authSystem ?? null,
          lastIndexedAt: new Date(intelligence.lastIndexedAt).toISOString(),
        },
        overrideAccess: true,
      })
    } catch {
      // Non-fatal
    }

    return Response.json({
      source: 'fresh',
      intelligence: saved ?? intelligence,
      centralFiles: centralFiles.slice(0, 10),
      protectedFiles: protectedFiles.slice(0, 20),
      stats: {
        totalFiles: intelligence.fileMap.length,
        highPriorityFiles: intelligence.fileMap.filter((f) => f.priority === 'HIGH').length,
        dependencyEdges: intelligence.dependencyEdges.length,
        protectedFileCount: protectedFiles.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
