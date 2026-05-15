/**
 * GET /api/m2/dependencies/[projectId]
 *
 * Returns the dependency graph for a project.
 * Edges represent import/require relationships between files.
 * Central files = files with many inbound dependencies (high-impact).
 * DO NOT add `export const runtime = 'edge'`
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { validateRepoAccess, fetchRepoMetadata, fetchFileTree, fetchKeyFiles, parseRepoUrl } from '../../../../../../lib/repoService'
import { analyzeRepository, findCentralFiles, extractDependencyEdges } from '../../../../../../lib/repoIntelligence'
import { FEATURE_FLAGS } from '../../../../../../lib/featureFlags'

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> => {
  if (!FEATURE_FLAGS.M2_DEPENDENCY_GRAPH) {
    return Response.json({ error: 'M2_DEPENDENCY_GRAPH feature flag is disabled' }, { status: 403 })
  }

  const { projectId } = await params

  try {
    const payload = await getPayload({ config })

    const project = (await payload.findByID({
      collection: 'projects',
      id: projectId,
      overrideAccess: true,
    })) as { id: string | number; name: string; repoUrl?: string; repoOwner?: string; repoName?: string }

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

    // Build adjacency summary for UI
    const adjacency: Record<string, string[]> = {}
    for (const edge of intelligence.dependencyEdges) {
      if (!adjacency[edge.sourceFile]) adjacency[edge.sourceFile] = []
      adjacency[edge.sourceFile].push(edge.targetFile)
    }

    // Find files with circular dependency risk (A → B → A)
    const circularRisks: Array<{ fileA: string; fileB: string }> = []
    for (const edge of intelligence.dependencyEdges) {
      const reverseExists = intelligence.dependencyEdges.some(
        (e) => e.sourceFile === edge.targetFile && e.targetFile === edge.sourceFile,
      )
      if (reverseExists) {
        const pair = [edge.sourceFile, edge.targetFile].sort()
        const alreadyFound = circularRisks.some(
          (r) => r.fileA === pair[0] && r.fileB === pair[1],
        )
        if (!alreadyFound) {
          circularRisks.push({ fileA: pair[0]!, fileB: pair[1]! })
        }
      }
    }

    return Response.json({
      projectId,
      owner,
      repo,
      edges: intelligence.dependencyEdges.slice(0, 200),
      centralFiles: centralFiles.slice(0, 15),
      circularRisks: circularRisks.slice(0, 10),
      stats: {
        totalEdges: intelligence.dependencyEdges.length,
        uniqueSources: new Set(intelligence.dependencyEdges.map((e) => e.sourceFile)).size,
        uniqueTargets: new Set(intelligence.dependencyEdges.map((e) => e.targetFile)).size,
        centralFileCount: centralFiles.length,
        circularRiskCount: circularRisks.length,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
