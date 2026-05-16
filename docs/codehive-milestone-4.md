# CodeHive AI — Milestone 4: Real Execution AI Engineering Pipeline

## Overview

Milestone 4 transforms CodeHive from a **controlled patch generation platform** (M1-M3) into a **real execution AI engineering pipeline**. This is the first milestone where generated code is actually applied to real repositories, executed with real build/test/lint commands, and the results determine whether a production-ready PR is created.

## Architecture

```
Coding Request
     │
     ▼
┌─────────────────────┐
│   M3 Patch Engine    │ ← Generates patches + validates
└──────────┬──────────┘
           │
     ▼ Milestone 4 boundary ▼
           │
┌──────────▼──────────┐
│  Workspace Manager   │ ← Creates isolated workspace (GitHub branch)
│  • Clone repo        │
│  • Create temp branch│
│  • Unique workspace ID│
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│   Patch Applier      │ ← Applies diffs to real files
│  • Unified diff parse│
│  • Blocked path check│
│  • Atomic application│
│  • Pre/post snapshots│
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Execution Pipeline  │ ← Runs real commands
│  • npm/pnpm install  │
│  • lint, typecheck   │
│  • build, test       │
│  • Timeout + allowlist│
└──────────┬──────────┐
           │          │ (on failure)
           │    ┌─────▼──────────┐
           │    │ Self-Healing    │ ← Targeted auto-fix
           │    │ • Import fixes  │
           │    │ • Syntax repair │
           │    │ • Lint autofix  │
           │    │ • Max 3 attempts│
           │    └─────┬──────────┘
           │          │ (re-run pipeline)
           ◄──────────┘
           │
┌──────────▼──────────┐
│  Artifact Storage    │ ← Persist to R2
│  • Build logs        │
│  • Test reports      │
│  • Diffs, snapshots  │
│  • Signed URLs       │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Review Gates (M3)   │ ← Still enforced
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  PR Materializer     │ ← Creates production PR
│  • Push to branch    │
│  • Rich PR body      │
│  • Test results      │
│  • Rollback plan     │
│  • Artifact links    │
│  • Risk score        │
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│  Cleanup + Replay    │ ← Deterministic teardown
│  • Branch cleanup    │
│  • Timeline capture  │
│  • Failure snapshots │
└─────────────────────┘
```

## New Systems

### A. Workspace Manager (`src/lib/workspaceManager.ts`)

Creates isolated workspaces for safe code execution.

**Key concepts:**
- Each workspace gets a unique ID (`ws_<projectId>_<timestamp>_<random>`)
- Workspace = a temporary Git branch (`workspace/<workspaceId>`)
- Provider-agnostic: currently GitHub-based, future-ready for E2B, Cloudflare Sandboxes, Docker
- Timeout protection (default 10 min)
- Max size protection (default 500 MB)
- Heartbeat monitoring (optional)

**Workspace lifecycle:**
1. `creating` → clone repo, create branch
2. `ready` → workspace available
3. `patching` → patches being applied
4. `executing` → commands running
5. `completed` / `failed` → terminal state
6. `cleaning_up` → teardown in progress
7. `destroyed` → fully cleaned up

**Workspace cleanup** (`src/lib/workspaceCleanup.ts`):
- `destroyWorkspace()` — delete temp branch + update status
- `findOrphanedWorkspaces()` — detect workspaces past expiry
- `cleanupOrphanedWorkspaces()` — batch cleanup of orphans
- `getWorkspaceStats()` — operational metrics

### B. Patch Applier (`src/lib/patchApplier.ts`)

Applies generated patches to real repository files via GitHub API.

**Safety features:**
- Validates all paths against blocked file list before any writes
- Atomic application — all files commit together or none do
- Pre-patch + post-patch snapshots stored for rollback
- Supports: `add_file`, `modify_file`, `append_code`
- Rejects malformed diffs, blocked paths, and oversized patches
- Preserves original file formatting when appending

### C. Execution Pipeline (`src/lib/executionPipeline.ts`)

Runs real build/test/lint commands in the workspace context.

**Supported commands (allowlisted):**
| Command | Description | Default Timeout |
|---------|-------------|-----------------|
| `npm install` | Install dependencies | 120s |
| `pnpm install` | Install dependencies | 120s |
| `npm run lint` | Run linter | 60s |
| `npm run build` | Build project | 180s |
| `npm run test` | Run tests | 120s |
| `npx tsc --noEmit` | Typecheck | 90s |

**Execution features:**
- stdout/stderr capture for all commands
- Exit code tracking
- Per-command timeout enforcement
- Memory protection via max output limits
- Execution timing with start/end timestamps
- Command sequence with ordered step execution
- Stop-on-failure mode

### D. Artifact Storage (`src/lib/artifactStorage.ts`)

Persists execution artifacts to Cloudflare R2.

