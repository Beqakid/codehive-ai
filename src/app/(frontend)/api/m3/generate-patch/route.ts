/**
 * POST /api/m3/generate-patch
 *
 * Milestone 3 — Controlled code generation endpoint.
 * Runs the full M3 pipeline: scope → protected files → validate → diff → review gates.
 * Returns structured results with diffs, validation, and review gate decisions.
 *
 * This does NOT write to the repo directly. It generates patches + diffs for review.
 * PR creation happens after review gate approval.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'
import { validateAndDiffPatches, type PatchFile } from '../../../../../lib/patchEngine'
import { validatePatchSet } from '../../../../../lib/patchValidator'
import { createDefaultScope, checkFilesScope } from '../../../../../lib/editScopeManager'
import { evaluateReviewGates } from '../../../../../lib/reviewGates'
import { classifyProtectedFiles } from '../../../../../lib/protectedFiles'

interface RequestBody {
  projectId: string
  runId: string
  patches: PatchFile[]
  existingFiles?: { path: string; content: string }[]
  repoOwner?: string
  repoName?: string
}

export const POST = async (req: Request): Promise<Response> => {
  try {
    if (!FEATURE_FLAGS.M3_PATCH_GENERATION) {
      return Response.json({ error: 'M3 patch generation is disabled' }, { status: 403 })
    }

    const body = (await req.json()) as RequestBody
    const { projectId, runId, patches, existingFiles = [] } = body

    if (!projectId || !runId || !patches?.length) {
      return Response.json({ error: 'Missing required fields: projectId, runId, patches' }, { status: 400 })
    }

    const payload = await getPayload({ config })
    const startMs = Date.now()

    // 1. Scope check
    const scope = createDefaultScope(projectId)
    const filePaths = patches.map((p) => p.filePath)
    const scopeCheck = FEATURE_FLAGS.M3_EDIT_SCOPE
      ? checkFilesScope(filePaths, scope)
      : { results: [], allowed: filePaths, restricted: [], blocked: [] }

    if (scopeCheck.blocked.length > 0) {
      return Response.json({
        success: false,
        error: `Blocked files: ${scopeCheck.blocked.join(', ')}`,
        scopeCheck,
      }, { status: 422 })
    }

    // 2. Protected file detection
    const protectedFiles = FEATURE_FLAGS.M2_PROTECTED_FILES
      ? classifyProtectedFiles(filePaths)
      : []

    // 3. Validate patches
    const validation = FEATURE_FLAGS.M3_PATCH_VALIDATION
      ? validatePatchSet(patches, undefined, scopeCheck.results)
      : { valid: true, issues: [], errors: [], warnings: [], summary: 'Validation skipped' }

    // 4. Generate diffs
    const diffResult = validateAndDiffPatches(
      patches, existingFiles,
      protectedFiles.map((p) => p.path),
    )

    // 5. Simple risk assessment based on protected files + change size
    // (Full M2 riskEngine requires repoIntelligence which isn't available at patch generation time)
    const hasProtected = protectedFiles.length > 0
    const isLargeChange = diffResult.metadata.totalLinesChanged > 300 || patches.length > 5
    const riskLevel = hasProtected ? 'HIGH' : isLargeChange ? 'MEDIUM' : 'LOW'
    const riskScore = hasProtected ? 70 : isLargeChange ? 40 : 10
    const simpleRiskReport = {
      riskLevel: riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      riskScore,
      totalScore: riskScore,
      rollbackComplexity: hasProtected ? 'medium' as const : 'low' as const,
      protectedFilesTouched: protectedFiles,
      factors: [] as { name: string; triggered: boolean; weight: number; reason: string }[],
      recommendations: [] as string[],
    }

    // 6. Review gates
    const reviewGateResult = FEATURE_FLAGS.M3_REVIEW_GATES
      ? evaluateReviewGates({
        patches,
        riskReport: simpleRiskReport,
        protectedFiles,
        totalLinesChanged: diffResult.metadata.totalLinesChanged,
        affectedFileCount: patches.length,
      })
      : { overallDecision: 'auto_approve' as const, checks: [], canProceed: true, requiresHumanApproval: false, blockReasons: [], warnings: [], summary: 'Review gates disabled' }

    // 7. Generate rollback plan
    const rollbackPlan = {
      filesTouched: filePaths,
      reversalStrategy: patches.map((p) => ({
        file: p.filePath,
        action: p.operation === 'create' ? 'delete file' : 'revert to previous version',
      })),
      dependencyRisks: protectedFiles.map((pf) => `Protected: ${pf.path} (${pf.protectionType})`),
      rollbackComplexity: simpleRiskReport.rollbackComplexity,
      cleanupSteps: ['Verify no broken imports', 'Run tests after rollback'],
    }

    // 8. Persist patch run to D1
    await payload.create({
      collection: 'patch-runs',
      data: {
        runId,
        projectId,
        status: validation.valid ? (reviewGateResult.canProceed ? 'completed' : 'review') : 'failed',
        patchCount: diffResult.patches.length,
        totalLinesChanged: diffResult.metadata.totalLinesChanged,
        patches: JSON.stringify(diffResult.patches),
        diffs: JSON.stringify(diffResult.diffs),
        rejectedFiles: JSON.stringify(diffResult.rejectedFiles),
        validationErrors: JSON.stringify(validation.errors),
        warnings: JSON.stringify([...validation.warnings, ...diffResult.warnings]),
        aiModel: diffResult.metadata.model,
        durationMs: Date.now() - startMs,
      },
      overrideAccess: true,
    })

    // 9. Persist review gate event
    if (FEATURE_FLAGS.M3_REVIEW_GATES) {
      await payload.create({
        collection: 'review-gate-events',
        data: {
          runId,
          projectId,
          overallDecision: reviewGateResult.overallDecision,
          canProceed: reviewGateResult.canProceed,
          requiresHumanApproval: reviewGateResult.requiresHumanApproval,
          checks: JSON.stringify(reviewGateResult.checks),
          blockReasons: JSON.stringify(reviewGateResult.blockReasons),
          warnings: JSON.stringify(reviewGateResult.warnings),
          summary: reviewGateResult.summary,
        },
        overrideAccess: true,
      })
    }

    // 10. Persist rollback plan
    await payload.create({
      collection: 'rollback-plans',
      data: {
        runId,
        projectId,
        filesTouched: JSON.stringify(rollbackPlan.filesTouched),
        reversalStrategy: JSON.stringify(rollbackPlan.reversalStrategy),
        dependencyRisks: JSON.stringify(rollbackPlan.dependencyRisks),
        rollbackComplexity: rollbackPlan.rollbackComplexity,
        cleanupSteps: JSON.stringify(rollbackPlan.cleanupSteps),
      },
      overrideAccess: true,
    })

    return Response.json({
      success: validation.valid && reviewGateResult.canProceed,
      runId,
      diffs: diffResult.diffs,
      validation: { valid: validation.valid, errors: validation.errors, warnings: validation.warnings, summary: validation.summary },
      scopeCheck: { allowed: scopeCheck.allowed, restricted: scopeCheck.restricted, blocked: scopeCheck.blocked },
      protectedFiles,
      riskReport: simpleRiskReport,
      reviewGate: reviewGateResult,
      rollbackPlan,
      rejectedFiles: diffResult.rejectedFiles,
      metadata: { ...diffResult.metadata, durationMs: Date.now() - startMs },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: `Patch generation failed: ${message}` }, { status: 500 })
  }
}
