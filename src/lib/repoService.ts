/**
 * @module repoService
 * @description Milestone 1 GitHub repository operations.
 * Validates access, fetches metadata, file tree, and key file contents.
 * No write operations here — all reads are safe and idempotent.
 */

import { parseGithubUrl } from './github'

export { parseGithubUrl as parseRepoUrl }

export interface RepoMetadata {
  owner: string
  repo: string
  fullName: string
  description: string
  defaultBranch: string
  language: string | null
  stars: number
  isPrivate: boolean
  url: string
}

export interface FileTreeEntry {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export interface RepoFile {
  path: string
  content: string
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

/** Returns true if the token can read the given repo. */
export async function validateRepoAccess(owner: string, repo: string): Promise<boolean> {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(),
  })
  return resp.ok
}

/** Returns rich metadata about a repository. */
export async function fetchRepoMetadata(owner: string, repo: string): Promise<RepoMetadata> {
  const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(),
  })
  if (!resp.ok) {
    throw new Error(`fetchRepoMetadata: GitHub returned ${resp.status} for ${owner}/${repo}`)
  }
  const data = (await resp.json()) as {
    full_name: string
    description: string | null
    default_branch: string
    language: string | null
    stargazers_count: number
    private: boolean
    html_url: string
  }
  return {
    owner,
    repo,
    fullName: data.full_name,
    description: data.description || 'No description',
    defaultBranch: data.default_branch || 'main',
    language: data.language,
    stars: data.stargazers_count || 0,
    isPrivate: data.private,
    url: data.html_url,
  }
}

/**
 * Fetches the full recursive file tree using the Git Trees API.
 * Returns both the raw entries and a formatted string representation.
 */
export async function fetchFileTree(
  owner: string,
  repo: string,
  branch?: string,
  maxFiles = 300,
): Promise<{ tree: FileTreeEntry[]; formatted: string; truncated: boolean }> {
  const headers = githubHeaders()

  const ref = branch || (await fetchRepoMetadata(owner, repo)).defaultBranch

  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { headers },
  )
  if (!resp.ok) {
    throw new Error(`fetchFileTree: GitHub returned ${resp.status} for ${owner}/${repo}@${ref}`)
  }
  const data = (await resp.json()) as {
    tree: Array<{ path: string; type: string; size?: number }>
    truncated: boolean
  }

  const tree: FileTreeEntry[] = data.tree
    .filter((item) => item.path && !item.path.startsWith('.git/'))
    .slice(0, maxFiles)
    .map((item) => ({
      path: item.path,
      type: item.type as 'blob' | 'tree',
      size: item.size,
    }))

  const blobs = tree.filter((t) => t.type === 'blob').map((t) => t.path)
  const formatted = blobs.slice(0, 150).join('\n') + (data.truncated ? '\n... (truncated)' : '')

  return { tree, formatted, truncated: data.truncated }
}

/**
 * Reads the contents of specific files from a repo.
 * Falls back gracefully — missing files are silently skipped.
 * Content is capped at 5 000 chars per file to stay within context limits.
 */
export async function fetchKeyFiles(
  owner: string,
  repo: string,
  branch?: string,
  paths?: string[],
): Promise<RepoFile[]> {
  const headers = githubHeaders()
  const ref = branch || (await fetchRepoMetadata(owner, repo)).defaultBranch

  const defaultPaths = [
    'README.md',
    'README.txt',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'src/index.ts',
    'src/main.ts',
    'src/App.tsx',
    'src/app/page.tsx',
    'src/app/layout.tsx',
    'requirements.txt',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    'Makefile',
    'docker-compose.yml',
    '.env.example',
  ]

  const targetPaths = paths || defaultPaths
  const results: RepoFile[] = []

  for (const filePath of targetPaths) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
        { headers },
      )
      if (!resp.ok) continue
      const fileData = (await resp.json()) as { content?: string; size?: number; type?: string }
      if (fileData.type !== 'file' || !fileData.content) continue
      if ((fileData.size || 0) > 100_000) continue // skip very large files
      const decoded = atob(fileData.content.replace(/\n/g, ''))
      results.push({ path: filePath, content: decoded.slice(0, 5000) })
    } catch {
      // File doesn't exist — skip silently
    }
  }

  return results
}
