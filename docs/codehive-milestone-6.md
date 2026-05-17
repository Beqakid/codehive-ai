# CodeHive AI — Milestone 6: Async Orchestration & Durable Agent Runs

## Overview

Milestone 6 transforms CodeHive from a synchronous multi-agent pipeline into a
distributed async AI engineering orchestration platform. Long-running agent
pipelines now execute asynchronously via self-chaining HTTP requests, with full
state persistence in Cloudflare D1 for resumability, retry, and real-time
progress streaming.

## Architecture

### Old (M5): Synchronous Pipeline
```
HTTP request → run 8 agents sequentially → timeout risk → single response
```

### New (M6): Async Pipeline
```
HTTP request → create run record → return immediately
  → process endpoint runs step 1 → saves result → chains step 2
  → process endpoint runs step 2 → saves result → chains step 3
  → ... → all steps done → mark run complete
  → UI polls/streams progress throughout
```

### Key Design Decisions

1. **Self-Chaining HTTP**: Each step triggers the next via `fetch()` to the
   process endpoint. Each invocation gets its own CF Workers CPU budget,
   eliminating timeout issues.

2. **D1 State Persistence**: All run and step state stored in Payload CMS
   collections backed by D1. Runs are fully resumable after failures.

3. **Internal Auth**: Process endpoint protected by a PAYLOAD_SECRET-derived
   token to prevent unauthorized triggering.

4. **Heartbeat Detection**: Runs that stall (no heartbeat for >5 minutes) are
   automatically detected and marked as stalled.

5. **Retry with Backoff**: Failed steps can be retried up to 3 times with
   exponential backoff (1s, 2s, 4s).

## New Files

### Lib (6 files)
| File | Purpose |
|------|---------|
| `asyncPipeline.ts` | Core pipeline engine — creates runs, manages state |
| `stepExecutor.ts` | Executes individual agent steps self-contained from D1 |
| `runEventEmitter.ts` | Event logging for real-time streaming |
| `retryManager.ts` | Retry + exponential backoff logic |
| `heartbeatManager.ts` | Stale run detection + heartbeat updates |
| `chainScheduler.ts` | Self-chaining HTTP scheduler + internal auth |

### Collections (3 files)
| Collection | Purpose |
|------------|---------|
| `AsyncRuns` | Main run records with status, progress, heartbeat |
| `AsyncRunSteps` | Individual step records with output, model, timing |
| `RunEvents` | Event log for streaming and audit trail |

### API Routes (8 routes)
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/m6/run` | POST | Submit async pipeline run |
| `/api/m6/run` | GET | List recent runs |
| `/api/m6/run/[runId]` | GET | Get run status + all steps |
| `/api/m6/run/[runId]/events` | GET | SSE stream or poll events |
| `/api/m6/run/[runId]/resume` | POST | Resume stalled/failed run |
| `/api/m6/run/[runId]/cancel` | POST | Cancel running pipeline |
| `/api/m6/run/[runId]/retry` | POST | Retry a specific failed step |
| `/api/m6/process/[runId]` | POST | Internal step processor |
| `/api/m6/dashboard` | GET | Dashboard summary data |

### UI Components (6 files)
| Component | Purpose |
|-----------|---------|
| `AsyncRunDashboard` | Main dashboard with run list + status cards |
| `RunProgressTimeline` | Visual timeline of pipeline steps |
| `StepStatusCards` | Grid of step cards with expand/collapse |
| `LiveRunConsole` | Real-time event console with polling |
| `RunControlPanel` | Resume/cancel/retry action buttons |
| `HeartbeatIndicator` | Visual heartbeat age indicator |

### Migration
- `20260519_m6.ts` — Creates `async_runs`, `async_run_steps`, `run_events` tables

## D1 Schema (New Tables)

### async_runs
| Column | Type | Description |
|--------|------|-------------|
| run_id | TEXT | Unique run identifier |
| project_id | TEXT | Associated project |
| status | TEXT | queued/processing/completed/failed/cancelled/stalled |
| current_step | TEXT | Currently executing step |
| heartbeat_at | TEXT | Last heartbeat timestamp |
| completed_steps | INTEGER | Progress counter |
| total_steps | INTEGER | Total pipeline steps (12) |
| duration_ms | INTEGER | Total execution time |

### async_run_steps
| Column | Type | Description |
|--------|------|-------------|
| run_id | TEXT | Parent run |
| step_name | TEXT | Pipeline step name |
| status | TEXT | pending/ready/running/completed/failed/skipped |
| output | TEXT | JSON agent output |
| markdown | TEXT | Human-readable summary |
| retry_count | INTEGER | Current retry attempt |

### run_events
| Column | Type | Description |
|--------|------|-------------|
| run_id | TEXT | Parent run |
| event_type | TEXT | Event type (step_started, run_completed, etc.) |
| message | TEXT | Human-readable message |
| data | TEXT | JSON event data |

## API Usage

### Submit a Run
```bash
curl -X POST https://codehive-ai.jjioji.workers.dev/api/m6/run \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "proj-1",
    "projectName": "my-app",
    "repoOwner": "user",
    "repoName": "repo",
    "title": "Add user auth",
    "description": "Implement JWT-based authentication"
  }'
# Returns: { runId, status: "queued", pollUrl, eventsUrl }
```

### Poll Status
```bash
curl https://codehive-ai.jjioji.workers.dev/api/m6/run/m6-1234567890-abc123
# Returns: { run: { status, progress, currentStep, ... }, steps: [...] }
```

### Stream Events (SSE)
```bash
curl -H "Accept: text/event-stream" \
  https://codehive-ai.jjioji.workers.dev/api/m6/run/m6-1234567890-abc123/events
```

### Resume a Stalled Run
```bash
curl -X POST https://codehive-ai.jjioji.workers.dev/api/m6/run/m6-1234567890-abc123/resume
```

### Retry a Failed Step
```bash
curl -X POST https://codehive-ai.jjioji.workers.dev/api/m6/run/m6-1234567890-abc123/retry \
  -H "Content-Type: application/json" \
  -d '{"stepName": "code"}'
```

## Backward Compatibility

- All M1–M5 routes remain unchanged
- M5 synchronous pipeline (`POST /api/m5/run`) still works
- M6 is an additive layer — no existing functionality removed
- 3 new Payload collections registered alongside existing 37
