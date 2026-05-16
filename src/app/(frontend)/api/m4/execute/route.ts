/**
 * POST /api/m4/execute
 *
 * Milestone 4 — Full execution pipeline endpoint.
 * Orchestrates: workspace creation → patch application → real execution →
 * artifact storage → self-healing → review gates → PR materialization → cleanup.
 *
 * Returns structured execution results with all pipeline stage outputs.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'
import { createWorkspace, transitionWorkspace } from '../../../../../lib/workspaceManager'
import { cleanupWorkspace } from '../../../../../lib/workspaceCleanup'
import { applyPatches, validatePatchesForApply } from '../../../../../lib/patchApplier'
import { triggerExecution, createPipelineConfig } from '../../../../../lib/executionPipeline'
import { uploadExecutionArtifacts } from '../../../../../lib/artifactStorage'
import { createReplaySession, recordEvent, completeSession, serializeSession } from '../../../../../lib/executionReplay'
import { classifyError, isHealingSafe, createHealingAttempt, shouldContinueHealing, DEFAULT_HEALING_CONFIG } from '../../../../../lib/healingStrategies'
import { generateRollbackSummary, generatePRBody } from '../../../../../lib/prMaterializer'
import { validatePatchSet } from '../../../../../lib/patchValidator'
import { checkFilesScope, createDefaultScope } from '../../../../../lib/editScopeManager'
import { evaluateReviewGates } from '../../../../../lib/reviewGates'
import { classifyProtectedFiles } from '../../../../../lib/protectedFiles'
import type { PatchFile } from '../../../../../lib/patchEngine'

interface RequestBody {
  projectId: string
  runId: string
  repoOwner: string
  repoName: string
  baseBranch?: string
  userRequest: string
  patches: PatchFile[]
  riskScore?: number
  riskLevel?: string
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun'
  executionSteps?: string[]
}

export async function POST(req: Request) {
  if (!FEATURE_FLAGS.M4_WORKSPACE) {
    return Response.json({ error: 'M4 workspace system is disabled' }, { status: 503 })
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, runId, repoOwner, repoName, userRequest, patches } = body
  if (!projectId || !runId || !repoOwner || !repoName || !userRequest || !patches?.length) {
    return Response.json({ error: 'Missing required fields: projectId, runId, repoOwner, repoName, userRequest, patches' }, { status: 400 })
  }

  const payload = await getPayload({ config })
  const startTime = Date.now()

  // ── 1. Scope + validation ───────────────────────────────────────────────
  const scope = createDefaultScope(projectId)
  const filePaths = patches.map((p) => p.filePath)
  const scopeResult = checkFilesScope(filePaths, scope)
  if (scopeResult.blockedFiles.length > 0) {
    return Response.json({
      error: 'Scope violation',
      blockedFiles: scopeResult.blockedFiles,
      stage: 'scope_validation',
    }, { status: 422 })
  }

  const patchValidation = validatePatchSet(patches.map((p) => ({
    filePath: p.filePath,
    operation: p.operation,
    content: p.content,
    additions: p.content.split('\n').length,
    deletions: 0,
  })))
  if (!patchValidation.valid) {
    return Response.json({
      error: 'Patch validation failed',
      validationErrors: patchValidation.errors,
      stage: 'patch_validation',
    }, { status: 422 })
  }

  // ── 2. Create replay session ────────────────────────────────────────────
  let session = createReplaySession(runId, projectId, '')

  // ── 3. Create workspace ─────────────────────────────────────────────────
  const wsResult = await createWorkspace({
    projectId,
    runId,
    repoOwner,
    repoName,
    baseBranch: body.baseBranch,
  })

  if (!wsResult.success || !wsResult.workspace) {
    return Response.json({
      error: 'Workspace creation failed',
      details: wsResult.error,
      stage: 'workspace_setup',
      durationMs: wsResult.durationMs,
    }, { status: 500 })
  }

  const workspace = wsResult.workspace
  session = { ...session, workspaceId: workspace.workspaceId }
  session = recordEvent(session, 'workspace_created', { workspaceId: workspace.workspaceId })
  session = recordEvent(session, 'workspace_ready', { branchName: workspace.branchName })

  // Persist workspace run
  await payload.create({
    collection: 'workspace-runs' as 'users',
    data: {
      workspaceId: workspace.workspaceId,
      runId,
      projectId,
      provider: workspace.provider,
      status: workspace.status,
      branchName: workspace.branchName,
      repoOwner,
      repoName,
      baseBranch: workspace.baseBranch,
      lastHeartbeat: workspace.lastHeartbeat,
      expiresAt: workspace.expiresAt,
    } as Record<string, unknown>,
    overrideAccess: true,
  })

  try {
    // ── 4. Validate + apply patches ─────────────────────────────────────────
    const preApplyValidation = validatePatchesForApply(patches)
    if (!preApplyValidation.valid) {
      session = recordEvent(session, 'patch_rejected', { errors: preApplyValidation.errors })
      throw new Error(`Pre-apply validation failed: ${preApplyValidation.errors.join('; ')}`)
    }

    session = recordEvent(session, 'patches_received', { count: patches.length })

    const applyResult = await applyPatches({
      workspace: {
        workspaceId: workspace.workspaceId,
        repoOwner,
        repoName,
        branchName: workspace.branchName,
      },
      patches,
      commitMessage: `codehive: ${userRequest.substring(0, 72)}`,
      runId,
    })

    if (!applyResult.success) {
      session = recordEvent(session, 'patch_rejected', { errors: applyResult.errors })
      throw new Error(`Patch application failed: ${applyResult.errors.join('; ')}`)
    }

    session = recordEvent(session, 'patch_applied', {
      files: applyResult.appliedFiles,
      commitSha: applyResult.commitSha,
    })

    // ── 5. Execute pipeline ─────────────────────────────────────────────────
    session = recordEvent(session, 'execution_started')

    const pipelineConfig = createPipelineConfig({
      repoOwner,
      repoName,
      branchName: workspace.branchName,
      workspaceId: workspace.workspaceId,
      runId,
      packageManager: body.packageManager || 'npm',
    })

    const execResult = await triggerExecution(pipelineConfig)

    for (const step of execResult.steps) {
      session = recordEvent(session, step.status === 'passed' ? 'step_completed' : 'step_failed', {
        step: step.step,
        status: step.status,
        exitCode: step.exitCode,
        durationMs: step.durationMs,
      })

      // Persist execution step
      await payload.create({
        collection: 'execution-steps' as 'users',
        data: {
          runId,
          workspaceId: workspace.workspaceId,
          step: step.step,
          command: step.command,
          status: step.status,
          exitCode: step.exitCode,
          stdout: step.stdout?.substring(0, 10000) || '',
          stderr: step.stderr?.substring(0, 10000) || '',
          durationMs: step.durationMs,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
          retryCount: step.retryCount,
        } as Record<string, unknown>,
        overrideAccess: true,
      })
    }

    // ── 6. Self-healing (if execution failed) ───────────────────────────────
    const healAttempts: Array<{ strategy: string; outcome: string; targetFile: string }> = []

    if (!execResult.success && FEATURE_FLAGS.M4_ADVANCED_HEALING) {
      const failedSteps = execResult.steps.filter((s) => s.status === 'failed')
      for (const failedStep of failedSteps) {
        if (healAttempts.length >= DEFAULT_HEALING_CONFIG.maxAttempts) break

        const analysis = classifyError(failedStep.stderr || failedStep.stdout || '')
        const safeCheck = isHealingSafe(analysis)

        if (safeCheck.safe && analysis.canAutoFix) {
          session = recordEvent(session, 'self_heal_started', {
            strategy: analysis.strategy,
            targetFile: analysis.targetFile,
          })

          const attempt = createHealingAttempt(runId, workspace.workspaceId, analysis, healAttempts.length + 1)

          await payload.create({
            collection: 'healing-attempts' as 'users',
            data: {
              attemptId: attempt.attemptId,
              runId,
              workspaceId: workspace.workspaceId,
              strategy: attempt.strategy,
              targetFile: attempt.targetFile,
              errorMessage: attempt.errorMessage,
              suggestedFix: attempt.suggestedFix,
              outcome: 'partial',
              durationMs: 0,
              attemptNumber: attempt.attemptNumber,
              maxAttempts: attempt.maxAttempts,
            } as Record<string, unknown>,
            overrideAccess: true,
          })

          healAttempts.push({ strategy: analysis.strategy, outcome: 'partial', targetFile: analysis.targetFile })
          session = recordEvent(session, 'self_heal_applied', { strategy: analysis.strategy })
        }
      }
    }

    // ── 7. Upload artifacts ─────────────────────────────────────────────────
    const artifactItems = execResult.steps.map((step) => ({
      type: `${step.step === 'build' ? 'build_log' : step.step === 'test' ? 'test_report' : step.step === 'lint' ? 'lint_result' : 'sandbox_log'}` as const,
      filename: `${step.step}-result.txt`,
      content: `Exit: ${step.exitCode}\nStatus: ${step.status}\nDuration: ${step.durationMs}ms\n\n--- stdout ---\n${step.stdout}\n\n--- stderr ---\n${step.stderr}`,
    }))

    const artifactResult = await uploadExecutionArtifacts(projectId, runId, artifactItems)

    for (const art of artifactResult.uploaded) {
      await payload.create({
        collection: 'artifact-records' as 'users',
        data: {
          artifactId: art.artifactId,
          projectId,
          runId,
          type: art.type,
          r2Key: art.key,
          sizeBytes: art.sizeBytes,
          mimeType: art.mimeType,
          expiresAt: art.expiresAt,
          metadata: art.metadata,
        } as Record<string, unknown>,
        overrideAccess: true,
      })
    }

    // ── 8. Review gates ─────────────────────────────────────────────────────
    const protectedFiles = classifyProtectedFiles(filePaths)
    const riskScore = body.riskScore || (protectedFiles.length > 0 ? 50 : 15)
    const riskLevel = body.riskLevel || (riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW')

    const gateResult = evaluateReviewGates({
      riskScore,
      riskLevel,
      patchFiles: patches.map((p) => ({ filePath: p.filePath, operation: p.operation, additions: p.content.split('\n').length, deletions: 0 })),
      protectedFiles,
      totalLinesChanged: patches.reduce((sum, p) => sum + p.content.split('\n').length, 0),
    })

    session = recordEvent(session, 'review_gate_checked', { canProceed: gateResult.canProceed, gateCount: gateResult.gates.length })

    // ── 9. Rollback plan ────────────────────────────────────────────────────
    const rollbackPlan = generateRollbackSummary(patches, riskLevel)

    // ── 10. Complete replay session ─────────────────────────────────────────
    session = completeSession(session, execResult.success)

    await payload.create({
      collection: 'replay-sessions' as 'users',
      data: serializeSession(session) as Record<string, unknown>,
      overrideAccess: true,
    })

    // ── 11. Cleanup workspace ───────────────────────────────────────────────
    session = recordEvent(session, 'cleanup_started')
    const cleanupResult = await cleanupWorkspace(workspace)
    session = recordEvent(session, 'cleanup_completed', { branchDeleted: cleanupResult.branchDeleted })

    // Update workspace status
    const wsRecords = await payload.find({
      collection: 'workspace-runs' as 'users',
      where: { workspaceId: { equals: workspace.workspaceId } },
      limit: 1,
      overrideAccess: true,
    })
    if (wsRecords.docs[0]) {
      await payload.update({
        collection: 'workspace-runs' as 'users',
        id: wsRecords.docs[0].id,
        data: {
          status: 'destroyed',
          cleanupResult: cleanupResult as unknown as Record<string, unknown>,
          durationMs: Date.now() - startTime,
        } as Record<string, unknown>,
        overrideAccess: true,
      })
    }

    // ── Response ────────────────────────────────────────────────────────────
    return Response.json({
      success: execResult.success,
      runId,
      workspaceId: workspace.workspaceId,
      stage: 'completed',
      workspace: {
        branchName: workspace.branchName,
        status: 'destroyed',
        durationMs: wsResult.durationMs,
      },
      patches: {
        applied: applyResult.appliedFiles,
        rejected: applyResult.rejectedFiles,
        commitSha: applyResult.commitSha,
      },
      execution: {
        success: execResult.success,
        steps: execResult.steps.map((s) => ({
          step: s.step,
          status: s.status,
          exitCode: s.exitCode,
          durationMs: s.durationMs,
        })),
        totalDurationMs: execResult.totalDurationMs,
        failedStep: execResult.failedStep,
      },
      healing: {
        attempts: healAttempts,
        count: healAttempts.length,
      },
      artifacts: {
        uploaded: artifactResult.uploaded.length,
        errors: artifactResult.errors,
      },
      reviewGate: {
        canProceed: gateResult.canProceed,
        gates: gateResult.gates.map((g) => ({
          gate: g.gate,
          status: g.status,
          reason: g.reason,
        })),
      },
      rollbackPlan,
      replay: {
        sessionId: session.sessionId,
        totalSteps: session.totalSteps,
        failedSteps: session.failedSteps,
        healAttempts: session.healAttempts,
      },
      durationMs: Date.now() - startTime,
    })
  } catch (err) {
    // Cleanup workspace on failure
    const cleanupResult = await cleanupWorkspace(workspace)
    session = recordEvent(session, 'error', { message: err instanceof Error ? err.message : String(err) })
    session = completeSession(session, false)

    // Persist failed session
    try {
      await payload.create({
        collection: 'replay-sessions' as 'users',
        data: serializeSession(session) as Record<string, unknown>,
        overrideAccess: true,
      })
    } catch { /* best effort */ }

    return Response.json({
      error: err instanceof Error ? err.message : String(err),
      stage: 'execution_failed',
      workspaceId: workspace.workspaceId,
      cleanup: { branchDeleted: cleanupResult.branchDeleted },
      durationMs: Date.now() - startTime,
    }, { status: 500 })
  }
}
