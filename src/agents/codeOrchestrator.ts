/**
 * @module codeOrchestrator
 * @description Phase 3+4 code generation orchestrator. Given an approved AgentPlan,
 * parses the plan markdown to extract files, generates each via codegenAgent with streaming,
 * and commits them to the PR branch. Also bootstraps sandbox files (package.json, tsconfig, tests).
 * If the plan has no associated PR URL (e.g. PR creation failed during orchestration),
 * creates a new branch and PR before generating code.
 * Auto-provisions .github/workflows/sandbox.yml to any target repo that doesn't have it.
 * Exports: runCodeOrchestrator, CodeGenSSEEvent.
 */

import type { Payload } from 'payload'
import { runCodegenAgent, parsePlanForFiles } from './codegenAgent'
import {
  parseGithubUrl,
  createOrUpdateFile,
  getDefaultBranchSha,
  createBranch,
  createPullRequest,
} from '../lib/github'
import { withRetry } from '../lib/retry'

export type CodeGenSSEEvent =
  | { type: 'start'; message: string }
  | { type: 'file_start'; file: string; index: number; total: number }
  | { type: 'chunk'; file: string; text: string }
  | { type: 'file_done'; file: string; committed: boolean }
  | { type: 'all_done'; filesCommitted: number }
  | { type: 'error'; message: string }

// ─── Sandbox workflow YAML ────────────────────────────────────────────────────
const SANDBOX_WORKFLOW_YAML = `name: 🧪 Sandbox — Install & Test

on:
  pull_request:
    branches: ['**']
  push:
    branches: ['agent-plan/**']

jobs:
  sandbox:
    name: Run Tests
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Type check
        run: npx tsc --noEmit || true

      - name: Run tests
        run: npm test

      - name: Post result comment
        if: always() && github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const status = '${{ job.status }}';
            const emoji = status === 'success' ? '✅' : '❌';
            const runUrl = \`\${context.serverUrl}/\${context.repo.owner}/\${context.repo.repo}/actions/runs/\${context.runId}\`;
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: [
                \`## \${emoji} Sandbox Results\`,
                '',
                \`**Status:** \\\`\${status}\\\`\`,
                \`**Run:** [View full logs](\${runUrl})\`,
                '',
                status === 'success'
                  ? '> All tests passed! This branch is ready for review. 🎉'
                  : '> Tests failed. Check the logs above for details.',
              ].join('\\n'),
            });
`

// ─── Auto-provision sandbox workflow ──────────────────────────────────────────
/**
 * Checks if .github/workflows/sandbox.yml exists in the target repo.
 * If not, pushes it automatically so sandbox runs work out of the box.
 * Fails silently (warns via onEvent) if the token lacks `workflow` scope.
 */
async function ensureSandboxWorkflow(
  owner: string,
  repo: string,
  onEvent: (event: CodeGenSSEEvent) => void,
): Promise<void> {
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/3.0',
    'Content-Type': 'application/json',
  }
  if (process.env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  // Check if workflow already exists
  const checkResp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows/sandbox.yml`,
    { headers: ghHeaders },
  )

  if (checkResp.ok) {
    // Already exists — nothing to do
    onEvent({ type: 'start', message: `✅ Sandbox workflow already present in ${owner}/${repo}` })
    return
  }

  if (checkResp.status !== 404) {
    onEvent({
      type: 'start',
      message: `⚠️ Could not check sandbox workflow (${checkResp.status}) — skipping auto-provision`,
    })
    return
  }

  // 404 — need to create it
  onEvent({
    type: 'start',
    message: `🔧 Provisioning sandbox workflow in ${owner}/${repo}...`,
  })

  try {
    await createOrUpdateFile(
      owner,
      repo,
      '.github/workflows/sandbox.yml',
      SANDBOX_WORKFLOW_YAML,
      'main', // always push to default branch
      'ci: add CodeHive sandbox workflow',
    )
    onEvent({
      type: 'start',
      message: `✅ Sandbox workflow provisioned in ${owner}/${repo} — GitHub Actions ready!`,
    })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('403') || msg.includes('workflow')) {
      onEvent({
        type: 'start',
        message:
          `⚠️ Could not auto-provision sandbox workflow (token needs \'workflow\' scope). ` +
          `Please add .github/workflows/sandbox.yml to ${owner}/${repo} manually, or update your GITHUB_TOKEN with the workflow scope.`,
      })
    } else {
      onEvent({
        type: 'start',
        message: `⚠️ Sandbox workflow provision failed: ${msg} — continuing anyway`,
      })
    }
  }
}

