import Anthropic from '@anthropic-ai/sdk'

export interface ProjectContext {
  projectId: number
  projectName: string
  projectDescription?: string
  repoOwner: string
  repoName: string
  repoUrl: string
  latestPlan?: {
    id: number
    status: string
    reviewScore?: number | null
    verdictReason?: string | null
    prBranch?: string | null
    prUrl?: string | null
    productSpec?: string
    architectureDesign?: string
    reviewFeedback?: string
    uiuxDesign?: string
  }
  fixAttempts?: Array<{
    id: number
    attemptNumber: number
    status: string
    errorCategory?: string
    errorSummary?: string
    fixSummary?: string
    confidence?: number
    needsHumanReview?: boolean
    branchName?: string
  }>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type OnEvent = (event: object) => Promise<void>

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_repo_file',
    description: 'Read the content of a specific file from the GitHub repository. Use this to inspect source code, config files, tests, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root, e.g. src/index.ts or package.json',
        },
        branch: {
          type: 'string',
          description: 'Branch name to read from. Defaults to the PR branch or main.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_repo_files',
    description: 'List files and directories in a path of the GitHub repository. Use to explore the codebase structure.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Directory path relative to repo root. Omit or use empty string for root.',
        },
        branch: {
          type: 'string',
          description: 'Branch name to read from. Defaults to the PR branch or main.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ci_status',
    description: 'Get the latest GitHub Actions workflow run statuses for this project repository.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Number of recent runs to fetch (default 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_ci_job_steps',
    description: 'Get the step-by-step details for jobs in a GitHub Actions workflow run. Shows which steps passed/failed. Use after get_ci_status to drill into a specific run.',
    input_schema: {
      type: 'object' as const,
      properties: {
        run_id: {
          type: 'number',
          description: 'GitHub Actions run ID from get_ci_status. If omitted, uses the most recent run.',
        },
      },
      required: [],
    },
  },
]

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ProjectContext,
  githubToken: string,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodeHive-AI/1.0',
  }

  const defaultBranch =
    ctx.fixAttempts?.find((fa) => fa.branchName)?.branchName ||
    ctx.latestPlan?.prBranch ||
    'main'

  if (toolName === 'read_repo_file') {
    const path = toolInput.path as string
    const branch = (toolInput.branch as string) || defaultBranch

    const tryFetch = async (ref: string) => {
      const url = `https://api.github.com/repos/${ctx.repoOwner}/${ctx.repoName}/contents/${path}?ref=${encodeURIComponent(ref)}`
      const resp = await fetch(url, { headers })
      if (!resp.ok) return null
      const data = (await resp.json()) as {
        content?: string
        encoding?: string
        type?: string
        message?: string
      }
      if (data.type === 'dir')
        return `⚠️ That path is a directory. Use list_repo_files to see its contents.`
      if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8')
      }
      return null
    }

    try {
      const content = await tryFetch(branch)
      if (content) return content.slice(0, 4000)
      if (branch !== 'main') {
        const mainContent = await tryFetch('main')
        if (mainContent) return `[from main branch]\n${mainContent.slice(0, 4000)}`
      }
      return `❌ File not found: ${path}`
    } catch (e) {
      return `❌ Error reading file: ${String(e)}`
    }
  }

  if (toolName === 'list_repo_files') {
    const path = (toolInput.path as string) || ''
    const branch = (toolInput.branch as string) || defaultBranch

    const tryFetch = async (ref: string) => {
      const url = `https://api.github.com/repos/${ctx.repoOwner}/${ctx.repoName}/contents/${path}?ref=${encodeURIComponent(ref)}`
      const resp = await fetch(url, { headers })
      if (!resp.ok) return null
      const data = (await resp.json()) as Array<{ name: string; type: string; path: string; size?: number }>
      return data
        .map((f) => {
          const icon = f.type === 'dir' ? '📁' : '📄'
          const size = f.type === 'file' && f.size ? ` (${Math.round(f.size / 1024)}KB)` : ''
          return `${icon} ${f.path}${size}`
        })
        .join('\n')
    }

    try {
      const result = await tryFetch(branch)
      if (result) return result
      if (branch !== 'main') {
        const mainResult = await tryFetch('main')
        if (mainResult) return `[from main branch]\n${mainResult}`
      }
      return `❌ Could not list directory: ${path || '(root)'}`
    } catch (e) {
      return `❌ Error listing files: ${String(e)}`
    }
  }

  if (toolName === 'get_ci_status') {
    const limit = (toolInput.limit as number) || 5
    const url = `https://api.github.com/repos/${ctx.repoOwner}/${ctx.repoName}/actions/runs?per_page=${limit}`

    try {
      const resp = await fetch(url, { headers })
      if (!resp.ok) return `❌ Could not fetch CI runs (HTTP ${resp.status})`

      const data = (await resp.json()) as {
        workflow_runs: Array<{
          id: number
          name: string
          status: string
          conclusion: string | null
          head_branch: string
          created_at: string
          html_url: string
          head_commit?: { message: string }
        }>
      }

      if (!data.workflow_runs?.length) return 'No workflow runs found for this repository.'

      const lines = data.workflow_runs.map((r) => {
        const icon =
          r.conclusion === 'success'
            ? '✅'
            : r.conclusion === 'failure'
              ? '❌'
              : r.status === 'in_progress'
                ? '🔄'
                : '⏳'
        const msg = r.head_commit?.message?.slice(0, 60) || ''
        return `${icon} Run #${r.id} | ${r.name} | Branch: ${r.head_branch} | ${r.conclusion || r.status} | ${new Date(r.created_at).toLocaleString()} | "${msg}"\n   → ${r.html_url}`
      })

      return lines.join('\n\n')
    } catch (e) {
      return `❌ Error fetching CI status: ${String(e)}`
    }
  }

  if (toolName === 'get_ci_job_steps') {
    let runId = toolInput.run_id as number | undefined

    if (!runId) {
      // Fetch latest run
      try {
        const resp = await fetch(
          `https://api.github.com/repos/${ctx.repoOwner}/${ctx.repoName}/actions/runs?per_page=1`,
          { headers },
        )
        if (resp.ok) {
          const data = (await resp.json()) as { workflow_runs: Array<{ id: number }> }
          runId = data.workflow_runs[0]?.id
        }
      } catch {}
    }

    if (!runId) return '❌ No run ID available. Use get_ci_status first to get a run ID.'

    try {
      const resp = await fetch(
        `https://api.github.com/repos/${ctx.repoOwner}/${ctx.repoName}/actions/runs/${runId}/jobs`,
        { headers },
      )
      if (!resp.ok) return `❌ Could not fetch job details (HTTP ${resp.status})`

      const data = (await resp.json()) as {
        jobs: Array<{
          id: number
          name: string
          status: string
          conclusion: string | null
          steps: Array<{
            name: string
            conclusion: string | null
            number: number
          }>
        }>
      }

      let output = `## Run #${runId} — Job Details\n\n`
      for (const job of data.jobs) {
        const jobIcon =
          job.conclusion === 'success' ? '✅' : job.conclusion === 'failure' ? '❌' : '🔄'
        output += `### ${jobIcon} Job: ${job.name} (${job.conclusion || job.status})\n`
        for (const step of job.steps) {
          const stepIcon =
            step.conclusion === 'success' ? '✅' : step.conclusion === 'failure' ? '❌' : '⏳'
          output += `  ${stepIcon} Step ${step.number}: ${step.name} (${step.conclusion || 'pending'})\n`
        }
        output += '\n'
      }

      return output
    } catch (e) {
      return `❌ Error fetching job steps: ${String(e)}`
    }
  }

  return `❌ Unknown tool: ${toolName}`
}

