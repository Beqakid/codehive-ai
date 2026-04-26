/**
 * Code Orchestrator — Phase 3 + 4
 *
 * Given an approved AgentPlan ID:
 * 1. Loads the plan from Payload
 * 2. Fetches the PR head branch from GitHub
 * 3. Fetches the plan markdown from that branch
 * 4. Parses the plan to extract the files to generate
 * 5. Generates each file via codegenAgent (streaming)
 * 6. Commits each file to the PR branch
 * 7. (Phase 4) Commits package.json + tsconfig.json + a test file so the sandbox can run
 */

import type { Payload } from 'payload'
import { runCodegenAgent, parsePlanForFiles } from './codegenAgent'
import { parseGithubUrl, createOrUpdateFile } from '../lib/github'

export type CodeGenSSEEvent =
  | { type: 'start'; message: string }
  | { type: 'file_start'; file: string; index: number; total: number }
  | { type: 'chunk'; file: string; text: string }
  | { type: 'file_done'; file: string; committed: boolean }
  | { type: 'all_done'; filesCommitted: number }
  | { type: 'error'; message: string }

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
  })

  if (!plan) throw new Error(`AgentPlan ${planId} not found`)
  if (plan.status !== 'approved')
    throw new Error(`Plan #${planId} is not approved (status: ${plan.status})`)

  const finalPlan = plan.finalPlan as Record<string, unknown> | undefined
  const prUrl = finalPlan?.prUrl as string | undefined
  const repoUrl = finalPlan?.repoUrl as string | undefined

  if (!prUrl) throw new Error('Plan has no associated PR URL — run agents first')

  // Extract PR number from URL (e.g. https://github.com/owner/repo/pull/1)
  const prNumMatch = prUrl.match(/\/pull\/(\d+)$/)
  if (!prNumMatch) throw new Error(`Cannot parse PR number from: ${prUrl}`)
  const prNumber = parseInt(prNumMatch[1], 10)

  const parsedRepo = repoUrl ? parseGithubUrl(repoUrl) : null
  if (!parsedRepo) throw new Error('Plan has no associated repo URL')

  onEvent({
    type: 'start',
    message: `📂 Fetching PR #${prNumber} from ${parsedRepo.owner}/${parsedRepo.repo}...`,
  })

  // 2. Get PR head branch name from GitHub
  const ghHeaders: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/3.0',
    'Content-Type': 'application/json',
  }
  if (process.env.GITHUB_TOKEN) {
    ghHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

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

  // 3. Derive codingRequestId from populated codingRequest field
  const crField = plan.codingRequest as unknown as { id: number } | number
  const codingRequestId = typeof crField === 'object' && crField !== null ? crField.id : crField

  // 4. Fetch plan markdown from the PR branch
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

  // 5. Parse plan to get file list
  const filesToGenerate = await parsePlanForFiles(planMarkdown)

  if (filesToGenerate.length === 0) {
    throw new Error(
      'Could not extract any files from the plan. Make sure the plan lists files clearly.',
    )
  }

  onEvent({ type: 'start', message: `📋 ${filesToGenerate.length} file(s) to generate` })

  // 6. Generate each file and commit to branch
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

  // 7. Phase 4 — Commit sandbox bootstrap files (package.json, tsconfig, test file)
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
    onEvent({ type: 'file_start', file: testPath, index: filesToGenerate.length + 1, total: filesToGenerate.length + 1 })
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
      },
      devDependencies: {
        '@types/bcryptjs': '^2.4.6',
        '@types/jest': '^29.5.12',
        '@types/jsonwebtoken': '^9.0.6',
        '@types/node': '^20.12.0',
        '@types/uuid': '^9.0.8',
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
