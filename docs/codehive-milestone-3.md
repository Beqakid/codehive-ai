# CodeHive AI — Milestone 3: Controlled Code Generation

**Status:** Complete ✅  
**Branch:** `feature/milestone-3`  
**Tests:** 70 M3 tests (149 total across M1+M2+M3)  
**Backward Compatible:** All M1 + M2 functionality preserved

---

## Goal

Transform CodeHive from a **read-only AI intelligence system** into a **controlled AI code modification platform**.

CodeHive can now:
1. Generate SAFE code patches (never raw repo writes)
2. Enforce file scope restrictions
3. Run multi-stage patch validation
4. Execute sandboxed test/lint/build pipelines
5. Generate structured diffs with visual review
6. Plan rollback strategies automatically
7. Enforce review gates based on risk level
8. Attempt limited self-healing for safe errors
9. Maintain PR-first workflow (no direct writes to main)
10. Prevent destructive repo modifications

---

## Architecture

### Validation Pipeline

Every AI-generated patch flows through this pipeline:

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│ Repo Intel   │ ──► │ Risk Engine   │ ──► │ Scope Check    │
│ (M2)         │     │ (M2)         │     │ (M3)           │
└─────────────┘     └──────────────┘     └────────────────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────────┐
                    │ Diff Review  │ ◄── │ Patch Generation │
                    │ (M3 UI)      │     │ + Validation     │
                    └──────────────┘     └────────────────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────────┐
                    │ Self-Heal    │ ◄── │ Sandbox Execution│
                    │ (limited)    │     │ (test/lint/build)│
                    └──────────────┘     └────────────────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────────┐
                    │ PR Creation  │ ◄── │ Review Gates     │
                    │              │     │ (risk-based)     │
                    └──────────────┘     └────────────────┘
```

### Safety Layers

| Layer | What It Does |
|---|---|
| **Code Generation Rules** | Blocks unsupported operations (delete, rename, binary), path restrictions (node_modules, .env, locks), content scanning (secrets, DROP TABLE) |
| **Edit Scope Manager** | Per-project scope: allowed (components, features, docs), restricted (auth, payments — need approval), blocked (migrations, env, CI, wrangler) |
| **Patch Validator** | Validates syntax sanity, path safety, oversized rejection, duplicate imports, unbalanced braces, dangerous patterns |
| **Review Gates** | Risk-based enforcement: LOW=auto-approve, MEDIUM=confirmation, HIGH=approval, CRITICAL=blocked |
| **Self-Healing** | Limited repair loop: import errors, syntax errors, simple type mismatches only. Max 3 attempts. No auth/architecture rewrites. |

---

## New Files

### Core Libraries (8 files)

| File | Purpose |
|---|---|
| `src/lib/codeGenerationRules.ts` | Defines what AI can/cannot do: supported operations, blocked paths, content scanning, per-run limits |
| `src/lib/diffEngine.ts` | Generates unified diffs, hunks, and diff summaries from old/new content |
| `src/lib/patchEngine.ts` | Orchestrates patch validation + diff generation + protected file filtering |
| `src/lib/editScopeManager.ts` | Per-project scope system: allowed/restricted/blocked file classification |
| `src/lib/patchValidator.ts` | Multi-check validator: path safety, syntax, oversized, secrets, blocked files |
| `src/lib/sandboxRunner.ts` | Abstract sandbox execution: configurable steps (install/build/lint/test), provider-agnostic |
| `src/lib/selfHealingLoop.ts` | Error categorization + healing planner: identifies fixable errors, respects max attempts |
| `src/lib/reviewGates.ts` | 6 independent gate checks based on risk level, protected files, line count, auth/payment/migration involvement |

### Payload Collections (6 files)

| Collection | Slug | Purpose |
|---|---|---|
| `PatchRuns` | `patch-runs` | Stores generated patch sets, diffs, validation results |
| `ValidationResults` | `validation-results` | Per-run validation outcomes |
| `SandboxRuns` | `sandbox-runs` | Sandbox execution results (steps, exit codes, stdout/stderr) |
| `RollbackPlans` | `rollback-plans` | Rollback strategies per run |
| `ReviewGateEvents` | `review-gate-events` | Gate decisions (auto_approve / confirmation / approval / blocked) |
| `SelfHealAttempts` | `self-heal-attempts` | Healing attempt logs (error category, action taken, result) |

### Migration

`src/migrations/20260517_m3.ts` — Creates 6 new D1 tables. All additive, no existing tables modified.

### API Routes (5 routes)

| Route | Method | Purpose |
|---|---|---|
| `/api/m3/generate-patch` | POST | Full M3 pipeline: scope check → validate → diff → risk → review gates |
| `/api/m3/diff/[runId]` | GET | Retrieve diffs for a patch run |
| `/api/m3/test-results/[runId]` | GET | Retrieve sandbox + validation + self-heal results |
| `/api/m3/rollback/[runId]` | GET | Retrieve rollback plan |
| `/api/m3/review-gates/[runId]` | GET | Retrieve review gate decisions |

### UI Components (4 components)

| Component | What It Shows |
|---|---|
| `DiffReviewPanel` | Visual diff viewer: file-level expand/collapse, +/- line coloring, hunks, risk badges, protected file warnings |
| `TestResultsPanel` | Sandbox step results with exit codes, durations, self-heal attempt log |
| `ValidationSummary` | Error/warning counts, issue list, scope check results, review gate decisions |
| `ValidationPipelineStatus` | 9-stage pipeline visualization with live status icons and connector lines |

### Updated Files

| File | Change |
|---|---|
| `src/lib/featureFlags.ts` | +8 M3 feature flags |
| `src/lib/runStateMachine.ts` | +7 new states (patch_generation, patch_validation, sandbox_execution, test_execution, self_healing, review_gate, pr_ready) |
| `src/payload.config.ts` | +6 collection registrations |
| `src/migrations/index.ts` | +M3 migration entry |

---

## Feature Flags

All M3 features are individually toggleable:

| Flag | Default | Controls |
|---|---|---|
| `M3_PATCH_GENERATION` | ON | AI patch generation |
| `M3_EDIT_SCOPE` | ON | File scope restrictions |
| `M3_PATCH_VALIDATION` | ON | Patch validation pipeline |
| `M3_SANDBOX` | ON | Sandbox execution |
| `M3_SELF_HEALING` | ON | Self-healing loop |
| `M3_REVIEW_GATES` | ON | Review gate enforcement |
| `M3_DIFF_REVIEW` | ON | Diff review UI |
| `M3_ROLLBACK_PLANNING` | ON | Rollback plan generation |

Set `M3_PATCH_GENERATION_ENABLED=false` as env var to disable any flag.

---

## Run State Machine (Extended)

M3 adds 7 new states to the deterministic state machine:

```
queued → starting → analyzing_repo → building_graph → risk_analysis → planning
  │
  ├──► [M1/M2 plan-only]: creating_pr → completed
  │
  └──► [M3 patch mode]:
        patch_generation → patch_validation → sandbox_execution → test_execution
                                  ▲                                      │
                                  └──── self_healing ◄───────────────────┘
                                                                         │
                                                              review_gate → pr_ready → completed