// ─── Main orchestrator ────────────────────────────────────────────────────────
export async function runCodeOrchestrator(
  payload: Payload,
  planId: number,
  onEvent: (event: CodeGenSSEEvent) => void,
): Promise<void> {
  onEvent({ type: 'start', message: '🔍 Loading agent plan...' })

  // 1. Load AgentPlan with depth:2 to populate codingRequest
  const plan = await payload.findByID({
    collection: 'agent-plans',
    id: planId,
    depth: 2,
    overrideAccess: true,
  })

  if (!plan) throw new Error(`AgentPlan ${planId} not found`)
  if (plan.status !== 'approved')
    throw new Error(`Plan #${planId} is not approved (status: ${plan.status})`)

  const finalPlan = plan.finalPlan as Record<string, unknown> | undefined
  let prUrl = finalPlan?.prUrl as string | undefined
  const repoUrl = (finalPlan?.repoUrl as string | undefined) || ''

  const parsedRepo = repoUrl ? parseGithubUrl(repoUrl) : null
  if (!parsedRepo) throw new Error('Plan has no associated repo URL')

  // 2. Auto-provision sandbox workflow if missing
  await ensureSandboxWorkflow(parsedRepo.owner, parsedRepo.repo, onEvent)

  // Derive codingRequestId from populated codingRequest field
  const crField = plan.codingRequest as unknown as { id: number } | number
  const codingRequestId = typeof crField === 'object' && crField !== null ? crField.id : crField

  // GitHub headers
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/3.0',
    'Content-Type': 'application/json',
  }
  if (process.env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  // 3. Self-heal: if PR URL is missing, create branch + PR now
  if (!prUrl) {
    onEvent({
      type: 'start',
      message: '🔧 No PR found — creating branch and PR for code generation...',
    })

    try {
      const { branch: defaultBranch, sha } = await getDefaultBranchSha(
        parsedRepo.owner,
        parsedRepo.repo,
      )
      const branchName = `agent-plan/request-${codingRequestId}-${Date.now()}`

      await createBranch(parsedRepo.owner, parsedRepo.repo, branchName, sha)

      // Push plan markdown from Payload fields
      const ps = (plan.productSpec as { markdown?: string } | undefined)?.markdown || ''
      const ad = (plan.architectureDesign as { markdown?: string } | undefined)?.markdown || ''
      const rf = (plan.reviewFeedback as { markdown?: string } | undefined)?.markdown || ''
      const planTitle = (finalPlan?.title as string | undefined) || 'Agent Plan'
      const projectName = (finalPlan?.project as string | undefined) || 'Project'

      const planMarkdownContent = `# Agent Plan: ${planTitle}\n\n> Generated by CodeHive AI on ${new Date().toUTCString()}\n\n---\n\n## 📋 Product Specification\n\n${ps}\n\n---\n\n## 🏗️ Architecture Design\n\n${ad}\n\n---\n\n## 🔎 Review Feedback\n\n${rf}\n`

      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        `agent-plans/plan-request-${codingRequestId}.md`,
        planMarkdownContent,
        branchName,
        `feat: add AI agent plan for "${planTitle}"`,
      )

      // Create PR with retry
      const score = plan.reviewScore as number | null | undefined
      prUrl = await withRetry(
        () =>
          createPullRequest(
            parsedRepo.owner,
            parsedRepo.repo,
            `[Agent Plan] ${planTitle}`,
            `## 🤖 AI-Generated Plan\n\nThis PR was automatically created by **CodeHive AI** agents.\n\n| Field | Value |\n|---|---|\n| **Coding Request** | #${codingRequestId} |\n| **Project** | ${projectName} |\n| **Review Score** | ${score !== null && score !== undefined ? `${score}/10` : 'N/A'} |\n| **Status** | ✅ Approved |\n\nSee \`agent-plans/plan-request-${codingRequestId}.md\` for the full plan.`,
            branchName,
            defaultBranch,
          ),
        { maxRetries: 2, baseDelayMs: 2000 },
      )

      onEvent({ type: 'start', message: `✅ PR created: ${prUrl}` })

      // Store PR URL back on the plan
      await payload.update({
        collection: 'agent-plans',
        id: planId,
        overrideAccess: true,
        data: {
          finalPlan: {
            ...finalPlan,
            prUrl,
          },
        },
      })
    } catch (err) {
      throw new Error(`Failed to create PR for code generation: ${String(err)}`)
    }
  }

  // Extract PR number from URL
  const prNumMatch = prUrl.match(/\/pull\/(\d+)$/)
  if (!prNumMatch) throw new Error(`Cannot parse PR number from: ${prUrl}`)
  const prNumber = parseInt(prNumMatch[1], 10)

  onEvent({
    type: 'start',
    message: `📂 Fetching PR #${prNumber} from ${parsedRepo.owner}/${parsedRepo.repo}...`,
  })

  // 4. Get PR head branch name from GitHub
  const prResp = await fetch(
    `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/pulls/${prNumber}`,
    { headers: ghHeaders },
  )
  if (!prResp.ok) {
    throw new Error(`GitHub PR fetch failed: ${prResp.status} ${await prResp.text()}`)
  }
  const prData = (await prResp.json()) as { head: { ref: string } }
  const branchName = prData.head.ref

  onEvent({ type: 'start', message: `🌿 Branch: ${branchName}` })

  // 5. Fetch plan markdown from the PR branch
  onEvent({ type: 'start', message: '📄 Fetching plan markdown from branch...' })

  let planMarkdown = ''
  const planFilePath = `agent-plans/plan-request-${codingRequestId}.md`
  const planFileResp = await fetch(
    `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/contents/${planFilePath}?ref=${encodeURIComponent(branchName)}`,
    { headers: ghHeaders },
  )

  if (planFileResp.ok) {
    const planFileData = (await planFileResp.json()) as { content?: string }
    if (planFileData.content) {
      planMarkdown = atob(planFileData.content.replace(/\n/g, ''))
    }
  }

  // Fallback: reconstruct from Payload fields if file fetch failed
  if (!planMarkdown) {
    onEvent({ type: 'start', message: '⚠️ Using plan from database (branch file not found)' })
    const ps = (plan.productSpec as { markdown?: string } | undefined)?.markdown || ''
    const ad = (plan.architectureDesign as { markdown?: string } | undefined)?.markdown || ''
    const rf = (plan.reviewFeedback as { markdown?: string } | undefined)?.markdown || ''
    planMarkdown = `# Plan\n\n## Product Spec\n${ps}\n\n## Architecture\n${ad}\n\n## Review\n${rf}`
  }

  onEvent({ type: 'start', message: '🗂️ Parsing plan to extract files...' })

  // 6. Parse plan to get file list
  const filesToGenerate = await parsePlanForFiles(planMarkdown)

  if (filesToGenerate.length === 0) {
    throw new Error(
      'Could not extract any files from the plan. Make sure the plan lists files clearly.',
    )
  }

  onEvent({ type: 'start', message: `📋 ${filesToGenerate.length} file(s) to generate` })

  // 7. Generate each file and commit to branch
  let committed = 0

  for (let i = 0; i < filesToGenerate.length; i++) {
    const file = filesToGenerate[i]
    onEvent({ type: 'file_start', file: file.path, index: i + 1, total: filesToGenerate.length })

    try {
      let code = await runCodegenAgent(
        {
          planMarkdown,
          filePath: file.path,
          fileDescription: file.description,
        },
        (text) => onEvent({ type: 'chunk', file: file.path, text }),
      )

      // Strip markdown fences if GPT added them anyway
      code = stripCodeFences(code)

      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        file.path,
        code,
        branchName,
        `feat(codegen): implement ${file.path}`,
      )

      committed++
      onEvent({ type: 'file_done', file: file.path, committed: true })
    } catch (err) {
      onEvent({ type: 'file_done', file: file.path, committed: false })
      onEvent({ type: 'error', message: `⚠️ ${file.path}: ${String(err)}` })
      // Continue with remaining files even if one fails
    }
  }

  // 8. Phase 4 — Commit sandbox bootstrap files (package.json, tsconfig, test file)
  // Only add these if they aren't already in the generated file list
  const generatedPaths = new Set(filesToGenerate.map((f) => f.path))

  if (!generatedPaths.has('package.json')) {
    onEvent({ type: 'start', message: '📦 Adding package.json for sandbox...' })
    try {
      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        'package.json',
        buildPackageJson(),
        branchName,
        'chore: add package.json for sandbox test runner',
      )
      committed++
      onEvent({ type: 'file_done', file: 'package.json', committed: true })
    } catch (err) {
      onEvent({ type: 'error', message: `⚠️ package.json: ${String(err)}` })
    }
  }

  if (!generatedPaths.has('tsconfig.json')) {
    onEvent({ type: 'start', message: '⚙️ Adding tsconfig.json...' })
    try {
      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        'tsconfig.json',
        buildTsConfig(),
        branchName,
        'chore: add tsconfig.json for sandbox',
      )
      committed++
      onEvent({ type: 'file_done', file: 'tsconfig.json', committed: true })
    } catch (err) {
      onEvent({ type: 'error', message: `⚠️ tsconfig.json: ${String(err)}` })
    }
  }

  // Generate a test file via GPT
  const testPath = 'src/__tests__/implementation.test.ts'
  if (!generatedPaths.has(testPath)) {
    onEvent({
      type: 'file_start',
      file: testPath,
      index: filesToGenerate.length + 1,
      total: filesToGenerate.length + 1,
    })
    try {
      let testCode = await runCodegenAgent(
        {
          planMarkdown,
          filePath: testPath,
          fileDescription:
            'Jest unit tests for the implementation. Test the core functions described in the plan. Use jest mocks for external dependencies. Keep tests simple and focused.',
        },
        (text) => onEvent({ type: 'chunk', file: testPath, text }),
      )
      testCode = stripCodeFences(testCode)
      await createOrUpdateFile(
        parsedRepo.owner,
        parsedRepo.repo,
        testPath,
        testCode,
        branchName,
        'test: add unit tests for sandbox',
      )
      committed++
      onEvent({ type: 'file_done', file: testPath, committed: true })
    } catch (err) {
      onEvent({ type: 'file_done', file: testPath, committed: false })
      onEvent({ type: 'error', message: `⚠️ ${testPath}: ${String(err)}` })
    }
  }

  onEvent({ type: 'all_done', filesCommitted: committed })
}