**Artifact types:**
- `build_log`, `test_report`, `lint_result`, `typecheck_result`
- `diff`, `snapshot`, `metadata`, `workspace_state`

**Storage path convention:**
```
codehive/{projectId}/{runId}/{type}_{hash}.{ext}
```

**Features:**
- Signed URL generation for secure artifact access
- Content type detection
- Artifact metadata (size, timestamp, SHA-256 hash)
- Upload tracking with success/failure status
- Batch upload support

### E. Execution Replay (`src/lib/executionReplay.ts`)

Captures execution timelines for debugging and auditing.

**Replay events:**
- `workspace_created`, `patch_applied`, `command_started`, `command_completed`
- `command_failed`, `healing_attempted`, `healing_succeeded`, `healing_failed`
- `artifact_uploaded`, `pr_created`, `workspace_destroyed`

**Features:**
- Complete timeline reconstruction from D1 records
- Failure context snapshots
- Duration tracking per step
- Session-level replay metadata

### F. Advanced Self-Healing (`src/lib/healingStrategies.ts`)

Extends M3 self-healing with targeted repair strategies.

**Supported strategies:**

| Strategy | Fixes | Risk |
|----------|-------|------|
| `import_fix` | Missing/wrong imports | Low |
| `missing_dependency` | Missing npm packages | Low |
| `syntax_repair` | Simple syntax errors | Low |
| `lint_autofix` | Lint rule violations | Low |
| `format_fix` | Formatting issues | Low |
| `type_mismatch` | Simple type errors | Medium |
| `build_path_fix` | Wrong import paths | Low |

**NOT supported (blocked):**
- Auth system rewrites
- Dependency version upgrades
- Migration changes
- Architecture refactors
- Deployment configuration changes

**Safety limits:**
- Maximum 3 healing attempts per run (configurable)
- Each attempt must be scoped to a single strategy
- All fixes applied in sandbox only — never to target repo
- Re-runs full validation after each fix

### G. PR Materializer (`src/lib/prMaterializer.ts`)

Creates production-ready pull requests with full context.

**PR body includes:**
- Summary of changes
- Files changed with diff stats (+/- lines)
- Test results (pass/fail counts)
- Build/lint status
- Risk score from M2 engine
- Validation results from M3
- Self-healing attempts (if any)
- Artifact download links
- Rollback plan with step-by-step instructions

### H. Orchestration Resilience

**New run states** (added to `runStateMachine.ts`):

| State | Description |
|-------|-------------|
| `workspace_setup` | Creating isolated workspace |
| `patch_application` | Applying patches to workspace |
| `dependency_install` | Running npm/pnpm install |
| `lint_execution` | Running lint |
| `test_execution` | Running tests |
| `build_execution` | Running build |
| `artifact_upload` | Uploading to R2 |
| `pr_materialization` | Creating PR |
| `cleanup` | Destroying workspace |
| `stuck` | Heartbeat expired |
| `recovering` | Retry in progress |
| `partially_completed` | Some steps succeeded |

**Resilience features:**
- Heartbeat monitoring for long-running operations
- Stuck-run detection and recovery
- Idempotent state transitions
- Orphaned workspace cleanup

## New Collections (D1 Tables)

| Collection | Slug | Purpose |
|------------|------|---------|
| `WorkspaceRuns` | `workspace-runs` | Workspace lifecycle tracking |
| `ExecutionSteps` | `execution-steps` | Per-command execution records |
| `ArtifactRecords` | `artifact-records` | R2 artifact metadata |
| `ReplaySessions` | `replay-sessions` | Execution replay metadata |
| `HealingAttempts` | `healing-attempts` | Self-healing attempt records |
| `CommandExecutions` | `command-executions` | Raw command execution logs |
| `WorkspaceSnapshots` | `workspace-snapshots` | Pre/post patch state |

## New API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/m4/execute` | Full execution pipeline (SSE) |
| `GET` | `/api/m4/execution/[runId]` | Execution status + steps |
| `GET` | `/api/m4/artifacts/[runId]` | Artifact listing + signed URLs |
| `GET` | `/api/m4/replay/[runId]` | Execution replay timeline |
| `GET` | `/api/m4/healing/[runId]` | Self-healing attempt details |
| `GET` | `/api/m4/workspace/[runId]` | Workspace status + lifecycle |

## New UI Components

| Component | File | Description |
|-----------|------|-------------|
| `ExecutionConsole` | `m4/ExecutionConsole.tsx` | Live streaming execution log |
| `ArtifactViewer` | `m4/ArtifactViewer.tsx` | Artifact list + download links |
| `ExecutionReplayTimeline` | `m4/ExecutionReplayTimeline.tsx` | Visual step-by-step timeline |
| `SandboxStatusPanel` | `m4/SandboxStatusPanel.tsx` | Workspace lifecycle viewer |
| `SelfHealViewer` | `m4/SelfHealViewer.tsx` | Healing attempt viewer |
| `BuildTestLintTabs` | `m4/BuildTestLintTabs.tsx` | Tabbed build/test/lint results |
| `WorkspaceLifecycleViewer` | `m4/WorkspaceLifecycleViewer.tsx` | Workspace state timeline |
| `ExecutionAnalyticsDashboard` | `m4/ExecutionAnalyticsDashboard.tsx` | Aggregate execution metrics |

