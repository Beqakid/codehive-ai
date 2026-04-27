/**
 * @module github
 * @description GitHub REST API utilities using native fetch (no extra dependencies).
 * Provides repo context fetching, branch creation, file commits, and PR creation.
 * Exports: parseGithubUrl, getRepoContext, getDefaultBranchSha, createBranch,
 * createOrUpdateFile, createPullRequest, RepoContext, RepoFile.
 * @note All mutating operations check response status and throw on failure.
 */

export interface RepoFile {
  path: string
  content: string
}

export interface RepoContext {
  owner: string
  repo: string
  description: string
  structure: string
  files: RepoFile[]
}

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'codehive-ai/2.0',
  }
}

export function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/)
  if (!match) return null
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

export async function getRepoContext(owner: string, repo: string): Promise<RepoContext> {
  const headers = githubHeaders()

  const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  const repoData = repoResp.ok
    ? ((await repoResp.json()) as { description?: string })
    : {}

  const contentsResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/`, {
    headers,
  })
  const contents = contentsResp.ok
    ? ((await contentsResp.json()) as Array<{ name: string; type: string; path: string }>)
    : []

  const structure: string[] = []
  const files: RepoFile[] = []
  const textFiles = [
    'README.md',
    'README.txt',
    'package.json',
    'index.ts',
    'index.js',
    'main.ts',
    'main.py',
    'app.py',
  ]

  for (const item of contents) {
    structure.push(`${item.type === 'dir' ? '📁' : '📄'} ${item.name}`)
    if (item.type === 'file' && textFiles.includes(item.name)) {
      const fileResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}`,
        { headers },
      )
      if (fileResp.ok) {
        const fileData = (await fileResp.json()) as { content?: string }
        if (fileData.content) {
          const decoded = atob(fileData.content.replace(/\n/g, ''))
          files.push({ path: item.path, content: decoded.substring(0, 3000) })
        }
      }
    }
  }

  return {
    owner,
    repo,
    description: (repoData as { description?: string }).description || 'No description provided',
    structure: structure.join('\n') || 'Empty repository',
    files,
  }
}

export async function getDefaultBranchSha(
  owner: string,
  repo: string,
): Promise<{ branch: string; sha: string }> {
  const headers = githubHeaders()

  const repoResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers })
  if (!repoResp.ok) {
    throw new Error(`GitHub getDefaultBranchSha: repo fetch failed (${repoResp.status})`)
  }
  const repoData = (await repoResp.json()) as { default_branch: string }
  const defaultBranch = repoData.default_branch || 'main'

  const refResp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers },
  )
  if (!refResp.ok) {
    throw new Error(`GitHub getDefaultBranchSha: ref fetch failed (${refResp.status})`)
  }
  const refData = (await refResp.json()) as { object: { sha: string } }

  return { branch: defaultBranch, sha: refData.object.sha }
}

export async function createBranch(
  owner: string,
  repo: string,
  branchName: string,
  sha: string,
): Promise<void> {
  const headers = githubHeaders()
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  })
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => 'unknown')
    throw new Error(`GitHub createBranch failed (${resp.status}): ${errBody.slice(0, 200)}`)
  }
}

function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
  } catch {
    return btoa(str)
  }
}

export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  branch: string,
  message: string,
): Promise<void> {
  const headers = githubHeaders()

  // Check if file already exists to get its sha (required for updates)
  let sha: string | undefined
  try {
    const existResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      { headers },
    )
    if (existResp.ok) {
      const existData = (await existResp.json()) as { sha?: string }
      sha = existData.sha
    }
  } catch {
    // File doesn't exist — will be created fresh
  }

  const body: Record<string, string> = { message, content: toBase64(content), branch }
  if (sha) body.sha = sha

  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => 'unknown')
    throw new Error(`GitHub createOrUpdateFile failed (${resp.status}): ${errBody.slice(0, 200)}`)
  }
}

export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<string> {
  const headers = githubHeaders()
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title, body, head, base }),
  })
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => 'unknown')
    throw new Error(`GitHub createPullRequest failed (${resp.status}): ${errBody.slice(0, 200)}`)
  }
  const data = (await resp.json()) as { html_url: string }
  return data.html_url || ''
}
