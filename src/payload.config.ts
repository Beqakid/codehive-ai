import fs from 'fs'
import path from 'path'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { CloudflareContext, getCloudflareContext } from '@opennextjs/cloudflare'
import { GetPlatformProxyOptions } from 'wrangler'
import { r2Storage } from '@payloadcms/storage-r2'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Projects } from './collections/Projects'
import { CodingRequests } from './collections/CodingRequests'
import { AgentPlans } from './collections/AgentPlans'
import { AgentRuns } from './collections/AgentRuns'
import { AgentLogs } from './collections/AgentLogs'
import { ToolConnections } from './collections/ToolConnections'
import { Commands } from './collections/Commands'
import { Runs } from './collections/Runs'
import { FixAttempts } from './collections/FixAttempts'
import { ProjectMemory } from './collections/ProjectMemory'
import { LessonsLearned } from './collections/LessonsLearned'
import { RepoIntelligence } from './collections/RepoIntelligence'
import { RunRiskReports } from './collections/RunRiskReports'
import { PatchRuns } from './collections/PatchRuns'
import { ValidationResults } from './collections/ValidationResults'
import { SandboxRuns } from './collections/SandboxRuns'
import { RollbackPlans } from './collections/RollbackPlans'
import { ReviewGateEvents } from './collections/ReviewGateEvents'
import { SelfHealAttempts } from './collections/SelfHealAttempts'
import { WorkspaceRuns } from './collections/WorkspaceRuns'
import { ExecutionSteps } from './collections/ExecutionSteps'
import { ArtifactRecords } from './collections/ArtifactRecords'
import { ReplaySessions } from './collections/ReplaySessions'
import { HealingAttempts } from './collections/HealingAttempts'
import { CommandExecutions } from './collections/CommandExecutions'
import { WorkspaceSnapshots } from './collections/WorkspaceSnapshots'
import { RepoMemories } from './collections/RepoMemories'
import { ProjectRules } from './collections/ProjectRules'
import { LearnedFixes } from './collections/LearnedFixes'
import { FailurePatterns } from './collections/FailurePatterns'
import { AgentVerdicts } from './collections/AgentVerdicts'
import { AsyncRuns } from './collections/AsyncRuns'
import { AsyncRunSteps } from './collections/AsyncRunSteps'
import { RunEvents } from './collections/RunEvents'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const realpath = (value: string) => (fs.existsSync(value) ? fs.realpathSync(value) : undefined)

const isCLI = process.argv.some((value) => realpath(value)?.endsWith(path.join('payload', 'bin.js')))
const isProduction = process.env.NODE_ENV === 'production'

const createLog =
  (level: string, fn: typeof console.log) => (objOrMsg: object | string, msg?: string) => {
    if (typeof objOrMsg === 'string') {
      fn(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      fn(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }

const cloudflareLogger = {
  level: process.env.PAYLOAD_LOG_LEVEL || 'info',
  trace: createLog('trace', console.debug),
  debug: createLog('debug', console.debug),
  info: createLog('info', console.log),
  warn: createLog('warn', console.warn),
  error: createLog('error', console.error),
  fatal: createLog('fatal', console.error),
  silent: () => {},
} as unknown as Parameters<typeof buildConfig>[0]['logger']

const cloudflare =
  isCLI || !isProduction
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Projects,
    CodingRequests,
    AgentPlans,
    AgentRuns,
    AgentLogs,       // ← Milestone 1 addition
    ToolConnections,
    Commands,
    Runs,
    FixAttempts,
    ProjectMemory,
    LessonsLearned,
    RepoIntelligence,   // ← Milestone 2 addition
    RunRiskReports,     // ← Milestone 2 addition
    PatchRuns,          // ← Milestone 3 addition
    ValidationResults,  // ← Milestone 3 addition
    SandboxRuns,        // ← Milestone 3 addition
    RollbackPlans,      // ← Milestone 3 addition
    ReviewGateEvents,   // ← Milestone 3 addition
    SelfHealAttempts,   // ← Milestone 3 addition
    WorkspaceRuns,      // ← Milestone 4 addition
    ExecutionSteps,     // ← Milestone 4 addition
    ArtifactRecords,    // ← Milestone 4 addition
    ReplaySessions,     // ← Milestone 4 addition
    HealingAttempts,    // ← Milestone 4 addition
    CommandExecutions,  // ← Milestone 4 addition
    WorkspaceSnapshots, // ← Milestone 4 addition
    RepoMemories,       // ← Milestone 5 addition
    ProjectRules,       // ← Milestone 5 addition
    LearnedFixes,       // ← Milestone 5 addition
    FailurePatterns,    // ← Milestone 5 addition
    AgentVerdicts,      // ← Milestone 5 addition
    AsyncRuns,          // ← Milestone 6 addition
    AsyncRunSteps,      // ← Milestone 6 addition
    RunEvents,          // ← Milestone 6 addition
  ],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  logger: isProduction ? cloudflareLogger : undefined,
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: { media: true },
    }),
  ],
})

// Adapted from https://github.com/opennextjs/opennextjs-cloudflare/blob/d00b3a13e42e65aad76fba41774815726422cc39/packages/cloudflare/src/api/cloudflare-context.ts#L328C36-L328C46
function getCloudflareContextFromWrangler(): Promise<CloudflareContext> {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) =>
      getPlatformProxy({
        environment: process.env.CLOUDFLARE_ENV,
        remoteBindings: isProduction,
      } satisfies GetPlatformProxyOptions),
  )
}
