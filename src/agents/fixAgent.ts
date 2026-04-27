/**
 * @module fixAgent
 * @description Self-fix agent using Claude Sonnet 4.6. Receives error context from failed
 * GitHub Actions runs and proposes file corrections. Returns strict JSON with full file
 * replacements, confidence scores, and risk assessment.
 * Exports: runFixAgent, FixAgentInput, FixAgentResult.
 */

import { withRetry } from '../lib/retry'

export interface FixAgentInput {
  projectName: string
  branchName: string
  failedCommand: string
  exitCode: number | null
  errorCategory: string
  errorSummary: string
  rawLogs: string
  repoFiles: Array<{ path: string; content: string }>
  packageJson?: string
  tsconfigJson?: string
  previousAttempts: Array<{
    attemptNumber: number
    errorCategory: string
    errorSummary: string
    fixSummary: string
    filesUpdated: string[]
    result: string
  }>
}

export interface FixAgentResult {
  summary: string
  confidence: number
  rootCause: string
  filesToUpdate: Array<{ path: string; content: string }>
  commandsToRerun: string[]
  riskLevel: 'low' | 'medium' | 'high'
  needsHumanReview: boolean
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 16000

function buildSystemPrompt(): string {
  return `You are an expert software engineer specializing in debugging and fixing CI/CD failures.
You receive failed workflow logs, error context, and source files from a GitHub Actions pipeline.
Your job is to analyze the failure, identify the root cause, and produce corrected file contents.

RULES:
- Return ONLY valid JSON — no markdown fences, no explanation outside the JSON object
- Use full file replacement — return the COMPLETE corrected file content for each file
- Only modify files that are directly related to the error
- Never delete files that aren't part of the error
- If the error is about missing dependencies, update package.json to add them
- If the error is a TypeScript type error, fix the types in the source files
- If tests fail, fix the implementation unless the test itself is clearly wrong
- Be conservative — make the minimum changes needed to fix the error
- If you are not confident the fix will work (< 0.65), set needsHumanReview to true
- If the fix is risky or changes many files, set riskLevel to "high"

Your response must be EXACTLY this JSON structure (no other text):
{
  "summary": "Brief description of what was fixed",
  "confidence": 0.0,
  "rootCause": "What caused the failure",
  "filesToUpdate": [
    { "path": "relative/file/path.ts", "content": "full corrected file content" }
  ],
  "commandsToRerun": ["npm test"],
  "riskLevel": "low",
  "needsHumanReview": false
}`
}

function buildUserPrompt(input: FixAgentInput): string {
  let prompt = `# Failed CI/CD Pipeline — Fix Required

## Project: ${input.projectName}
## Branch: ${input.branchName}
## Failed Command: ${input.failedCommand}
## Exit Code: ${input.exitCode ?? 'unknown'}
## Error Category: ${input.errorCategory}

## Error Summary
\`\`\`
${input.errorSummary}
\`\`\`

## Workflow Logs (truncated)
\`\`\`
${input.rawLogs.slice(0, 8000)}
\`\`\``

  if (input.packageJson) {
    prompt += `\n\n## package.json\n\`\`\`json\n${input.packageJson}\n\`\`\``
  }

  if (input.tsconfigJson) {
    prompt += `\n\n## tsconfig.json\n\`\`\`json\n${input.tsconfigJson}\n\`\`\``
  }

  if (input.repoFiles.length > 0) {
    prompt += `\n\n## Source Files (related to error)`
    for (const file of input.repoFiles) {
      prompt += `\n\n### ${file.path}\n\`\`\`\n${file.content.slice(0, 4000)}\n\`\`\``
    }
  }

  if (input.previousAttempts.length > 0) {
    prompt += `\n\n## Previous Fix Attempts (FAILED — do NOT repeat these approaches)`
    for (const attempt of input.previousAttempts) {
      prompt += `\n\n### Attempt ${attempt.attemptNumber}`
      prompt += `\n- Error: ${attempt.errorCategory}`
      prompt += `\n- Summary: ${attempt.errorSummary.slice(0, 200)}`
      prompt += `\n- Fix applied: ${attempt.fixSummary}`
      prompt += `\n- Files changed: ${attempt.filesUpdated.join(', ')}`
      prompt += `\n- Result: ${attempt.result}`
    }
    prompt += `\n\nIMPORTANT: The above fixes did NOT work. You must try a DIFFERENT approach.`
  }

  prompt += `\n\nAnalyze the error and return a JSON fix. Only modify files needed to resolve this specific failure.`
  return prompt
}

export async function runFixAgent(
  input: FixAgentInput,
  onChunk?: (text: string) => void,
): Promise<FixAgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(input)

  const rawText = await withRetry(async () => {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => 'unknown')
      throw new Error(`Anthropic API error (${resp.status}): ${body.slice(0, 300)}`)
    }

    const data = (await resp.json()) as {
      content: Array<{ type: string; text?: string }>
    }

    const text = data.content
      ?.filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('')

    if (!text) throw new Error('Empty response from Fix Agent')

    if (onChunk) onChunk(text.slice(0, 200))

    return text
  })

  // Parse JSON — strip any markdown fencing Claude might add
  let jsonStr = rawText.trim()
  jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '')

  let parsed: FixAgentResult
  try {
    parsed = JSON.parse(jsonStr) as FixAgentResult
  } catch (err) {
    throw new Error(`Fix Agent returned invalid JSON: ${String(err)}\nRaw: ${jsonStr.slice(0, 500)}`)
  }

  // Validate required fields
  if (!parsed.summary || !parsed.rootCause || !Array.isArray(parsed.filesToUpdate)) {
    throw new Error('Fix Agent response missing required fields (summary, rootCause, filesToUpdate)')
  }

  // Normalize numeric confidence
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    parsed.confidence = 0.5
  }

  // Normalize riskLevel
  if (!['low', 'medium', 'high'].includes(parsed.riskLevel)) {
    parsed.riskLevel = 'medium'
  }

  // Normalize boolean
  if (typeof parsed.needsHumanReview !== 'boolean') {
    parsed.needsHumanReview = false
  }

  return parsed
}
