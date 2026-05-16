# CodeHive AI — Milestone 5: Multi-Agent Intelligence & Memory

## Overview

Milestone 5 transforms CodeHive from a single-pipeline AI execution system into a **multi-agent AI engineering team with persistent memory**. Eight specialized agents collaborate through a 12-step orchestrated pipeline, each producing structured outputs that feed into the next stage.

## Multi-Agent Architecture

### Agent Team

| Agent | Role | Model Strategy | Output |
|-------|------|---------------|--------|
| **Product Agent** | Understands user intent, defines acceptance criteria | Fast reasoning (Claude Sonnet) | Scope, criteria, complexity |
| **Repo Intelligence Agent** | Reads repo structure, identifies impacted areas | Fast reasoning (Claude Sonnet) | Architecture summary, dependencies |
| **Architect Agent** | Designs implementation approach, sets file boundaries | Strongest reasoning (Claude Sonnet) | Components, file plan, confidence |
| **Code Agent** | Generates patches within scope rules | Strongest coding (Claude Sonnet) | Structured patches |
| **Test Agent** | Interprets lint/test/build output, categorizes failures | Coding/debug (Claude Sonnet) | Categorized results, fix suggestions |
| **Fix Agent** | Performs limited safe repairs using learned fixes | Coding/debug (Claude Sonnet) | Repair patches |
| **Reviewer Agent** | Reviews diff, risk, tests — produces verdict | Independent model (GPT-4.1) | Approve/reject/needs_changes |
| **Memory Agent** | Extracts lessons, updates repo memory | Cheap summarization (GPT-4.1-mini) | Lessons learned |

### Pipeline Flow

```
User Request
    ↓
[1] Product Agent — scope + acceptance criteria
    ↓
[2] Repo Intelligence Agent — architecture analysis
    ↓
[3] Architect Agent — implementation design
    ↓
[4] Risk + Scope Gate — protected file check, complexity check
    ↓ (blocked if critical risk)
[5] Code Agent — patch generation
    ↓
[6] Patch Validation — structure + operation validation
    ↓
[7] Sandbox Execution — install/lint/test/build (via M4 pipeline)
    ↓
[8] Test Agent — interpret results
    ↓
[9] Fix Agent — safe repairs if needed (via healing policy)
    ↓
[10] Reviewer Agent — independent review + verdict
    ↓
[11] Memory Agent — extract and save lessons
    ↓
[12] PR Materialization — full-context PR body
```

## Memory System

### Architecture

The memory system provides persistent context across runs using Cloudflare D1 (SQL).

**Storage (`memoryStore.ts`)**
- CRUD operations for memory entries
- 10 memory types: `repo_architecture`, `protected_area`, `previous_outcome`, `repeated_error`, `successful_fix`, `failed_repair`, `project_rule`, `user_preference`, `do_not_touch`, `successful_pattern`
- Confidence scoring (0-100)
- Source run tracking

**Retrieval (`memoryRetrieval.ts`)**
- Query-based memory lookup
- Type filtering
- Confidence-weighted results
- Formatted context injection for agents
- Project rule conflict detection

### Memory-Aware Runs

Before every pipeline run:
1. Retrieve relevant memories for the project
2. Inject memory context into Product Agent and Architect Agent
3. Check for project rule conflicts
4. Use learned fixes during self-healing (Fix Agent)
5. Save new lessons after completion (Memory Agent)

### Collections

| Collection | Purpose |
|------------|---------|
| `repo-memories` | Architecture facts, patterns, previous outcomes |
| `project-rules` | Do-not-modify rules, approval requirements |
| `learned-fixes` | Error patterns with known solutions |
| `failure-patterns` | Fingerprinted errors with occurrence tracking |
| `agent-verdicts` | Run verdict history with scores |

### Future: Vectorize Integration

The memory system is designed to be extended with Cloudflare Vectorize for semantic search:
- Embed memory content as vectors
- Enable fuzzy/semantic retrieval instead of keyword matching
- Cluster related memories automatically
- Add memory decay (reduce confidence over time)

## Self-Healing V2

### Failure Fingerprinting (`failureFingerprint.ts`)

Every error is fingerprinted by:
1. Normalizing the error message (removing line numbers, file paths)
2. Generating a stable hash
3. Classifying into categories: `import_error`, `type_error`, `lint_error`, `syntax_error`, `test_failure`, `build_error`, `runtime_error`, `config_error`, `dependency_error`

Same errors produce same fingerprints, enabling learned fix lookup.

### Healing Policy (`healingPolicy.ts`)

The policy engine decides whether self-healing is allowed:

**✅ Allowed:**
- Missing imports
- Simple type errors
- Lint auto-fixes
- Test expectation mismatches
- Incorrect file paths
- Formatting issues
- Simple build errors

**❌ Blocked:**
- Auth/payment rewrites
- Database migrations
- Dependency upgrades (unless approved)
- Deployment config changes
- Broad refactors

**Controls:**
- Max 3 repair attempts per category
- Reduces max attempts on repeated failures
- Selects appropriate strategy per error type
- Post-repair reviewer check required

## Model Routing

### Architecture (`modelRouter.ts`)

The model router abstracts AI provider selection:

```typescript
const result = await callModel('code', {
  systemPrompt: '...',
  userPrompt: '...',
  env: { ANTHROPIC_API_KEY, OPENAI_API_KEY },
})
```

### Provider Configuration

| Role | Default Provider | Model | Reason |
|------|-----------------|-------|--------|
| product | anthropic | claude-sonnet-4-6 | Fast reasoning |
| repo_intelligence | anthropic | claude-sonnet-4-6 | Code understanding |
| architect | anthropic | claude-sonnet-4-6 | Architecture design |
| code | anthropic | claude-sonnet-4-6 | Code generation |
| test | anthropic | claude-sonnet-4-6 | Error analysis |
| fix | anthropic | claude-sonnet-4-6 | Debugging |
| reviewer | openai | gpt-4.1 | Independent from code agent |
| memory | openai | gpt-4.1-mini | Cheap summarization |

