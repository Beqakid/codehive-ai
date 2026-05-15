# CodeHive AI — Milestone 1 Architecture & Runbook

> **Status:** Complete  
> **Branch:** `feature/milestone-1`  
> **Goal:** Safe foundation — connect to any GitHub repo, generate an AI plan, create a branch + PR with zero source code changes.

---

## Architecture Overview

```
User (browser)
    │
    ▼
/projects/[id]/plan          ← M1 command input + live log viewer (new page)
    │
    ▼ POST /api/m1/plan (SSE stream)
    │
    ├─ Validate GitHub access   (repoService.validateRepoAccess)
    ├─ Fetch repo metadata       (repoService.fetchRepoMetadata)
    ├─ Fetch file tree           (repoService.fetchFileTree)
    ├─ Read key files            (repoService.fetchKeyFiles)
    ├─ Run planning agent        (plannerAgent → Anthropic claude-sonnet-4-6)
    ├─ Save plan to D1           (agent-runs.planMarkdown via Payload)
    ├─ Create branch             (github.createBranch)
    ├─ Commit plan markdown      (github.createOrUpdateFile → .codehive/plans/[runId].md)
    └─ Open PR                   (github.createPullRequest)
         │
         ▼
    All events persisted to agent_logs (D1)
    Run record updated in agent_runs (D1)

/projects/[id]/plan/[runId]   ← run detail: plan viewer + log history (new page)
    │ GET /api/m1/runs/[runId]
    │ GET /api/m1/runs/[runId]/logs
```

**No target repo source code is ever modified in Milestone 1.**  
The only files written are `.codehive/plans/[runId].md` (documentation only).

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/lib/repoService.ts` | GitHub read operations: validate, metadata, file tree, key files |
| `src/lib/featureFlags.ts` | Feature flag constants |
| `src/agents/plannerAgent.ts` | AI planning agent (Anthropic, no code gen) |
| `src/collections/AgentLogs.ts` | Per-event log storage collection |
| `src/app/(frontend)/api/m1/plan/route.ts` | POST SSE pipeline |
| `src/app/(frontend)/api/m1/runs/route.ts` | GET — list runs for project |
| `src/app/(frontend)/api/m1/runs/[runId]/route.ts` | GET — run detail + plan |
| `src/app/(frontend)/api/m1/runs/[runId]/logs/route.ts` | GET — historical logs |
| `src/components/M1PlanInterface.tsx` | Client component: command input + live logs |
| `src/components/RunDetailPage.tsx` | Client component: plan viewer + log history |
| `src/app/(frontend)/projects/[id]/plan/page.tsx` | Server page wrapper (plan interface) |
| `src/app/(frontend)/projects/[id]/plan/[runId]/page.tsx` | Server page wrapper (run detail) |
| `src/migrations/20260515_m1.ts` | D1 schema migration |
| `docs/codehive-milestone-1.md` | This file |

### Modified Files (additive only — no breaking changes)

| File | Change |
|------|--------|
| `src/collections/Projects.ts` | +3 fields: `repoOwner`, `repoName`, `defaultBranch` |
| `src/collections/AgentRuns.ts` | +1 option: `planner`; +4 fields: `runType`, `branchName`, `prUrl`, `planMarkdown` |
| `src/payload.config.ts` | Added `AgentLogs` to collections array |
| `src/migrations/index.ts` | Added `20260515_m1` migration |

---

## D1 Migration Steps

### Apply on Cloudflare (production)

```bash
# Via GitHub Actions (recommended)
git push origin feature/milestone-1
# Merge to main → deploy.yml runs → migrations auto-apply on startup

# Manual via Wrangler CLI
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE projects ADD COLUMN repo_owner TEXT;"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE projects ADD COLUMN repo_name TEXT;"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE projects ADD COLUMN default_branch TEXT DEFAULT 'main';"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE agent_runs ADD COLUMN run_type TEXT DEFAULT 'codegen';"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE agent_runs ADD COLUMN branch_name TEXT;"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE agent_runs ADD COLUMN pr_url TEXT;"
npx wrangler d1 execute codehive-ai --remote \
  --command "ALTER TABLE agent_runs ADD COLUMN plan_markdown TEXT;"
npx wrangler d1 execute codehive-ai --remote \
  --command "CREATE TABLE IF NOT EXISTS agent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'info', event TEXT NOT NULL, message TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));"
npx wrangler d1 execute codehive-ai --remote \
  --command "CREATE INDEX IF NOT EXISTS agent_logs_run_id_idx ON agent_logs (run_id);"
```

### Apply locally (development)

```bash
npx wrangler d1 execute codehive-ai --local \
  --command "..." # same commands as above but with --local
