# CodeHive AI — Milestone 2: Repository Intelligence + Safety Infrastructure

> **Branch:** `feature/milestone-2`
> **Date:** 2026-05-16
> **Status:** Complete ✅

---

## Overview

Milestone 2 transforms CodeHive from a repo planner into a **repo intelligence + safe impact analysis system**. It adds deep structural understanding of GitHub repositories, protected file classification, risk scoring, and orchestration reliability — all with NO source code modifications to target repos.

---

## New Systems Added

### A. Repository Intelligence (`src/lib/repoIntelligence.ts`)

Performs a complete static analysis of any GitHub repository:

- **Framework detection** — scans for Next.js, Vite, Payload CMS, Cloudflare Workers, Supabase, Prisma, etc.
- **Auth system detection** — identifies NextAuth, Supabase Auth, Payload Auth, Clerk, Auth0, Firebase, Lucia
- **Route structure** — extracts App Router and Pages Router routes
- **Env var detection** — finds all `process.env.VAR` and `import.meta.env.VAR` usages
- **File classification** — assigns every file a type (`auth`, `api`, `migration`, `config`, etc.) and priority (`HIGH/MEDIUM/LOW`)
- **Dependency edge extraction** — parses static and dynamic imports to build a file relationship graph
- **Central file detection** — identifies files with many inbound dependencies (high blast radius)
- **Protected area identification** — flags directory-level risk zones

All results are persisted to D1 in the `repo_intelligence` table for reuse across runs.

### B. Protected File System (`src/lib/protectedFiles.ts`)

Classifies every file in a repository against **35 protection rules**:

| Protection Type | Examples | Risk Level |
|---|---|---|
| `auth` | `auth.ts`, `session.ts`, `roles.ts`, `/auth/` | CRITICAL |
| `payment` | `stripe.ts`, `/billing/`, `paddle.ts` | CRITICAL |
| `migration` | `/migrations/`, `migration_*.ts` | CRITICAL |
| `payload` | `payload.config.ts` | CRITICAL |
| `rbac` | `access.ts`, `permissions.ts` | CRITICAL |
| `ci-cd` | `.github/workflows/`, `deploy.yml` | HIGH |
| `worker` | `wrangler.toml`, `wrangler.jsonc` | HIGH |
| `deployment` | `Dockerfile`, `next.config.ts` | HIGH |
| `env` | `.env`, `.env.production` | CRITICAL |
| `realtime` | `socket.ts`, `/realtime/` | HIGH |

**Key rule**: Future code agents must request explicit approval before touching ANY protected file.

### C. Risk Scoring Engine (`src/lib/riskEngine.ts`)

Evaluates 11 weighted risk factors and outputs a `RiskReport`:

| Factor | Weight | Triggered By |
|---|---|---|
| `large_change_surface` | 15 | 10+ affected files |
| `critical_protected_file` | 40 | Any CRITICAL protected file |
| `high_protected_file` | 20 | Any HIGH protected file |
| `auth_involvement` | 35 | Auth/RBAC files in scope |
| `payment_involvement` | 40 | Payment/billing files in scope |
| `migration_involvement` | 35 | DB migration files in scope |
| `deployment_config_involvement` | 25 | Worker/CI config in scope |
| `realtime_involvement` | 20 | WebSocket/realtime files |
| `shared_dependency_impact` | 15 | Files with 3+ dependents |
| `complex_implementation` | 10 | AI rated complexity/high hours |
| `large_repo` | 5 | 200+ files in repo |

**Scores map to risk levels:**
- 0–19 → `LOW` 🟢
- 20–44 → `MEDIUM` 🟡
- 45–69 → `HIGH` 🔴
- 70–100 → `CRITICAL` 🚨

### D. Run State Machine (`src/lib/runStateMachine.ts`)

A deterministic, retry-safe state machine for agent runs:

```
queued → starting → analyzing_repo → building_graph → risk_analysis → planning → creating_pr → completed
                                                                           ↓ (any state)
                                                                         failed → queued (on RETRY)
```