### Extensibility

Prepared for future providers:
- Cloudflare Workers AI
- Google Gemini
- AI Gateway (rate limiting, caching)

## PR Quality

Every PR includes 12 sections:

1. User request
2. Product Agent summary with acceptance criteria
3. Architect plan with component breakdown
4. Files changed with operations
5. Risk assessment with gate result
6. Test results with per-step status
7. Self-heal attempts and outcome
8. Reviewer verdict with score and reasons
9. Rollback plan
10. Artifact links
11. Memory updates / lessons learned
12. Human review checklist

## Agent Verdict System

### Scoring

Each run produces:
- `implementationConfidence` (0-100) — weighted from architect + code scores
- `riskScore` (0-100) — based on risk level and protected file checks
- `testConfidence` (0-100) — from test agent score
- `reviewerApproval` — approve/reject/needs_changes
- `productionReadiness` (0-100) — composite of all scores
- `recommendedAction` — proceed_to_pr / needs_human_review / blocked / retry_with_fix / planning_only

### Decision Matrix

| Readiness | Reviewer | Action |
|-----------|----------|--------|
| ≥80 | approve | proceed_to_pr |
| 60-79 | approve | needs_human_review |
| ≥60 | needs_changes | retry_with_fix |
| <60 | reject | blocked |
| any | any + protected violation | blocked |

## Observability

### Tracked Metrics

- Agent duration per step
- Agent failures with error details
- Model used per agent
- Retry count per agent
- Verdict history
- Memory hits per run
- Self-heal success rate
- Reviewer rejection rate

### UI Components

| Component | Purpose |
|-----------|---------|
| `AgentTimeline` | 12-step vertical timeline with expandable outputs |
| `AgentOutputPanel` | Detailed single-agent output view |
| `MemoryHitsPanel` | Memory entries used during run, grouped by type |
| `ReviewerVerdictCard` | Prominent verdict display with score gauge |
| `ProductionReadinessScore` | Composite readiness gauge with sub-score bars |
| `FailureFingerprintPanel` | Categorized failure patterns with resolution status |

## API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/m5/run` | Trigger multi-agent pipeline |
| GET | `/api/m5/agents/{runId}` | Get all agent results for a run |
| GET | `/api/m5/verdict/{runId}` | Get verdict and scores |
| GET | `/api/m5/memory/{projectId}` | Get project memories |
| POST | `/api/m5/memory/{projectId}` | Add memory entry |
| GET | `/api/m5/failures/{runId}` | Get failure patterns |
| POST | `/api/m5/memory-search` | Search memories across projects |

## D1 Migration

Migration `20260517_m5` creates 5 new tables:
- `repo_memories` — persistent memory entries
- `project_rules` — project-specific rules
- `learned_fixes` — error-to-fix mappings
- `failure_patterns` — fingerprinted failures
- `agent_verdicts` — run verdict history

## Testing

### Test Suite

149 new tests across 9 categories:
- Model Router (16 tests)
- Agent Verdict (27 tests)
- Memory Store (8 tests)
- Memory Retrieval (10 tests)
- Failure Fingerprint (27 tests)
- Healing Policy (27 tests)
- Pipeline / Orchestrator (15 tests)
- Collection Schemas (14 tests)
- Feature Flags (5 tests)

Combined with M1-M4: **300+ total tests**

### Running Tests

```bash
npx vitest run src/__tests__/m5.test.ts
```

## Feature Flags

10 new feature flags (all default ON):
- `M5_AGENT_PIPELINE` — Multi-agent orchestration
- `M5_AGENT_VERDICT` — Verdict scoring
- `M5_MEMORY_SYSTEM` — Persistent memory
- `M5_MEMORY_AWARE` — Memory injection
- `M5_HEALING_V2` — Self-healing V2
- `M5_MODEL_ROUTER` — Model routing
- `M5_PR_QUALITY` — Enhanced PR body
- `M5_OBSERVABILITY` — Agent observability
- `M5_FAILURE_FINGERPRINT` — Error fingerprinting
- `M5_REVIEWER_INDEPENDENCE` — Independent reviewer model

## Known Limitations

1. **Sandbox execution is simulated** — Pipeline step 7 uses M4's workspace/execution system in production; M5 orchestrator marks it as simulated for now
2. **Memory retrieval is keyword-based** — Vectorize integration planned for M6
3. **Model routing is config-based** — AI Gateway integration for rate limiting/caching planned
4. **No inter-agent communication** — Agents pass data through orchestrator, no direct agent-to-agent
5. **Single reviewer** — Could benefit from multi-reviewer consensus

## Recommended Milestone 6

### "Autonomous Execution + Semantic Memory"

1. **Full sandbox integration** — Connect M5 orchestrator to M4 workspace/execution pipeline for real code execution
2. **Vectorize memory** — Semantic search via Cloudflare Vectorize embeddings
3. **AI Gateway** — Rate limiting, caching, analytics via Cloudflare AI Gateway
4. **Multi-reviewer consensus** — Two independent reviewers must agree
5. **Autonomous mode** — Full end-to-end execution without human intervention for low-risk changes
6. **Webhook triggers** — GitHub webhook → automatic pipeline runs on issue/PR events
7. **Memory decay** — Reduce confidence of old memories over time
8. **Agent specialization** — Fine-tuned prompts per project based on accumulated memory
9. **Cost tracking** — Track AI API costs per run/agent
10. **Dashboard** — Real-time multi-project dashboard with pipeline status