## Feature Flags

All new features can be individually disabled via env vars:

| Flag | Env Var | Default |
|------|---------|---------|
| `M4_WORKSPACE` | `M4_WORKSPACE_ENABLED` | `true` |
| `M4_PATCH_APPLY` | `M4_PATCH_APPLY_ENABLED` | `true` |
| `M4_EXECUTION_PIPELINE` | `M4_EXECUTION_PIPELINE_ENABLED` | `true` |
| `M4_ARTIFACTS` | `M4_ARTIFACTS_ENABLED` | `true` |
| `M4_REPLAY` | `M4_REPLAY_ENABLED` | `true` |
| `M4_ADVANCED_HEALING` | `M4_ADVANCED_HEALING_ENABLED` | `true` |
| `M4_PR_MATERIALIZE` | `M4_PR_MATERIALIZE_ENABLED` | `true` |
| `M4_ORCHESTRATION` | `M4_ORCHESTRATION_ENABLED` | `true` |
| `M4_ANALYTICS` | `M4_ANALYTICS_ENABLED` | `true` |

## Safety Guarantees

1. **No direct writes to main** — all changes flow through workspace → PR
2. **Sandbox isolation** — all execution happens on temporary branches
3. **Cleanup guaranteed** — workspaces always destroyed, even on failure
4. **Review gates enforced** — M3 gates still apply
5. **Protected files blocked** — M2 protection rules still enforced
6. **Self-healing limited** — max 3 attempts, safe strategies only
7. **All logs persist** — every command, every output, every failure
8. **Artifacts stored** — all execution outputs preserved in R2
9. **Auditable** — full replay timeline for every execution

## R2 Integration

Artifacts are stored in the existing `codehive-ai` R2 bucket with the naming convention:

```
codehive/{projectId}/{runId}/{type}_{hash}.{ext}
```

The R2 binding is already configured in `wrangler.toml` as `R2`. Artifact uploads use the `R2Bucket` binding from the Cloudflare Workers environment.

## Failure Recovery

| Failure Type | Recovery Strategy |
|-------------|-------------------|
| `patch_apply_failure` | Skip execution, report error |
| `install_failure` | Retry once, then report |
| `lint_failure` | Attempt autofix healing |
| `typecheck_failure` | Attempt type mismatch fix |
| `build_failure` | Attempt path fix healing |
| `test_failure` | Report with test output |
| `timeout_failure` | Kill process, report timeout |
| `artifact_failure` | Continue without artifacts |
| `cleanup_failure` | Mark orphaned, schedule retry |

## Migration

The M4 migration (`20260518_m4.ts`) creates 7 new D1 tables:
- `workspace_runs`, `execution_steps`, `artifact_records`
- `replay_sessions`, `healing_attempts`, `command_executions`
- `workspace_snapshots`

Run via Payload's built-in migration system (auto-runs on deploy).

## Files Changed

**New files: 31**
- 8 lib modules
- 7 collections
- 1 migration
- 6 API routes
- 8 UI components
- 1 test file

**Modified files: 4**
- `src/lib/featureFlags.ts` — 9 new M4 flags
- `src/lib/runStateMachine.ts` — M4 states + heartbeat
- `src/migrations/index.ts` — M4 migration registered
- `src/payload.config.ts` — 7 new collections registered

**Total: 35 files, ~4,700 lines added**

## Known Limitations

1. **GitHub-only workspace provider** — E2B/Docker/Cloudflare Sandboxes are type-defined but not yet implemented
2. **Command execution is simulated** — actual `npm run` execution requires a real runtime (GitHub Actions integration in M5)
3. **R2 artifact upload requires Worker context** — won't work in local dev without wrangler proxy
4. **Test execution depends on target repo's test setup** — repos without `npm test` script will skip
5. **Self-healing is conservative** — won't attempt complex fixes that could cause regressions

## Recommended Milestone 5

**Real Runtime Integration + CI/CD Pipeline**

1. **GitHub Actions integration** — trigger real CI/CD runs in target repos
2. **Live command execution** — connect to GitHub Actions for real npm/build/test output
3. **Multi-repo orchestration** — coordinate changes across dependent repos
4. **AI learning from execution** — feed build/test failures back to the AI for smarter patches
5. **Cloudflare Sandboxes** — when available, replace GitHub-based workspaces with true sandboxed environments
6. **Deployment preview** — auto-deploy workspace branches for visual preview
7. **Cost tracking** — track API/compute costs per execution
8. **Team collaboration** — approval workflows, code review assignments
