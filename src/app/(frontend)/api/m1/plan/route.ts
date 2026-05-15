/**
 * POST /api/m1/plan
 *
 * Milestone 1 SSE pipeline. Accepts a project ID + user request.
 * Streams log events to the client while:
 *  1. Validating GitHub access
 *  2. Fetching repo metadata + file tree + key files
 *  3. Running the planning agent (AI, no code gen)
 *  4. Saving the plan to D1
 *  5. Creating a branch + PR in the target repo (docs-only)
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
        message: '🐝 CodeHive Milestone 1 — Planning pipeline started',
      })

      // ── Resolve project ────────────────────────────────────────────────────
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

      // Determine owner/repo: prefer explicit body params → project fields → parse repoUrl
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

      // ── Create coding_request ──────────────────────────────────────────────
      const codingRequest = await payload.create({
        collection: 'coding-requests',
        data: {
          title: userRequest.slice(0, 100),
          description: userRequest,
          project: projectId,
          requestedBy: '1', // system placeholder — real auth not required here
          status: 'planning',
        },
        overrideAccess: true,
      })

      // ── Create agent_run ───────────────────────────────────────────────────
      const startedAt = Date.now()
      const agentRun = await payload.create({
        collection: 'agent-runs',
        data: {
          agentName: 'planner',
          runType: 'planning',
          codingRequest: String(codingRequest.id),
          status: 'running',
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

      // Helpers —— persist each log to D1 and send SSE simultaneously
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
          // Non-fatal — log persistence should not block the pipeline
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

      // ── Step 1: Validate GitHub access ─────────────────────────────────────
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
        writer.close()
        return
      }
      await log(`✅ Repository access confirmed: ${owner}/${repo}`, 'success', 'repo_access_ok')

      // ── Step 2: Fetch repo metadata ────────────────────────────────────────
      await log('📊 Fetching repository metadata...', 'info', 'repo_metadata_fetch')
      const repoMetadata = await fetchRepoMetadata(owner, repo)
      await log(
        `✅ ${repoMetadata.fullName} · branch: ${repoMetadata.defaultBranch} · language: ${repoMetadata.language || 'Unknown'}`,
        'success',
        'repo_metadata_ok',
        { repoMetadata },
      )

      // ── Step 3: Fetch file tree ────────────────────────────────────────────
      await log('🌳 Fetching repository file tree...', 'info', 'file_tree_fetch')
      const { tree, formatted: fileTree, truncated } = await fetchFileTree(
        owner,
        repo,
        repoMetadata.defaultBranch,
      )
      const blobCount = tree.filter((t) => t.type === 'blob').length
      await log(
        `✅ File tree fetched: ${blobCount} files${truncated ? ' (tree was truncated at 300 entries)' : ''}`,
        'success',
        'file_tree_ok',
      )

      // ── Step 4: Read key files ─────────────────────────────────────────────
      await log('📄 Reading key source files...', 'info', 'key_files_fetch')
      const keyFiles = await fetchKeyFiles(owner, repo, repoMetadata.defaultBranch)
      await log(
        `✅ Read ${keyFiles.length} key files: ${keyFiles.map((f) => f.path).join(', ') || 'none found'}`,
        'success',
        'key_files_ok',
      )

      // ── Step 5: Run planning agent ─────────────────────────────────────────
      await log('🧠 Starting AI planning agent...', 'info', 'planner_start')
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
      })
      await log(`✅ Plan generated: "${planResult.title}"`, 'success', 'plan_generated')

      // ── Step 6: Save plan to D1 ────────────────────────────────────────────
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
          },
        },
        overrideAccess: true,
      })
      await log('💾 Plan saved to database', 'success', 'plan_saved')

      // ── Step 7: Create GitHub branch ───────────────────────────────────────
      const branchName = `codehive/plan-${runId}`
      let prUrl = ''

      await log(`🌿 Creating branch: ${branchName}`, 'info', 'branch_create')
      try {
        const { sha } = await getDefaultBranchSha(owner, repo)
        await createBranch(owner, repo, branchName, sha)
        await log(`✅ Branch created: ${branchName}`, 'success', 'branch_ok')

        // ── Step 8: Commit plan markdown ───────────────────────────────────
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
        await log('✅ Plan file committed (documentation only — no source changes)', 'success', 'plan_committed')

        // ── Step 9: Open Pull Request ──────────────────────────────────────
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
        // Non-fatal — plan is already persisted
      }

      // ── Finalise run ───────────────────────────────────────────────────────
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
        '🎉 Milestone 1 complete — plan created, branch opened, NO source code modified.',
        'success',
        'pipeline_complete',
      )

      send({
        type: 'complete',
        runId,
        prUrl,
        branchName,
        planTitle: planResult.title,
        message: 'Milestone 1 planning pipeline complete',
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
