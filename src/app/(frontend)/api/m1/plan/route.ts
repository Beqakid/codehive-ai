/**
 * POST /api/m1/plan
 *
 * Milestone 1 + 2 SSE pipeline. Accepts a project ID + user request.
 * Streams log events to the client while:
 *  M1: 1. Validates GitHub access
 *       2. Fetches repo metadata + file tree + key files
 *       3. Runs the planning agent (AI, no code gen)
 *       4. Saves the plan to D1
 *       5. Creates a branch + PR in the target repo (docs-only)
 *  M2: 1a. Runs repo intelligence scanner
 *       2a. Extracts dependency graph
 *       3a. Classifies protected files
 *       4a. Runs risk scoring engine
 *       5a. Enriches planner with M2 context
 *       6a. Saves risk report to D1
 *
 * Every log event is also persisted to the agent-logs collection.
 * DO NOT add `export const runtime = 'edge'` — this route uses Node.js APIs.
 */
import { getPayload } from 'payload'
import config from '@payload-config'
import {
  validateRepoAccess,
  fetchRepoMetadata,
  fetchFileTree,
  fetchKeyFiles,
  parseRepoUrl,
} from '../../../../../lib/repoService'
import {
  getDefaultBranchSha,
  createBranch,
  createOrUpdateFile,
  createPullRequest,
} from '../../../../../lib/github'
import { runPlannerAgent } from '../../../../../agents/plannerAgent'
import { FEATURE_FLAGS } from '../../../../../lib/featureFlags'
import { analyzeRepository, findCentralFiles } from '../../../../../lib/repoIntelligence'
import { classifyProtectedFiles, buildProtectedFileWarning } from '../../../../../lib/protectedFiles'
import { calculateRisk, formatRiskSummary } from '../../../../../lib/riskEngine'
import { transition } from '../../../../../lib/runStateMachine'
import type { RunState } from '../../../../../lib/runStateMachine'

interface RequestBody {
  projectId: string
  userRequest: string
  repoOwner?: string
  repoName?: string
}

