/**
 * Sandbox Agent — Phase 4
 *
 * Polls GitHub Actions for the workflow run triggered by code gen commits on a PR branch.
 * If no run is found after initial check, pushes a trigger file to guarantee a push event.
 * Streams status events back so the UI can show live progress.
 */

export type SandboxSSEEvent =
  | { type: 'start'; message: string }
  | { type: 'waiting'; message: string; attempt: number }
  | { type: 'running'; message: string; step?: string }
  | { type: 'step'; name: string; status: 'queued' | 'in_progress' | 'completed'; conclusion?: string }
  | { type: 'done'; success: boolean; logsUrl: string; message: string }
  | { type: 'error'; message: string }

interface WorkflowRun {
  id: number
  status: string
  conclusion: string | null
  html_url: string
  name: string
  created_at: string
  jobs_url: string
}

interface WorkflowJob {
  id: number
  name: string
  status: string
  conclusion: string | null
  steps: Array<{
    name: string
    status: string
    conclusion: string | null
    number: number
  }>
}

const INITIAL_CHECK_ATTEMPTS = 3  // Quick check if run already exists
const MAX_WAIT_ATTEMPTS = 30      // 30 × 5s = 2.5 min max wait after trigger
const POLL_INTERVAL_MS = 5000     // poll every 5 seconds
const MAX_POLL_ATTEMPTS = 60      // 60 × 5s = 5 min max for run to complete

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ghFetch(url: string, token: string | undefined, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/4.0',
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(url, { ...options, headers })
}

async function findWorkflowRun(
  owner: string,
  repo: string,
  branch: string,
  token: string | undefined,
): Promise<WorkflowRun | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`
  const resp = await ghFetch(url, token)
  if (!resp.ok) return null
  const data = (await resp.json()) as { workflow_runs: WorkflowRun[] }
  if (data.workflow_runs && data.workflow_runs.length > 0) {
    return data.workflow_runs[0]
  }
  return null
}

async function triggerPush(
  owner: string,
  repo: string,
  branch: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false

  // Push a small trigger file to create a push event
  const path = '.sandbox-trigger'
  const content = btoa(`sandbox-run-${Date.now()}`)

  // First check if file already exists (to get sha for update)
  const getResp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    token,
  )
  let sha: string | undefined
  if (getResp.ok) {
    const existing = (await getResp.json()) as { sha: string }
    sha = existing.sha
  }

  const body: Record<string, unknown> = {
    message: '🧪 trigger sandbox workflow',
    content,
    branch,
  }
  if (sha) body.sha = sha

  const putResp = await ghFetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )

  return putResp.ok
}

export async function runSandboxAgent(
  owner: string,
  repo: string,
  branch: string,
  onEvent: (event: SandboxSSEEvent) => void,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN

  onEvent({ type: 'start', message: `🔍 Looking for GitHub Actions run on branch: ${branch}` })

  // 1. Quick check — maybe a run already exists from the code gen push
  let run: WorkflowRun | null = null
  for (let attempt = 1; attempt <= INITIAL_CHECK_ATTEMPTS; attempt++) {
    run = await findWorkflowRun(owner, repo, branch, token)
    if (run) break
    onEvent({
      type: 'waiting',
      message: `⏳ Checking for existing workflow run... (${attempt}/${INITIAL_CHECK_ATTEMPTS})`,
      attempt,
    })
    await sleep(POLL_INTERVAL_MS)
  }

  // 2. If no run found, trigger one by pushing a file
  if (!run) {
    onEvent({ type: 'waiting', message: '🔧 No workflow run found — triggering one now...', attempt: 0 })

    const triggered = await triggerPush(owner, repo, branch, token)
    if (!triggered) {
      onEvent({
        type: 'error',
        message: '❌ Could not trigger workflow. Check that GITHUB_TOKEN has repo access.',
      })
      return
    }

    onEvent({ type: 'waiting', message: '✅ Push sent — waiting for GitHub Actions to pick it up...', attempt: 0 })

    // Wait for the triggered run to appear
    for (let attempt = 1; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
      run = await findWorkflowRun(owner, repo, branch, token)
      if (run) break

      onEvent({
        type: 'waiting',
        message: `⏳ Waiting for workflow to start... (${attempt}/${MAX_WAIT_ATTEMPTS})`,
        attempt,
      })
      await sleep(POLL_INTERVAL_MS)
    }
  }

  if (!run) {
    onEvent({
      type: 'error',
      message:
        '❌ No GitHub Actions workflow found after triggering. Make sure sandbox.yml is committed to the main branch of the target repo and the push event matches the branch pattern.',
    })
    return
  }

  onEvent({ type: 'running', message: `🚀 Workflow run found! ID: ${run.id} — polling for completion...` })

  // 3. Poll until the run completes
  let pollRun = run
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    if (pollRun.status === 'completed') break

    await sleep(POLL_INTERVAL_MS)

    const runResp = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${pollRun.id}`,
      token,
    )
    if (!runResp.ok) continue
    pollRun = (await runResp.json()) as WorkflowRun

    // Also fetch jobs for live step updates
    const jobsResp = await ghFetch(pollRun.jobs_url, token)
    if (jobsResp.ok) {
      const jobsData = (await jobsResp.json()) as { jobs: WorkflowJob[] }
      for (const job of jobsData.jobs) {
        for (const step of job.steps) {
          if (step.status === 'in_progress' || step.status === 'completed') {
            onEvent({
              type: 'step',
              name: step.name,
              status: step.status as 'queued' | 'in_progress' | 'completed',
              conclusion: step.conclusion ?? undefined,
            })
          }
        }
      }
    }

    onEvent({
      type: 'running',
      message: `⚙️ Workflow ${pollRun.status}... (${attempt * 5}s elapsed)`,
    })
  }

  // 4. Final result
  if (pollRun.status !== 'completed') {
    onEvent({
      type: 'error',
      message: `⏰ Workflow timed out after 5 minutes. Check status manually: ${pollRun.html_url}`,
    })
    return
  }

  const success = pollRun.conclusion === 'success'
  const emoji = success ? '✅' : '❌'
  onEvent({
    type: 'done',
    success,
    logsUrl: pollRun.html_url,
    message: `${emoji} Workflow ${pollRun.conclusion} — ${success ? 'All tests passed!' : 'Tests failed. Check logs.'}`,
  })
}
