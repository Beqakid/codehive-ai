/**
 * @module diffEngine
 * @description Milestone 3 — Unified diff generation engine.
 * Creates human-readable diffs, structured metadata, and review summaries
 * for AI-generated patches. No external dependencies — pure TypeScript.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

export interface FileDiff {
  filePath: string
  operation: 'add' | 'modify'
  hunks: DiffHunk[]
  additions: number
  deletions: number
  oldContent: string | null
  newContent: string
}

export interface DiffSummary {
  totalFiles: number
  totalAdditions: number
  totalDeletions: number
  filesAdded: string[]
  filesModified: string[]
  diffs: FileDiff[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a unified diff between two strings.
 * Uses a simple LCS-based approach suitable for Workers runtime.
 */
export function generateDiff(
  filePath: string,
  oldContent: string | null,
  newContent: string,
): FileDiff {
  const operation = oldContent === null ? 'add' : 'modify'
  const oldLines = oldContent ? oldContent.split('\n') : []
  const newLines = newContent.split('\n')

  if (operation === 'add') {
    const lines: DiffLine[] = newLines.map((line, i) => ({
      type: 'add' as const,
      content: line,
      newLineNumber: i + 1,
    }))
    return {
      filePath,
      operation,
      hunks: [{ oldStart: 0, oldCount: 0, newStart: 1, newCount: newLines.length, lines }],
      additions: newLines.length,
      deletions: 0,
      oldContent,
      newContent,
    }
  }

  // Simple diff: compute LCS for change detection
  const hunks = computeHunks(oldLines, newLines)
  let additions = 0
  let deletions = 0
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === 'add') additions++
      else if (line.type === 'remove') deletions++
    }
  }

  return { filePath, operation, hunks, additions, deletions, oldContent, newContent }
}

/**
 * Build a summary from multiple file diffs.
 */
export function buildDiffSummary(diffs: FileDiff[]): DiffSummary {
  const filesAdded: string[] = []
  const filesModified: string[] = []
  let totalAdditions = 0
  let totalDeletions = 0

  for (const d of diffs) {
    if (d.operation === 'add') filesAdded.push(d.filePath)
    else filesModified.push(d.filePath)
    totalAdditions += d.additions
    totalDeletions += d.deletions
  }

  return {
    totalFiles: diffs.length,
    totalAdditions,
    totalDeletions,
    filesAdded,
    filesModified,
    diffs,
  }
}

/**
 * Format a FileDiff as unified diff text (like git diff).
 */
export function formatUnifiedDiff(diff: FileDiff): string {
  const lines: string[] = []
  const oldPath = diff.operation === 'add' ? '/dev/null' : `a/${diff.filePath}`
  const newPath = `b/${diff.filePath}`

  lines.push(`--- ${oldPath}`)
  lines.push(`+++ ${newPath}`)

  for (const hunk of diff.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`)
    for (const line of hunk.lines) {
      if (line.type === 'add') lines.push(`+${line.content}`)
      else if (line.type === 'remove') lines.push(`-${line.content}`)
      else lines.push(` ${line.content}`)
    }
  }

  return lines.join('\n')
}

/**
 * Format the full diff summary as text (multi-file).
 */
export function formatDiffSummaryText(summary: DiffSummary): string {
  const parts: string[] = [
    `${summary.totalFiles} file(s) changed, ${summary.totalAdditions} insertion(s)(+), ${summary.totalDeletions} deletion(s)(-)`,
    '',
  ]
  for (const diff of summary.diffs) {
    parts.push(formatUnifiedDiff(diff))
    parts.push('')
  }
  return parts.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers — simple diff algorithm
// ─────────────────────────────────────────────────────────────────────────────

interface EditOp {
  type: 'keep' | 'insert' | 'delete'
  oldIdx?: number
  newIdx?: number
  text: string
}

function computeEditScript(oldLines: string[], newLines: string[]): EditOp[] {
  const m = oldLines.length
  const n = newLines.length

  // For very large files, use a simpler approach to avoid memory issues
  if (m + n > 5000) {
    return simpleFallbackDiff(oldLines, newLines)
  }

  // Standard LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const ops: EditOp[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'keep', oldIdx: i - 1, newIdx: j - 1, text: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'insert', newIdx: j - 1, text: newLines[j - 1] })
      j--
    } else {
      ops.unshift({ type: 'delete', oldIdx: i - 1, text: oldLines[i - 1] })
      i--
    }
  }

  return ops
}

function simpleFallbackDiff(oldLines: string[], newLines: string[]): EditOp[] {
  // For large files: mark all old as deleted, all new as inserted
  const ops: EditOp[] = []
  for (let i = 0; i < oldLines.length; i++) {
    ops.push({ type: 'delete', oldIdx: i, text: oldLines[i] })
  }
  for (let j = 0; j < newLines.length; j++) {
    ops.push({ type: 'insert', newIdx: j, text: newLines[j] })
  }
  return ops
}

function computeHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  const ops = computeEditScript(oldLines, newLines)

  // Group ops into hunks with 3 lines of context
  const CONTEXT = 3
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let contextGap = 0

  let oldLine = 1
  let newLine = 1

  for (const op of ops) {
    if (op.type === 'keep') {
      if (currentHunk) {
        contextGap++
        if (contextGap > CONTEXT * 2) {
          // Close the hunk
          hunks.push(currentHunk)
          currentHunk = null
          contextGap = 0
        } else {
          currentHunk.lines.push({ type: 'context', content: op.text, oldLineNumber: oldLine, newLineNumber: newLine })
          currentHunk.oldCount++
          currentHunk.newCount++
        }
      }
      oldLine++
      newLine++
    } else {
      if (!currentHunk) {
        // Start new hunk — add preceding context
        const contextStart = Math.max(0, (op.type === 'delete' ? (op.oldIdx ?? 0) : (op.newIdx ?? 0)) - CONTEXT)
        currentHunk = {
          oldStart: Math.max(1, oldLine - CONTEXT),
          oldCount: 0,
          newStart: Math.max(1, newLine - CONTEXT),
          newCount: 0,
          lines: [],
        }
      }
      contextGap = 0

      if (op.type === 'delete') {
        currentHunk.lines.push({ type: 'remove', content: op.text, oldLineNumber: oldLine })
        currentHunk.oldCount++
        oldLine++
      } else {
        currentHunk.lines.push({ type: 'add', content: op.text, newLineNumber: newLine })
        currentHunk.newCount++
        newLine++
      }
    }
  }

  if (currentHunk) hunks.push(currentHunk)
  return hunks
}