```

All M3 states support ERROR → failed and CANCEL → cancelled transitions.

---

## Review Gate Logic

| Gate | Evaluates | Decision |
|---|---|---|
| Risk Level | M2 risk score | CRITICAL → block |
| Protected Files | M2 protected file list | Auth/payment → block |
| Line Count | Total lines changed | >500 → approval_required |
| File Count | Number of files | >10 → confirmation |
| Auth Involvement | Auth-related paths | → blocked |
| Payment/Migration | Payment/migration paths | → blocked |

Overall decision = strictest individual gate.

---

## Self-Healing Limitations

**Supported** (healable categories):
- Import errors → fix_import
- Syntax errors → fix_syntax
- Lint failures → fix_lint
- Simple type mismatches → fix_type

**Not Supported:**
- Test logic failures
- Architecture issues
- Auth/payment rewrites
- Dependency upgrades
- Unknown errors

**Limits:**
- Max 3 attempts per run (configurable)
- Each attempt re-runs validation
- Stops immediately on unhealable errors

---

## Sandbox Architecture

Abstract provider model:

```typescript
interface SandboxConfig {
  provider: 'github_actions' | 'local_mock' | 'e2b' | 'cloudflare_sandbox'
  steps: SandboxStep[]  // install → build → lint → test
  timeoutMs: number
}
```

**Current provider:** `github_actions` (triggers CI workflow on branch)  
**Future-ready for:** E2B, Cloudflare Sandboxes, Dynamic Workers

Each step records: status, exit code, stdout, stderr, duration.

---

## Testing

149 total tests:
- **M1:** 22 tests — planning agent, PR pipeline, repo service
- **M2:** 57 tests — repo intelligence, protected files, risk engine, state machine
- **M3:** 70 tests — patch engine, diff engine, code rules, scope manager, validator, sandbox, self-healing, review gates, state machine (M3 states), feature flags

Run: `npx vitest run tests/int/m1.int.spec.ts tests/int/m2.int.spec.ts tests/int/m3.int.spec.ts`

---

## Known Limitations

1. **Sandbox is abstract** — actual sandbox execution requires triggering GitHub Actions workflow (not yet wired to live CI)
2. **Self-healing generates plans only** — doesn't yet invoke Claude to produce fix patches automatically
3. **Review gate approval** — no UI for human approval flow yet (logged to D1, but no approval endpoint)
4. **Rollback plans are metadata** — no automated revert execution
5. **No live PR creation from patch engine** — the generate-patch endpoint validates + prepares, but PR creation still uses M1 flow

---

## Recommended Milestone 4

**Autonomous Execution with Human Oversight**

1. **Wire live sandbox** — trigger actual GitHub Actions workflow, poll for results
2. **End-to-end code generation** — planner → codegen agent → patch engine → sandbox → PR (fully automated)
3. **Human approval UI** — in-app approve/reject/comment for review gates
4. **Live self-healing** — Claude generates fix patches, re-validates automatically
5. **Multi-repo orchestration** — coordinate changes across related repos
6. **Rollback execution** — one-click automated revert from rollback plans
7. **Analytics dashboard** — patch success rates, self-heal effectiveness, review gate distributions
8. **Webhook integrations** — Slack/Discord notifications on PR creation, gate blocks
