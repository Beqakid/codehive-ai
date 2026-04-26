/**
 * Sandbox Agent — Phase 4
 *
 * Polls GitHub Actions for the workflow run triggered by code gen commits on a PR branch.
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

const MAX_WAIT_ATTEMPTS = 24   // 24 × 5s = 2 min max wait for run to appear
const POLL_INTERVAL_MS = 5000  // poll every 5 seconds
const MAX_POLL_ATTEMPTS = 36   // 36 × 5s = 3 min max for run to complete

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runSandboxAgent(
  owner: string,
  repo: string,
  branch: string,
  onEvent: (event: SandboxSSEEvent) => void,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'codehive-ai/4.0',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  onEvent({ type: 'start', message: `🔍 Looking for GitHub Actions run on branch: ${branch}` })

  // 1. Wait for a workflow run to appear on the branch
  let run: WorkflowRun | null = null
  for (let attempt = 1; attempt <= MAX_WAIT_ATTEMPTS; attempt++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=5`
    const resp = await fetch(url, { headers })

    if (resp.ok) {
      const data = (await resp.json()) as { workflow_runs: WorkflowRun[] }
      if (data.workflow_runs && data.workflow_runs.length > 0) {
        run = data.workflow_runs[0]
        break
      }
    }

    onEvent({
      type: 'waiting',
      message: `⏳ Waiting for workflow to start... (${attempt}/${MAX_WAIT_ATTEMPTS})`,
      attempt,
    })
    await sleep(POLL_INTERVAL_MS)
  }

  if (!run) {
    onEvent({
      type: 'error',
      message:
        '❌ No GitHub Actions workflow found after 2 minutes. Make sure sandbox.yml is committed to the main branch of the target repo.',
    })
    return
  }

  onEvent({ type: 'running', message: `🚀 Workflow run found! ID: ${run.id} — polling for completion...` })

  // 2. Poll until the run completes
  let pollRun = run
  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    if (pollRun.status === 'completed') break

    await sleep(POLL_INTERVAL_MS)

    const runResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${pollRun.id}`,
      { headers },
    )
    if (!runResp.ok) continue
    pollRun = (await runResp.json()) as WorkflowRun

    // Also fetch jobs for live step updates
    const jobsResp = await fetch(pollRun.jobs_url, { headers })
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

  // 3. Final result
  const success = pollRun.conclusion === 'success'
  const emoji = success ? '✅' : '❌'
  onEvent({
    type: 'done',
    success,
    logsUrl: pollRun.html_url,
    message: `${emoji} Workflow ${pollRun.conclusion ?? 'timed out'} — ${success ? 'All tests passed!' : 'Tests failed. Check logs.'}`,
  })
}