function stripCodeFences(code: string): string {
  code = code.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```$/, '')
  return code.trim()
}

function buildPackageJson(): string {
  return JSON.stringify(
    {
      name: 'codehive-implementation',
      version: '1.0.0',
      description: 'AI-generated implementation by CodeHive',
      scripts: {
        test: 'jest --passWithNoTests',
        build: 'tsc --noEmit',
      },
      dependencies: {
        jsonwebtoken: '^9.0.2',
        bcryptjs: '^2.4.3',
        uuid: '^9.0.0',
        express: '^4.18.2',
        cors: '^2.8.5',
        'body-parser': '^1.20.2',
      },
      devDependencies: {
        '@types/bcryptjs': '^2.4.6',
        '@types/jest': '^29.5.12',
        '@types/jsonwebtoken': '^9.0.6',
        '@types/node': '^20.12.0',
        '@types/uuid': '^9.0.8',
        '@types/express': '^4.17.21',
        '@types/cors': '^2.8.17',
        jest: '^29.7.0',
        'ts-jest': '^29.1.4',
        typescript: '^5.4.5',
      },
      jest: {
        preset: 'ts-jest',
        testEnvironment: 'node',
        testMatch: ['**/__tests__/**/*.test.ts'],
        globals: {
          'ts-jest': {
            tsconfig: {
              strict: false,
            },
          },
        },
      },
    },
    null,
    2,
  )
}

function buildTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        strict: false,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: './dist',
        rootDir: './src',
        resolveJsonModule: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2,
  )
}