export async function runProjectChat(
  messages: ChatMessage[],
  ctx: ProjectContext,
  githubToken: string,
  anthropicKey: string,
  onEvent: OnEvent,
): Promise<void> {
  const client = new Anthropic({ apiKey: anthropicKey })
  const systemPrompt = buildSystemPrompt(ctx)

  // Build Anthropic message history
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Agentic loop — handles multi-step tool use
  let continueLoop = true
  let fullText = ''
  const MAX_TURNS = 6

  for (let turn = 0; turn < MAX_TURNS && continueLoop; turn++) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    let hasToolUse = false

    for (const block of response.content) {
      if (block.type === 'text') {
        fullText += block.text
        // Emit text in smaller chunks for streaming feel
        const words = block.text.split(' ')
        let chunk = ''
        for (const word of words) {
          chunk += (chunk ? ' ' : '') + word
          if (chunk.length > 30) {
            await onEvent({ type: 'chunk', text: chunk + ' ' })
            chunk = ''
          }
        }
        if (chunk) await onEvent({ type: 'chunk', text: chunk })
      } else if (block.type === 'tool_use') {
        hasToolUse = true
        await onEvent({ type: 'tool_start', tool: block.name, input: block.input, toolId: block.id })

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>,
          ctx,
          githubToken,
        )

        // Send a preview (first 300 chars) to the UI
        await onEvent({
          type: 'tool_result',
          tool: block.name,
          output: result.slice(0, 300) + (result.length > 300 ? '…' : ''),
          toolId: block.id,
        })

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        })
      }
    }

    if (hasToolUse) {
      anthropicMessages.push({ role: 'assistant', content: response.content })
      anthropicMessages.push({ role: 'user', content: toolResults })
    }

    if (response.stop_reason === 'end_turn' || !hasToolUse) {
      continueLoop = false
    }
  }

  await onEvent({ type: 'done', fullText })
}

