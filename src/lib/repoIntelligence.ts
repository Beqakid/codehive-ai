/**
 * @module repoIntelligence
 * @description Milestone 2 — Repository intelligence scanner.
 * Deeply analyzes a GitHub repository: structure, frameworks, auth systems,
 * env vars, route patterns, and config files.
 * All operations are READ-ONLY. No writes to target repos.
 */

import type { FileTreeEntry, RepoFile } from './repoService'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type FileType =
  | 'auth'
  | 'api'
  | 'component'
  | 'collection'
  | 'migration'
  | 'config'
  | 'workflow'
  | 'worker'
  | 'test'
  | 'docs'
  | 'lock'
  | 'asset'
  | 'other'

export type FilePriority = 'HIGH' | 'MEDIUM' | 'LOW'

export interface FileMapEntry {
  filePath: string
  fileType: FileType
  priority: FilePriority
  isProtected: boolean
  protectionReason?: string
  estimatedLineCount?: number
}

export interface DependencyEdge {
  sourceFile: string
  targetFile: string
  edgeType: 'import' | 'export' | 'dynamic' | 'config-ref'
}

export interface RepoIntelligenceResult {
  owner: string
  repo: string
  frameworkSummary: string
  architectureSummary: string
  techStack: string[]
  importantFiles: string[]
  protectedAreas: string[]
  envVarsDetected: string[]
  routeStructure: string[]
  authSystem: string | null
  fileMap: FileMapEntry[]
  dependencyEdges: DependencyEdge[]
  lastIndexedAt: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Framework detection
// ─────────────────────────────────────────────────────────────────────────────

const FRAMEWORK_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /next\.config\.(ts|js|mjs)/, name: 'Next.js' },
  { pattern: /payload\.config\.(ts|js)/, name: 'Payload CMS' },
  { pattern: /vite\.config\.(ts|js)/, name: 'Vite' },
  { pattern: /nuxt\.config\.(ts|js)/, name: 'Nuxt' },
  { pattern: /remix\.config\.(js|ts)/, name: 'Remix' },
  { pattern: /astro\.config\.(mjs|ts)/, name: 'Astro' },
  { pattern: /svelte\.config\.(js|ts)/, name: 'SvelteKit' },
  { pattern: /wrangler\.(toml|jsonc|json)/, name: 'Cloudflare Workers' },
  { pattern: /supabase\/config\.toml/, name: 'Supabase' },
  { pattern: /prisma\/schema\.prisma/, name: 'Prisma' },
  { pattern: /drizzle\.config\.(ts|js)/, name: 'Drizzle ORM' },
  { pattern: /tailwind\.config\.(ts|js|cjs)/, name: 'Tailwind CSS' },
  { pattern: /\.storybook\//, name: 'Storybook' },
]

const AUTH_PATTERNS: Array<{ pattern: RegExp; system: string }> = [
  { pattern: /next-auth|NextAuth|authOptions/i, system: 'NextAuth.js' },
  { pattern: /supabase.*auth|createClient.*supabase/i, system: 'Supabase Auth' },
  { pattern: /payload.*auth|payload\.auth\(\)/i, system: 'Payload CMS Auth' },
  { pattern: /clerk\.(com|dev)|ClerkProvider/i, system: 'Clerk' },
  { pattern: /auth0|Auth0Provider/i, system: 'Auth0' },
  { pattern: /firebase.*auth|getAuth\(\)/i, system: 'Firebase Auth' },
  { pattern: /passport\.js|passportjs/i, system: 'Passport.js' },
  { pattern: /lucia-auth|lucia\/adapter/i, system: 'Lucia Auth' },
  { pattern: /better-auth|BetterAuth/i, system: 'Better Auth' },
]

// ─────────────────────────────────────────────────────────────────────────────
// File classification
// ─────────────────────────────────────────────────────────────────────────────