export const POST = async (req: Request): Promise<Response> => {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = (data: Record<string, unknown>): void => {
    writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
  }

  const response = new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })

  // Pipeline runs asynchronously — response streams back immediately
  ;(async () => {
    const payload = await getPayload({ config })
    let runId: string | null = null
    let runState: RunState = 'queued'

    const updateState = (event: Parameters<typeof transition>[1]) => {
      if (FEATURE_FLAGS.M2_STATE_MACHINE) {
        try {
          runState = transition(runState, event)
          send({ type: 'state_change', state: runState })
        } catch {
          // Non-fatal — state machine errors don't block pipeline
        }
      }
    }

    try {
      const body = (await req.json()) as RequestBody
      const { projectId, userRequest } = body

      if (!userRequest?.trim()) {
        send({ type: 'error', message: 'User request is required' })
        writer.close()
        return
      }
      if (!projectId?.trim()) {
        send({ type: 'error', message: 'projectId is required' })
        writer.close()
        return
      }

      send({
        type: 'log',
        level: 'info',
        event: 'init',
        message: '🐝 CodeHive Planning Pipeline started',
      })

      updateState('START')

      // ── Resolve project ──────────────────────────────────────────────────
      const project = (await payload.findByID({
        collection: 'projects',
        id: projectId,
        overrideAccess: true,
      })) as {
        id: string | number
        name: string
        repoUrl?: string
        repoOwner?: string
        repoName?: string
        defaultBranch?: string
      }

      if (!project) {
        send({ type: 'error', message: `Project ${projectId} not found` })
        writer.close()
        return
      }

      let owner = body.repoOwner || project.repoOwner || ''
      let repo = body.repoName || project.repoName || ''

      if ((!owner || !repo) && project.repoUrl) {
        const parsed = parseRepoUrl(project.repoUrl)
        if (parsed) {
          owner = owner || parsed.owner
          repo = repo || parsed.repo
        }
      }

      if (!owner || !repo) {
        send({
          type: 'error',
          message:
            'Cannot determine repository. Set repoOwner + repoName on the project or pass them in the request.',
        })
        writer.close()
        return
      }

      send({
        type: 'log',
        level: 'info',
        event: 'project_resolved',
        message: `📁 Project: "${project.name}" → ${owner}/${repo}`,
      })

      // ── Create coding_request ────────────────────────────────────────────
      const codingRequest = await payload.create({
        collection: 'coding-requests',
        data: {
          title: userRequest.slice(0, 100),
          description: userRequest,
          project: projectId,
          requestedBy: '1',
          status: 'planning',
        },
        overrideAccess: true,
      })

      // ── Create agent_run ─────────────────────────────────────────────────
      const startedAt = Date.now()
      const agentRun = await payload.create({
        collection: 'agent-runs',
        data: {
          agentName: 'planner',
          runType: 'planning',
          codingRequest: String(codingRequest.id),
          status: FEATURE_FLAGS.M2_STATE_MACHINE ? 'starting' : 'running',
          input: { userRequest, owner, repo },
        },
        overrideAccess: true,
      })
      runId = String(agentRun.id)

      send({
        type: 'run_created',
        runId,
        message: `🚀 Agent run #${runId} created`,
      })

      updateState('START')

      // Helpers — persist each log to D1 and send SSE simultaneously
      const logToDb = async (
        event: string,
        message: string,
        level = 'info',
        metadata?: Record<string, unknown>,
      ) => {
        try {
          await payload.create({
            collection: 'agent-logs',
            data: {
              runId: runId!,
              level,
              event,
              message,
              metadata: metadata ?? null,
            },
            overrideAccess: true,
          })
        } catch {
          // Non-fatal
        }
      }

      const log = async (
        message: string,
        level = 'info',
        event = 'log',
        metadata?: Record<string, unknown>,
      ) => {
        send({ type: 'log', level, event, message, runId })
        await logToDb(event, message, level, metadata)
      }

      // Update run state in DB
      const updateRunState = async (status: string) => {
        if (FEATURE_FLAGS.M2_STATE_MACHINE) {
          try {
            await payload.update({
              collection: 'agent-runs',
              id: runId!,
              data: { status },
              overrideAccess: true,
            })
          } catch {
            // Non-fatal
          }
        }
      }

      // ── Step 1: Validate GitHub access ───────────────────────────────────
      await updateRunState('analyzing_repo')
      await log('🔍 Validating GitHub repository access...', 'info', 'repo_access_check')
      const hasAccess = await validateRepoAccess(owner, repo)
      if (!hasAccess) {
        await log(
          `❌ Cannot access ${owner}/${repo}. Verify GITHUB_TOKEN has read access.`,
          'error',
          'repo_access_denied',
        )
        send({ type: 'error', message: `Repository access denied: ${owner}/${repo}` })
        await payload.update({
          collection: 'agent-runs',
          id: runId,
          data: { status: 'failed', errorMessage: 'Repository access denied' },
          overrideAccess: true,
        })
        updateState('ERROR')
        writer.close()
        return
      }
      await log(`✅ Repository access confirmed: ${owner}/${repo}`, 'success', 'repo_access_ok')

      // ── Step 2: Fetch repo metadata ──────────────────────────────────────
      await log('📊 Fetching repository metadata...', 'info', 'repo_metadata_fetch')
      const repoMetadata = await fetchRepoMetadata(owner, repo)
      await log(
        `✅ ${repoMetadata.fullName} · branch: ${repoMetadata.defaultBranch} · language: ${repoMetadata.language || 'Unknown'}`,
        'success',
        'repo_metadata_ok',
        { repoMetadata },
      )

      // ── Step 3: Fetch file tree ──────────────────────────────────────────
      await log('🌳 Fetching repository file tree...', 'info', 'file_tree_fetch')
      const {
        tree,
        formatted: fileTree,
        truncated,
      } = await fetchFileTree(owner, repo, repoMetadata.defaultBranch)
      const blobCount = tree.filter((t) => t.type === 'blob').length
      await log(
        `✅ File tree fetched: ${blobCount} files${truncated ? ' (tree was truncated at 300 entries)' : ''}`,
        'success',
        'file_tree_ok',
      )

      // ── Step 4: Read key files ───────────────────────────────────────────
      await log('📄 Reading key source files...', 'info', 'key_files_fetch')
      const keyFiles = await fetchKeyFiles(owner, repo, repoMetadata.defaultBranch)
      await log(
        `✅ Read ${keyFiles.length} key files: ${keyFiles.map((f) => f.path).join(', ') || 'none found'}`,
        'success',
        'key_files_ok',
      )

      updateState('REPO_ANALYZED')

      // ── M2 Step 5: Repository intelligence scan ──────────────────────────
      let repoIntelligence = undefined
      if (FEATURE_FLAGS.M2_REPO_INTELLIGENCE) {
        await log('🔬 Running repository intelligence scan...', 'info', 'repo_scan_started')
        await updateRunState('building_graph')

        try {
          repoIntelligence = analyzeRepository(owner, repo, tree, keyFiles)
          const centralFiles = findCentralFiles(repoIntelligence.dependencyEdges)

          await log(
            `✅ Intelligence scan complete: ${repoIntelligence.techStack.join(', ') || 'Unknown stack'} · ${repoIntelligence.envVarsDetected.length} env vars · ${centralFiles.length} central files`,
            'success',
            'repo_scan_completed',
            {
              techStack: repoIntelligence.techStack,
              authSystem: repoIntelligence.authSystem,
              routeCount: repoIntelligence.routeStructure.length,
              centralFiles: centralFiles.slice(0, 5).map((f) => f.filePath),
            },
          )

          // Save to D1
          try {
            await payload.create({
              collection: 'repo-intelligence',
              data: {
                projectId,
                owner,
                repo,
                frameworkSummary: repoIntelligence.frameworkSummary,
                architectureSummary: repoIntelligence.architectureSummary,
                techStack: repoIntelligence.techStack,
                importantFiles: repoIntelligence.importantFiles,
                protectedAreas: repoIntelligence.protectedAreas,
                envVarsDetected: repoIntelligence.envVarsDetected,
                routeStructure: repoIntelligence.routeStructure,
                authSystem: repoIntelligence.authSystem ?? null,
                lastIndexedAt: new Date(repoIntelligence.lastIndexedAt).toISOString(),
              },
              overrideAccess: true,
            })
          } catch {
            // Non-fatal — intelligence saves shouldn't block the pipeline
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await log(`⚠️ Intelligence scan warning: ${msg}`, 'warn', 'repo_scan_warn')
          // Continue without intelligence
        }
      }

      updateState('GRAPH_BUILT')

      // ── M2 Step 6: Protected file detection ─────────────────────────────
      let protectedFiles: ReturnType<typeof classifyProtectedFiles> = []
      if (FEATURE_FLAGS.M2_PROTECTED_FILES && repoIntelligence) {
        await log('🛡️ Detecting protected files...', 'info', 'protected_file_detection')
        const allPaths = repoIntelligence.fileMap.map((f) => f.filePath)
        protectedFiles = classifyProtectedFiles(allPaths)

        if (protectedFiles.length > 0) {
          const critical = protectedFiles.filter((f) => f.riskLevel === 'CRITICAL').length
          const high = protectedFiles.filter((f) => f.riskLevel === 'HIGH').length
          await log(
            `⚠️ Protected files detected: ${protectedFiles.length} total (${critical} CRITICAL, ${high} HIGH)`,
            'warn',
            'protected_file_detected',
            { protectedFiles: protectedFiles.slice(0, 10) },
          )
        } else {
          await log('✅ No protected files detected', 'success', 'protected_file_detection')
        }
      }

      // ── M2 Step 7: Risk analysis ─────────────────────────────────────────
      let riskReport = undefined
      if (FEATURE_FLAGS.M2_RISK_ENGINE && repoIntelligence) {
        await log('📊 Running risk analysis...', 'info', 'risk_analysis_started')
        await updateRunState('risk_analysis')

        try {
          // Use planner output for affected files (we'll use repo-level protected files for now)
          riskReport = calculateRisk({
            runId: runId!,
            projectId,
            affectedFiles: repoIntelligence.importantFiles.slice(0, 20),
            protectedFilesTouched: protectedFiles,
            dependencyEdges: repoIntelligence.dependencyEdges,
            repoIntelligence,
          })

          await log(
            `✅ Risk analysis complete: ${formatRiskSummary(riskReport)}`,
            riskReport.riskLevel === 'CRITICAL' || riskReport.riskLevel === 'HIGH' ? 'warn' : 'success',
            'risk_analysis_completed',
            {
              riskLevel: riskReport.riskLevel,
              riskScore: riskReport.riskScore,
              confidenceScore: riskReport.confidenceScore,
            },
          )

          send({
            type: 'risk_report',
            riskLevel: riskReport.riskLevel,
            riskScore: riskReport.riskScore,
            runId,
          })

          // Save risk report to D1
          try {
            await payload.create({
              collection: 'run-risk-reports',
              data: {
                runId: runId!,
                projectId,
                riskLevel: riskReport.riskLevel,
                riskScore: riskReport.riskScore,
                confidenceScore: riskReport.confidenceScore,
                affectedFiles: riskReport.affectedFiles,
                protectedFilesTouched: riskReport.protectedFilesTouched.map((f) => f.path),
                rollbackComplexity: riskReport.rollbackComplexity,
                implementationScope: riskReport.implementationScope,
                recommendations: riskReport.recommendations,
              },
              overrideAccess: true,
            })
          } catch {
            // Non-fatal
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          await log(`⚠️ Risk analysis warning: ${msg}`, 'warn', 'risk_analysis_warn')
        }
      }

      updateState('RISK_ASSESSED')

      // ── Step 8: Run planning agent ───────────────────────────────────────
      await log('🧠 Starting AI planning agent...', 'info', 'planner_start')
      await updateRunState('planning')

      const planResult = await runPlannerAgent({
        userRequest,
        repoOwner: owner,
        repoName: repo,
        repoMetadata,
        fileTree,
        keyFiles,
        onLog: (message, level = 'info') => {
          send({ type: 'log', level, event: 'planner', message, runId })
          void logToDb('planner', message, level)
        },
        // M2 enrichment
        ...(FEATURE_FLAGS.M2_ENRICHED_PLANNER ? {
          repoIntelligence,
          riskReport,
          protectedFiles: protectedFiles.length > 0 ? protectedFiles : undefined,
        } : {}),
      })
      await log(`✅ Plan generated: "${planResult.title}"`, 'success', 'plan_generation_completed')

      updateState('PLAN_GENERATED')

      // ── Step 9: Save plan to D1 ──────────────────────────────────────────
      await payload.update({
        collection: 'agent-runs',
        id: runId,
        data: {
          planMarkdown: planResult.markdown,
          output: {
            title: planResult.title,
            affectedFiles: planResult.affectedFiles,
            riskLevel: planResult.riskLevel,
            estimatedHours: planResult.estimatedHours,
            notRecommendedFiles: planResult.notRecommendedFiles,
            safeBoundaries: planResult.safeBoundaries,
          },
        },
        overrideAccess: true,
      })
      await log('💾 Plan saved to database', 'success', 'plan_saved')

      // ── Step 10: Create GitHub branch ────────────────────────────────────
      const branchName = `codehive/plan-${runId}`
      let prUrl = ''

      await log(`🌿 Creating branch: ${branchName}`, 'info', 'branch_create')
      await updateRunState('creating_pr')

      try {
        const { sha } = await getDefaultBranchSha(owner, repo)
        await createBranch(owner, repo, branchName, sha)
        await log(`✅ Branch created: ${branchName}`, 'success', 'branch_ok')

        const planFilePath = `.codehive/plans/${runId}.md`
        await log(`📤 Committing plan to ${planFilePath}...`, 'info', 'plan_commit')
        await createOrUpdateFile(
          owner,
          repo,
          planFilePath,
          planResult.markdown,
          branchName,
          `docs: CodeHive Plan — ${planResult.title}`,
        )
        await log(
          '✅ Plan file committed (documentation only — no source changes)',
          'success',
          'plan_committed',
        )

        await log('🔀 Opening GitHub Pull Request...', 'info', 'pr_create')
        prUrl = await createPullRequest(
          owner,
          repo,
          `CodeHive Plan: ${planResult.title}`,
          planResult.markdown,
          branchName,
          repoMetadata.defaultBranch,
        )
        await log(`✅ PR opened: ${prUrl}`, 'success', 'pr_ok', { prUrl })
      } catch (githubErr) {
        const msg = githubErr instanceof Error ? githubErr.message : String(githubErr)
        await log(
          `⚠️ GitHub operation warning: ${msg} — plan is still saved in D1`,
          'warn',
          'github_warn',
        )
      }

      updateState('PR_CREATED')

      // ── Finalise run ─────────────────────────────────────────────────────
      await payload.update({
        collection: 'agent-runs',
        id: runId,
        data: {
          status: 'completed',
          branchName,
          prUrl: prUrl || undefined,
          durationMs: Date.now() - startedAt,
        },
        overrideAccess: true,
      })

      await log(
        '🎉 Planning pipeline complete — plan created, branch opened, NO source code modified.',
        'success',
        'pipeline_complete',
      )

      send({
        type: 'complete',
        runId,
        prUrl,
        branchName,
        planTitle: planResult.title,
        riskLevel: riskReport?.riskLevel ?? null,
        riskScore: riskReport?.riskScore ?? null,
        message: 'Planning pipeline complete',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      send({ type: 'error', message: `Pipeline error: ${message}` })

      if (runId) {
        try {
          await payload.update({
            collection: 'agent-runs',
            id: runId,
            data: { status: 'failed', errorMessage: message.slice(0, 500) },
            overrideAccess: true,
          })
        } catch {
          /* ignore secondary error */
        }
      }
    } finally {
      writer.close()
    }
  })()

  return response
}
