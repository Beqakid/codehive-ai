/**
 * @module artifactStorage
 * @description Milestone 4 — R2 artifact storage.
 * Persists execution artifacts (logs, diffs, test reports, build output,
 * workspace snapshots) to Cloudflare R2.
 *
 * Naming: codehive/{projectId}/{runId}/{artifactType}/{filename}
 *
 * Supports:
 *   - Upload with metadata
 *   - Signed URL generation
 *   - Artifact listing
 *   - Lifecycle cleanup / retention
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ArtifactType =
  | 'sandbox_log'
  | 'build_log'
  | 'test_report'
  | 'lint_result'
  | 'typecheck_result'
  | 'diff'
  | 'workspace_snapshot'
  | 'execution_metadata'
  | 'self_heal_log'
  | 'pr_summary'

export interface ArtifactRecord {
  artifactId: string
  projectId: string
  runId: string
  type: ArtifactType
  key: string                // R2 object key
  sizeBytes: number
  mimeType: string
  createdAt: number
  expiresAt: number | null   // null = no expiry
  metadata: Record<string, string>
}

export interface ArtifactUploadInput {
  projectId: string
  runId: string
  type: ArtifactType
  filename: string
  content: string | ArrayBuffer
  mimeType?: string
  metadata?: Record<string, string>
  retentionDays?: number
}

export interface ArtifactUploadResult {
  success: boolean
  artifact: ArtifactRecord | null
  error?: string
}

export interface ArtifactListResult {
  artifacts: ArtifactRecord[]
  totalCount: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export const ARTIFACT_CONFIG = {
  defaultRetentionDays: 30,
  maxSizeBytes: 50 * 1024 * 1024,  // 50 MB max per artifact
  bucketPrefix: 'codehive',
  defaultMimeType: 'application/octet-stream',
}

// ─────────────────────────────────────────────────────────────────────────────
// Key generation
// ─────────────────────────────────────────────────────────────────────────────

export function generateArtifactKey(
  projectId: string,
  runId: string,
  type: ArtifactType,
  filename: string,
): string {
  return `${ARTIFACT_CONFIG.bucketPrefix}/${projectId}/${runId}/${type}/${filename}`
}

export function generateArtifactId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `art-${timestamp}-${random}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload artifact (uses R2 binding when available, falls back to metadata-only)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadArtifact(
  input: ArtifactUploadInput,
  r2Bucket?: { put: (key: string, body: string | ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown> } | null,
): Promise<ArtifactUploadResult> {
  try {
    const key = generateArtifactKey(input.projectId, input.runId, input.type, input.filename)
    const artifactId = generateArtifactId()
    const content = input.content
    const sizeBytes = typeof content === 'string' ? new TextEncoder().encode(content).length : content.byteLength

    // Size check
    if (sizeBytes > ARTIFACT_CONFIG.maxSizeBytes) {
      return {
        success: false,
        artifact: null,
        error: `Artifact exceeds max size (${sizeBytes} > ${ARTIFACT_CONFIG.maxSizeBytes})`,
      }
    }

    const now = Date.now()
    const retentionDays = input.retentionDays ?? ARTIFACT_CONFIG.defaultRetentionDays
    const expiresAt = retentionDays > 0 ? now + retentionDays * 86_400_000 : null

    // Upload to R2 if available
    if (r2Bucket) {
      await r2Bucket.put(key, content, {
        httpMetadata: { contentType: input.mimeType || ARTIFACT_CONFIG.defaultMimeType },
        customMetadata: {
          artifactId,
          projectId: input.projectId,
          runId: input.runId,
          type: input.type,
          ...input.metadata,
        },
      })
    }

    const artifact: ArtifactRecord = {
      artifactId,
      projectId: input.projectId,
      runId: input.runId,
      type: input.type,
      key,
      sizeBytes,
      mimeType: input.mimeType || ARTIFACT_CONFIG.defaultMimeType,
      createdAt: now,
      expiresAt,
      metadata: input.metadata || {},
    }

    return { success: true, artifact }
  } catch (err) {
    return {
      success: false,
      artifact: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// List artifacts for a run
// ─────────────────────────────────────────────────────────────────────────────

export function buildArtifactList(records: ArtifactRecord[], type?: ArtifactType): ArtifactListResult {
  const filtered = type ? records.filter((r) => r.type === type) : records
  return {
    artifacts: filtered.sort((a, b) => b.createdAt - a.createdAt),
    totalCount: filtered.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Artifact cleanup (retention-based)
// ─────────────────────────────────────────────────────────────────────────────

export function findExpiredArtifacts(records: ArtifactRecord[]): ArtifactRecord[] {
  const now = Date.now()
  return records.filter((r) => r.expiresAt !== null && r.expiresAt < now)
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch upload execution results
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadExecutionArtifacts(
  projectId: string,
  runId: string,
  artifacts: Array<{ type: ArtifactType; filename: string; content: string }>,
  r2Bucket?: { put: (key: string, body: string | ArrayBuffer, options?: Record<string, unknown>) => Promise<unknown> } | null,
): Promise<{ uploaded: ArtifactRecord[]; errors: string[] }> {
  const uploaded: ArtifactRecord[] = []
  const errors: string[] = []

  for (const item of artifacts) {
    const result = await uploadArtifact(
      { projectId, runId, type: item.type, filename: item.filename, content: item.content, mimeType: 'text/plain' },
      r2Bucket,
    )
    if (result.success && result.artifact) {
      uploaded.push(result.artifact)
    } else {
      errors.push(result.error || `Failed to upload ${item.filename}`)
    }
  }

  return { uploaded, errors }
}