function buildSystemPrompt(ctx: ProjectContext): string {
  const plan = ctx.latestPlan
  const fixes = ctx.fixAttempts || []

  let prompt = `You are the **Project Manager Agent** for "${ctx.projectName}" on CodeHive AI — an AI-powered code generation platform.

You are a senior engineering assistant embedded directly inside this project. You have full context on the plans, architecture, CI runs, and fix history. You can read any file in the repository.

## Your Personality
- Direct and technically precise — like a senior engineer who knows this codebase inside out
- Proactive: always suggest concrete next steps, not vague advice
- Show your work: briefly explain what you're looking up before using a tool
- Format responses cleanly with headers, bullets, and code blocks
- When you find a problem, immediately state the fix — don't just describe the problem

## Project
- **Name**: ${ctx.projectName}
${ctx.projectDescription ? `- **Description**: ${ctx.projectDescription}` : ''}
- **Repository**: \`${ctx.repoOwner}/${ctx.repoName}\`
- **GitHub**: ${ctx.repoUrl}
`

  if (plan) {
    const statusEmoji: Record<string, string> = {
      approved: '✅',
      needs_revision: '⚠️',
      draft: '📝',
      submitted: '📤',
      rejected: '❌',
    }
    const emoji = statusEmoji[plan.status] || '📋'

    prompt += `
## Latest Agent Plan (Plan #${plan.id})
- **Status**: ${emoji} ${plan.status}
${plan.reviewScore != null ? `- **Review Score**: ${plan.reviewScore}/10 (threshold: 7.5)` : ''}
${plan.prUrl ? `- **Pull Request**: ${plan.prUrl}` : ''}
${plan.prBranch ? `- **Branch**: \`${plan.prBranch}\`` : ''}
`

    if (plan.verdictReason) {
      prompt += `\n**Reviewer Concerns:**\n${plan.verdictReason.slice(0, 600)}\n`
    }

    if (plan.productSpec) {
      prompt += `\n### Product Specification (excerpt)\n${plan.productSpec.slice(0, 1200)}\n`
    }

    if (plan.architectureDesign) {
      prompt += `\n### Architecture Design (excerpt)\n${plan.architectureDesign.slice(0, 1200)}\n`
    }

    if (plan.uiuxDesign) {
      prompt += `\n### UI/UX Design (excerpt)\n${plan.uiuxDesign.slice(0, 600)}\n`
    }
  } else {
    prompt += `\n## Plans\nNo agent plans exist yet. The user needs to submit a coding request via the Command Interface.\n`
  }

  if (fixes.length > 0) {
    const failedCount = fixes.filter((f) => f.status === 'failed' || f.status === 'needs_human_review').length
    const needsHumanCount = fixes.filter((f) => f.needsHumanReview).length

    prompt += `\n## Fix Attempt History (${fixes.length} total, ${failedCount} failed, ${needsHumanCount} need human review)\n`
    for (const fix of fixes.slice(0, 5)) {
      const icon = fix.status === 'success' ? '✅' : fix.needsHumanReview ? '🚨' : '❌'
      prompt += `${icon} **Attempt #${fix.attemptNumber}**: ${fix.status}`
      if (fix.errorCategory) prompt += ` | Category: \`${fix.errorCategory}\``
      if (fix.confidence != null) prompt += ` | Confidence: ${Math.round(fix.confidence * 100)}%`
      if (fix.branchName) prompt += ` | Branch: \`${fix.branchName}\``
      prompt += '\n'
      if (fix.errorSummary) prompt += `   Error: ${fix.errorSummary.slice(0, 200)}\n`
      if (fix.fixSummary) prompt += `   Fix applied: ${fix.fixSummary.slice(0, 150)}\n`
      prompt += '\n'
    }
  } else {
    prompt += `\n## Fix Attempts\nNo fix attempts have been run yet.\n`
  }

  prompt += `
## Actions Available to the User (suggest these when relevant)
The user can take these actions on the project page:
- **Approve Plan** → unlocks code generation (if plan is in draft/needs_revision)
- **Run Codegen** → generate code from the approved plan (creates a PR)
- **Run Sandbox** → trigger GitHub Actions CI to run tests on the PR branch
- **Run Fix Loop** → auto-fix CI failures (up to 3 AI-powered attempts)
- **Interactive Fix Chat** → this conversation — you are this agent

## Guidelines
1. Always use tools to get live data before answering questions about code or CI
2. When diagnosing CI failures: use \`get_ci_status\` then \`get_ci_job_steps\` to pinpoint the failing step
3. When asked about a file: use \`read_repo_file\` immediately  
4. Suggest the right next action based on the current project state
5. If you see a fixable problem in the code, show the exact diff/replacement
6. Keep responses focused — bullets over paragraphs, precision over length
`

  return prompt
}