```

---

## Environment Variables

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `GITHUB_TOKEN` | Cloudflare Worker Secret | GitHub API auth. Needs `repo` + `workflow` scopes. |
| `ANTHROPIC_API_KEY` | Cloudflare Worker Secret | Claude claude-sonnet-4-6 for planning agent. |
| `PAYLOAD_SECRET` | Cloudflare Worker Secret | Payload CMS session secret. |
| `M1_PLANNING_ENABLED` | Optional env var | Set to `false` to disable M1 planning feature. Default: on. |

### Cloudflare D1 Bindings (in wrangler.jsonc)
```json
{ "binding": "D1", "database_name": "codehive-ai", "database_id": "a1b82f4c-..." }
```

### Cloudflare R2 Bindings (in wrangler.jsonc)
```json
{ "binding": "R2", "bucket_name": "codehive-ai" }
```

---

## GitHub Setup

1. Ensure `GITHUB_TOKEN` has `repo` scope (read + write + PR creation on target repos).
2. For private repos, the token owner must be a collaborator or org member.
3. The target repo must have at least one commit (so branches can be created from a base SHA).
4. The `.codehive/plans/` path will be created automatically on first plan run.

---

## How to Test Milestone 1

### 1. Navigate to the planning interface
```
https://codehive-ai.jjioji.workers.dev/projects/[your-project-id]/plan
```

### 2. Create a project with a real repo
- Go to `/projects/new` → pick a repo (gotocare, viliniu, etc.)
- The project's `repoUrl` will be used to derive `repoOwner`/`repoName`

### 3. Submit a planning request
Example request:
```
Analyze this repo and propose how to add caregiver QR verification.
When a caregiver arrives at a client's location, they scan a QR code to confirm arrival.
```

### 4. Watch live logs stream
You should see events stream in real-time:
- `repo_access_check` → access confirmed
- `repo_metadata_fetch` → metadata loaded
- `file_tree_fetch` → N files found
- `key_files_fetch` → key files read
- `planner_start` → AI called
- `plan_generated` → plan title shown
- `plan_saved` → saved to D1
- `branch_create` → branch created
- `plan_commit` → `.codehive/plans/[runId].md` committed
- `pr_create` → PR opened
- `pipeline_complete` → done

### 5. View the plan
- Click **"View Full Plan"** to see the full markdown plan
- Click **"Open Pull Request"** to see the GitHub PR
- Verify the PR only contains `.codehive/plans/[runId].md` (no source files)

### 6. Verify via API
```bash
# List runs for a project
curl https://codehive-ai.jjioji.workers.dev/api/m1/runs?projectId=YOUR_PROJECT_ID

# Get run detail
curl https://codehive-ai.jjioji.workers.dev/api/m1/runs/YOUR_RUN_ID

# Get run logs
curl https://codehive-ai.jjioji.workers.dev/api/m1/runs/YOUR_RUN_ID/logs
```

---

## Acceptance Criteria Checklist

| Criterion | Status |
|-----------|--------|
| User can select or create a project | ✅ Existing projects page |
| User can connect a GitHub repo | ✅ Via project `repoUrl` / new fields |
| User can submit a command | ✅ `/projects/[id]/plan` |
| Agent run starts | ✅ SSE stream begins immediately |
| Logs stream live | ✅ Per-event SSE via `TransformStream` |
| AI plan is generated | ✅ `plannerAgent` → claude-sonnet-4-6 |
| Plan is saved in D1 | ✅ `agent_runs.plan_markdown` + `agent_logs` |
| Branch is created in GitHub | ✅ `codehive/plan-[runId]` |
| PR is opened with the plan | ✅ PR body = plan markdown |
| No target repo source code modified | ✅ Only `.codehive/plans/[runId].md` written |
| Existing app functionality still works | ✅ All changes are additive |

---

## Known Limitations

1. **No real-time log replay** — If a client disconnects mid-stream, they can view historical logs from `/api/m1/runs/[runId]/logs` but cannot re-stream the live pipeline.
2. **Single GitHub token** — All repos use the same `GITHUB_TOKEN`. Per-repo or per-org tokens (GitHub App) are a Milestone 2 concern.
3. **Planning agent sees only root-level + key files** — Deep nested files are listed in the tree but not read. Future milestones can let the planner request specific file reads.
4. **No PR review flow** — The PR is opened immediately. Milestone 2 should add approval/reject UI.
5. **`requestedBy` defaults to user ID 1** — The M1 routes don't thread auth into Payload. Full auth integration is a future iteration.
6. **D1 `plan_markdown` column** — D1 text columns have no hard size limit but very large plans (>1MB) may cause issues. Plans are capped at ~6KB by the AI `max_tokens: 4096` limit.

---

## Next Recommended Milestone (Milestone 2)

1. **Plan Review UI** — Approve/reject/request changes on the PR from within CodeHive
2. **GitHub App installation** — Per-repo installation tokens instead of a single PAT
3. **Repo-aware file selector** — Let users pick specific files to include in the planning context
4. **Planning history page** — List all past plans across all projects
5. **Plan diff view** — Show a before/after preview of what the plan proposes to change
6. **Implement step** — After plan approval, run the code generation pipeline against the same plan