Features:
- **Timeout detection** per state (2–5 min thresholds)
- **Stale run cleanup** logic
- **Retry support** with retry count tracking
- **Error context** stored with failed state
- **Progress percentages** (0–100%) for UI progress bars

---

## New Payload Collections

| Collection | Slug | Purpose |
|---|---|---|
| `RepoIntelligence` | `repo-intelligence` | Persisted repo scans |
| `RunRiskReports` | `run-risk-reports` | Per-run risk analysis results |

---

## D1 Migrations

Migration file: `src/migrations/20260516_m2.ts`

### New Tables

**`repo_intelligence`**
```sql
CREATE TABLE repo_intelligence (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id           TEXT NOT NULL,
  owner                TEXT NOT NULL,
  repo                 TEXT NOT NULL,
  framework_summary    TEXT,
  architecture_summary TEXT,
  tech_stack           TEXT,      -- JSON array
  important_files      TEXT,      -- JSON array
  protected_areas      TEXT,      -- JSON array
  env_vars_detected    TEXT,      -- JSON array
  route_structure      TEXT,      -- JSON array
  auth_system          TEXT,
  last_indexed_at      TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**`run_risk_reports`**
```sql
CREATE TABLE run_risk_reports (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id                  TEXT NOT NULL,
  project_id              TEXT NOT NULL,
  risk_level              TEXT NOT NULL,
  risk_score              INTEGER NOT NULL DEFAULT 0,
  confidence_score        INTEGER NOT NULL DEFAULT 50,
  rollback_complexity     TEXT,
  implementation_scope    TEXT,
  affected_files          TEXT,      -- JSON array
  protected_files_touched TEXT,      -- JSON array
  recommendations         TEXT,      -- JSON array
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Migrations run automatically on next Cloudflare deployment. To apply manually:
```bash
wrangler d1 execute codehive-ai --command "$(cat src/migrations/20260516_m2.ts)"
```

---

## New API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/m2/repo-intelligence/[projectId]` | Returns or triggers a fresh repo scan |
| `GET` | `/api/m2/dependencies/[projectId]` | Returns dependency graph + central files + circular risks |
| `GET` | `/api/m2/risk-report/[runId]` | Returns persisted risk report for a run |
| `GET` | `/api/m2/protected-files/[projectId]` | Lists all protected files in a repo |

All routes respect feature flags and return structured error responses.

---

## Updated M1 Plan Pipeline (`POST /api/m1/plan`)

The planning pipeline is now enriched with M2 intelligence:

```
1. Validate GitHub access
2. Fetch repo metadata
3. Fetch file tree
4. Read key files
5. [M2] Run repo intelligence scan → save to D1
6. [M2] Classify protected files
7. [M2] Calculate risk score → save to D1
8. Run AI planning agent (with enriched context)
9. Save plan to D1
10. Create branch + PR (docs-only)
```

All M2 steps are **non-blocking** — if any M2 step fails, the pipeline continues with M1 behavior.

---

## Updated Planner Agent

The planning agent now receives:
- Architecture summary
- Tech stack
- Auth system info
- Protected files list with badges
- Risk score + triggered factors
- Recommendations

And outputs enriched plan sections:
- `affectedFiles` + `notRecommendedFiles`
- `dependencyImpact`
- `protectedFileWarnings`
- `safeBoundaries`
- `alternativeApproaches`
- `recommendedTestingAreas`

---

## New UI Components

| Component | File | Purpose |
|---|---|---|
| `RiskScoreCard` | `src/components/m2/RiskScoreCard.tsx` | Displays risk level, score bar, triggered factors |
| `RunStatusTimeline` | `src/components/m2/RunStatusTimeline.tsx` | State machine progress timeline |
| `RepoIntelligenceDashboard` | `src/components/m2/RepoIntelligenceDashboard.tsx` | 4-tab dashboard: Overview, Protected, Routes, Dependencies |

All components use **full inline styles** (Tailwind-safe).

---

## Feature Flags

All M2 features are individually toggleable via environment variables:

| Flag | Env Var | Default |
|---|---|---|
| `M2_REPO_INTELLIGENCE` | `M2_REPO_INTELLIGENCE_ENABLED=false` | ON |
| `M2_DEPENDENCY_GRAPH` | `M2_DEPENDENCY_GRAPH_ENABLED=false` | ON |
| `M2_PROTECTED_FILES` | `M2_PROTECTED_FILES_ENABLED=false` | ON |
| `M2_RISK_ENGINE` | `M2_RISK_ENGINE_ENABLED=false` | ON |
| `M2_STATE_MACHINE` | `M2_STATE_MACHINE_ENABLED=false` | ON |
| `M2_ENRICHED_PLANNER` | `M2_ENRICHED_PLANNER_ENABLED=false` | ON |

Set any flag to `false` to fall back to M1 behavior.

---

## Testing Instructions

### Run All Tests
```bash
pnpm install
npx vitest run tests/int/m2.int.spec.ts
```

### Expected Output
```
✓ tests/int/m2.int.spec.ts (57 tests, ~14ms)
Test Files  1 passed (1)
Tests       57 passed (57)
```

### Test Coverage

| Suite | Tests | Validates |
|---|---|---|
| File classification | 10 | Type + priority for all file categories |
| Dependency edges | 4 | Import parsing, dynamic imports, node_modules exclusion |
| Env var detection | 4 | process.env, import.meta.env, dedup |
| Protected files | 9 | Auth/payment/migration/CI detection, badges, warnings |
| Risk scoring | 7 | LOW/HIGH/CRITICAL scoring, rollback, scope, recommendations |
| State machine | 13 | Happy path, error, cancel, retry, stale detection, context |
| Feature flags | 2 | All M2 flags defined as booleans |
| Central files | 3 | Multi-inbound detection, isCritical threshold |
| Protection rules | 2 | Rule coverage, non-empty patterns |

---

## Known Limitations

1. **Dependency graph is static** — only analyzes TypeScript/JavaScript `import` statements. No runtime analysis.
2. **File content limited to 2.5KB per file** in planner context (M1 limit, same here)
3. **Risk scoring uses heuristics** — not AI analysis. Confidence is lower for repos with few affected files
4. **Circular dependency detection** is pair-based — does not detect 3+ cycles
5. **`repo_intelligence` is not invalidated automatically** — stale data after major repo changes until next plan run
6. **D1 JSON columns** — stored as raw JSON text; not queryable by field

---

## Architecture Notes

### Safe Pipeline Design

All M2 analysis is read-only and non-blocking:
- If `analyzeRepository()` fails → pipeline continues without intelligence
- If risk engine fails → pipeline continues without risk report
- If D1 save fails → pipeline continues (plan still created)

### Worker Compatibility

All M2 modules:
- Use only `fetch()` for external calls (no Node.js `http`)
- Use no filesystem APIs (`fs`, `path`)
- Store state in D1 only
- Are compatible with Cloudflare Workers edge runtime

---

## Future: Vectorize Integration (Milestone 3+)

The `repo_intelligence` and `run_risk_reports` tables are designed as the foundation for Cloudflare Vectorize integration:

- `architectureSummary` → embed as vector for semantic similarity search
- `importantFiles` → index for file-level RAG
- `protectedAreas` → use as negative examples in similarity search
- `recommendations` → build a recommendation corpus over time

When Vectorize is added, the `GET /api/m2/repo-intelligence` response can be augmented with semantically similar prior runs.

---

## Recommended Milestone 3

**Milestone 3: Selective Safe Code Generation**

1. Activate code generation for LOW and MEDIUM risk plans only
2. CRITICAL/HIGH plans remain planning-only until human approval
3. Generate only non-protected files (protected file system gates this)
4. One file at a time (not batch) to allow per-file review
5. All generated code is on a PR branch — no direct push to main
6. Sandbox runner validates generated code before PR is marked ready
7. Full audit log of every generated line

---

*This document is part of the CodeHive AI Milestone 2 implementation.*
*No source code in any target repository was modified.*
