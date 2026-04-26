/**
 * GitHub API utilities — Phase 2
 * Uses native fetch so no additional packages are needed.
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
  const repoData = (await repoResp.json()) as { default_branch: string }
  const defaultBranch = repoData.default_branch || 'main'

  const refResp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers },
  )
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
  await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha }),
  })
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
  await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ message, content: toBase64(content), branch }),
  })
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
  const data = (await resp.json()) as { html_url: string }
  return data.html_url || ''
}
