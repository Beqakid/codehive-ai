/**
 * GET /api/m2/protected-files/[projectId]
 *
 * Scans a project's repository and returns which files are classified
 * as protected (require approval before AI modification).
 * DO NOT add `export const runtime = 'edge'`
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { validateRepoAccess, fetchRepoMetadata, fetchFileTree, parseRepoUrl } from '../../../../../lib/repoService'
import { classifyProtectedFiles, getProtectionBadge, PROTECTION_RULES } from '../../../../../lib/protectedFiles'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'

export const GET = async (
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
): Promise<Response> => {
  if (!FEATURE_FLAGS.M2_PROTECTED_FILES) {
    return Response.json({ error: 'M2_PROTECTED_FILES feature flag is disabled' }, { status: 403 })
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
    const filePaths = tree.filter((e) => e.type === 'blob').map((e) => e.path)

    const protectedFiles = classifyProtectedFiles(filePaths)

    // Enrich with badge labels
    const enriched = protectedFiles.map((f) => ({
      ...f,
      badge: getProtectionBadge(f.protectionType),
    }))

    // Group by protection type
    const byType: Record<string, typeof enriched> = {}
    for (const f of enriched) {
      if (!byType[f.protectionType]) byType[f.protectionType] = []
      byType[f.protectionType].push(f)
    }

    return Response.json({
      projectId,
      owner,
      repo,
      totalFiles: filePaths.length,
      protectedFiles: enriched,
      byType,
      stats: {
        total: enriched.length,
        critical: enriched.filter((f) => f.riskLevel === 'CRITICAL').length,
        high: enriched.filter((f) => f.riskLevel === 'HIGH').length,
        medium: enriched.filter((f) => f.riskLevel === 'MEDIUM').length,
        requiresApproval: enriched.filter((f) => f.requiresApproval).length,
      },
      rulesApplied: PROTECTION_RULES.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