export function classifyFile(filePath: string): { fileType: FileType; priority: FilePriority } {
  const lower = filePath.toLowerCase()
  const name = lower.split('/').pop() ?? lower

  // Tests
  if (name.endsWith('.test.ts') || name.endsWith('.spec.ts') || lower.includes('__tests__'))
    return { fileType: 'test', priority: 'MEDIUM' }

  // Workflow / CI
  if (lower.startsWith('.github/workflows/') || name === 'deploy.yml' || name === 'ci.yml')
    return { fileType: 'workflow', priority: 'HIGH' }

  // Worker / Wrangler
  if (name === 'wrangler.toml' || name === 'wrangler.jsonc' || name === 'wrangler.json')
    return { fileType: 'worker', priority: 'HIGH' }

  // Migrations
  if (lower.includes('migration') || lower.includes('migrate') || lower.includes('/migrations/'))
    return { fileType: 'migration', priority: 'HIGH' }

  // Auth
  if (
    lower.includes('auth') ||
    lower.includes('session') ||
    lower.includes('jwt') ||
    lower.includes('token') ||
    lower.includes('permission') ||
    lower.includes('roles') ||
    lower.includes('rbac')
  )
    return { fileType: 'auth', priority: 'HIGH' }

  // Payload collections
  if (lower.includes('/collections/') && (name.endsWith('.ts') || name.endsWith('.js')))
    return { fileType: 'collection', priority: 'HIGH' }

  // API routes
  if (lower.includes('/api/') && name === 'route.ts')
    return { fileType: 'api', priority: 'HIGH' }

  // Config files
  if (
    name === 'package.json' ||
    name === 'tsconfig.json' ||
    name === 'next.config.ts' ||
    name === 'next.config.js' ||
    name === 'vite.config.ts' ||
    name === 'payload.config.ts' ||
    name === '.eslintrc.json' ||
    name === 'tailwind.config.ts'
  )
    return { fileType: 'config', priority: 'HIGH' }

  // Env / secrets
  if (name === '.env' || name === '.env.example' || name.startsWith('.env.'))
    return { fileType: 'config', priority: 'HIGH' }

  // UI components
  if (
    lower.includes('/components/') ||
    name.endsWith('.tsx') ||
    lower.includes('/pages/') ||
    lower.includes('/app/')
  )
    return { fileType: 'component', priority: 'MEDIUM' }

  // Docs
  if (name.endsWith('.md') || name.endsWith('.mdx') || lower.startsWith('docs/'))
    return { fileType: 'docs', priority: 'LOW' }

  // Lock files / generated
  if (
    name === 'package-lock.json' ||
    name === 'yarn.lock' ||
    name === 'pnpm-lock.yaml' ||
    lower.includes('.min.') ||
    lower.includes('dist/') ||
    lower.includes('.next/')
  )
    return { fileType: 'lock', priority: 'LOW' }

  // Assets
  if (
    name.endsWith('.svg') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg') ||
    name.endsWith('.webp') ||
    name.endsWith('.ico') ||
    name.endsWith('.woff2')
  )
    return { fileType: 'asset', priority: 'LOW' }

  return { fileType: 'other', priority: 'MEDIUM' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency edge extraction (static import parsing)
// ─────────────────────────────────────────────────────────────────────────────

export function extractDependencyEdges(
  filePath: string,
  fileContent: string,
): DependencyEdge[] {
  const edges: DependencyEdge[] = []
  // Match: import ... from 'path'  and  require('path')
  const importRegex = /(?:import\s[^'"]*from\s|require\s*\(\s*)['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null

  while ((m = importRegex.exec(fileContent)) !== null) {
    const target = m[1]
    if (!target) continue
    // Skip node_modules
    if (!target.startsWith('.') && !target.startsWith('/') && !target.startsWith('@/')) continue

    edges.push({
      sourceFile: filePath,
      targetFile: target,
      edgeType: 'import',
    })
  }

  // Dynamic imports: import('path')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((m = dynamicRegex.exec(fileContent)) !== null) {
    const target = m[1]
    if (!target) continue
    if (!target.startsWith('.') && !target.startsWith('/') && !target.startsWith('@/')) continue

    edges.push({
      sourceFile: filePath,
      targetFile: target,
      edgeType: 'dynamic',
    })
  }

  return edges
}

// ─────────────────────────────────────────────────────────────────────────────
// Env var detection
// ─────────────────────────────────────────────────────────────────────────────

export function detectEnvVars(content: string): string[] {
  const found = new Set<string>()
  // process.env.VARNAME
  const processEnvRe = /process\.env\.([A-Z_][A-Z0-9_]*)/g
  let m: RegExpExecArray | null
  while ((m = processEnvRe.exec(content)) !== null) {
    if (m[1]) found.add(m[1])
  }
  // import.meta.env.VARNAME (Vite)
  const importMetaRe = /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g
  while ((m = importMetaRe.exec(content)) !== null) {
    if (m[1]) found.add(m[1])
  }
  return Array.from(found)
}

// ─────────────────────────────────────────────────────────────────────────────
// Route structure detection
// ─────────────────────────────────────────────────────────────────────────────

function extractRouteStructure(tree: FileTreeEntry[]): string[] {
  const routes: string[] = []
  for (const entry of tree) {
    if (entry.type !== 'blob') continue
    const p = entry.path
    // Next.js app router
    if (p.includes('/app/') && p.endsWith('page.tsx')) {
      const route = p
        .replace(/.*\/app/, '')
        .replace('/page.tsx', '')
        .replace(/\(frontend\)\//, '/')
        .replace(/\/\(.*?\)/g, '')
        || '/'
      routes.push(route)
    }
    // Next.js pages router
    if (p.startsWith('pages/') && !p.includes('/_') && !p.includes('/api/')) {
      const route = '/' + p.replace('pages/', '').replace(/\.(tsx|ts|jsx|js)$/, '')
      routes.push(route)
    }
  }
  return [...new Set(routes)].slice(0, 30)
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth system detection
// ─────────────────────────────────────────────────────────────────────────────

function detectAuthSystem(keyFiles: RepoFile[]): string | null {
  const combined = keyFiles.map((f) => f.content).join('\n')
  for (const { pattern, system } of AUTH_PATTERNS) {
    if (pattern.test(combined)) return system
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Framework detection
// ─────────────────────────────────────────────────────────────────────────────

function detectFrameworks(tree: FileTreeEntry[]): string[] {
  const paths = tree.map((e) => e.path)
  const found: string[] = []
  for (const { pattern, name } of FRAMEWORK_PATTERNS) {
    if (paths.some((p) => pattern.test(p))) found.push(name)
  }
  return [...new Set(found)]
}

// ─────────────────────────────────────────────────────────────────────────────
// Architecture summary builder
// ─────────────────────────────────────────────────────────────────────────────

function buildArchitectureSummary(
  techStack: string[],
  authSystem: string | null,
  routeCount: number,
  fileCount: number,
  hasWorker: boolean,
): string {
  const parts: string[] = []
  if (techStack.length > 0) parts.push(`Tech stack: ${techStack.join(', ')}`)
  if (authSystem) parts.push(`Authentication: ${authSystem}`)
  if (hasWorker) parts.push('Deployment: Cloudflare Workers (edge runtime)')
  parts.push(`${fileCount} total files, ${routeCount} detected routes`)
  return parts.join('. ') + '.'
}

// ─────────────────────────────────────────────────────────────────────────────
// Main scanner
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeRepository(
  owner: string,
  repo: string,
  tree: FileTreeEntry[],
  keyFiles: RepoFile[],
): RepoIntelligenceResult {
  const techStack = detectFrameworks(tree)
  const authSystem = detectAuthSystem(keyFiles)
  const routeStructure = extractRouteStructure(tree)
  const hasWorker = tree.some((e) => /wrangler\.(toml|jsonc|json)/.test(e.path))
  const blobCount = tree.filter((e) => e.type === 'blob').length

  // File map
  const fileMap: FileMapEntry[] = tree
    .filter((e) => e.type === 'blob')
    .map((e) => {
      const { fileType, priority } = classifyFile(e.path)
      return {
        filePath: e.path,
        fileType,
        priority,
        isProtected: false, // will be enriched by protectedFiles module
      }
    })

  // Important files = HIGH priority
  const importantFiles = fileMap
    .filter((f) => f.priority === 'HIGH')
    .map((f) => f.filePath)
    .slice(0, 50)

  // Dependency edges from key files
  const dependencyEdges: DependencyEdge[] = []
  for (const kf of keyFiles) {
    const edges = extractDependencyEdges(kf.path, kf.content)
    dependencyEdges.push(...edges)
  }

  // Env vars
  const combined = keyFiles.map((f) => f.content).join('\n')
  const envVarsDetected = detectEnvVars(combined).slice(0, 50)

  // Protected areas (directory-level)
  const protectedDirs = new Set<string>()
  for (const entry of tree) {
    const p = entry.path.toLowerCase()
    if (p.includes('/migrations/')) protectedDirs.add('Database migrations')
    if (p.startsWith('.github/')) protectedDirs.add('CI/CD configuration')
    if (p.includes('wrangler')) protectedDirs.add('Cloudflare Worker config')
    if (p.includes('/auth') || p.includes('/access') || p.includes('roles.ts'))
      protectedDirs.add('Authentication & access control')
    if (p.includes('/billing') || p.includes('/payment') || p.includes('/stripe'))
      protectedDirs.add('Payment & billing')
    if (p.includes('payload.config')) protectedDirs.add('Payload CMS configuration')
    if (p === '.env' || p.startsWith('.env.')) protectedDirs.add('Environment variables')
  }

  const architectureSummary = buildArchitectureSummary(
    techStack,
    authSystem,
    routeStructure.length,
    blobCount,
    hasWorker,
  )

  const frameworkSummary =
    techStack.length > 0
      ? `${techStack.join(' + ')} application`
      : 'TypeScript application'

  return {
    owner,
    repo,
    frameworkSummary,
    architectureSummary,
    techStack,
    importantFiles,
    protectedAreas: Array.from(protectedDirs),
    envVarsDetected,
    routeStructure,
    authSystem,
    fileMap,
    dependencyEdges,
    lastIndexedAt: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identify core / central files from dependency graph
// ─────────────────────────────────────────────────────────────────────────────

export interface CentralFile {
  filePath: string
  inboundCount: number
  isCritical: boolean
}

export function findCentralFiles(edges: DependencyEdge[]): CentralFile[] {
  const inbound = new Map<string, number>()
  for (const edge of edges) {
    const count = inbound.get(edge.targetFile) ?? 0
    inbound.set(edge.targetFile, count + 1)
  }

  return Array.from(inbound.entries())
    .filter(([, count]) => count >= 2)
    .map(([filePath, inboundCount]) => ({
      filePath,
      inboundCount,
      isCritical: inboundCount >= 5,
    }))
    .sort((a, b) => b.inboundCount - a.inboundCount)
    .slice(0, 20)
}
