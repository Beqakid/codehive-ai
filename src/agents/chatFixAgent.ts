/**
 * @module chatFixAgent
 * @description Conversational debugging agent using Claude Sonnet 4.6.
 * Helps users interactively diagnose and fix CI/CD failures.
 * Can propose code fixes via structured FIX_PROPOSAL blocks.
 * Exports: streamChatFix, extractFixProposal, stripFixProposal.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface FixContext {
  projectName: string
  branchName: string
  prNumber: number
  planSummary: string
  fixAttempts: Array<{
    attemptNumber: number
    status: string
    errorCategory: string
    errorSummary: string
    fixSummary?: string
    filesUpdated?: string[]
    confidence?: number
    riskLevel?: string
    rawLogs?: string
  }>
}

export interface FixProposal {
  summary: string
  files: Array<{ path: string; content: string }>
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 16000

function buildSystemPrompt(ctx: FixContext): string {
  let prompt = `You are CodeHive's Interactive Fix Assistant — a friendly, expert debugging partner helping a developer fix CI/CD failures.

## Context
- Project: ${ctx.projectName}
- Branch: ${ctx.branchName}
- PR: #${ctx.prNumber}

## Plan Summary
${ctx.planSummary.slice(0, 2000) || 'No plan summary available.'}

## Automated Fix Attempts`

  if (ctx.fixAttempts.length === 0) {
    prompt += '\nNo automated fix attempts have been made yet.'
  } else {
    for (const a of ctx.fixAttempts) {
      prompt += `\n\n### Attempt #${a.attemptNumber} — ${a.status.toUpperCase()}`
      prompt += `\n- Error Category: ${a.errorCategory}`
      prompt += `\n- Error: ${a.errorSummary}`
      if (a.fixSummary) prompt += `\n- Fix Applied: ${a.fixSummary}`
      if (a.filesUpdated?.length) prompt += `\n- Files Changed: ${a.filesUpdated.join(', ')}`
      if (a.confidence != null) prompt += `\n- Confidence: ${Math.round(a.confidence * 100)}%`
      if (a.riskLevel) prompt += `\n- Risk: ${a.riskLevel}`
      if (a.rawLogs) prompt += `\n- Logs:\n\`\`\`\n${a.rawLogs.slice(0, 4000)}\n\`\`\``
    }
  }

  prompt += `

## Your Behavior
1. Be conversational, helpful, and clear — explain errors in plain language
2. Reference specific error messages and line numbers from the logs
3. Ask clarifying questions when you need more info from the developer
4. When confident about a fix, propose it using the format below
5. Explain WHY your fix works, not just what changed
6. Be honest about uncertainty — say when you're not sure

## Proposing Fixes
When you want to propose a code fix, end your message with a fix proposal block.
The block MUST contain valid JSON wrapped in <FIX_PROPOSAL> tags:

<FIX_PROPOSAL>
{
  "summary": "Brief description of the fix",
  "files": [
    { "path": "relative/path/to/file.ts", "content": "FULL corrected file content here" }
  ]
}
</FIX_PROPOSAL>

RULES:
- Include COMPLETE file content — not patches or diffs
- Only include files that actually need to change
- Only propose fixes when you're confident — otherwise keep discussing
- The <FIX_PROPOSAL> tags should ONLY appear when proposing an actual fix
- You can have multiple conversation turns before proposing a fix`

  return prompt
}

export async function streamChatFix(
  context: FixContext,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

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
      stream: true,
      system: buildSystemPrompt(context),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => 'unknown')
    throw new Error(`Anthropic API error (${resp.status}): ${body.slice(0, 300)}`)
  }

  if (!resp.body) throw new Error('No response body from Anthropic')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data) as {
          type: string
          delta?: { type: string; text?: string }
        }
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text || ''
          fullText += text
          onChunk(text)
        }
      } catch {
        // skip malformed events
      }
    }
  }

  return fullText
}

export function extractFixProposal(text: string): FixProposal | null {
  const match = text.match(/<FIX_PROPOSAL>\s*([\s\S]*?)\s*<\/FIX_PROPOSAL>/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1]) as FixProposal
    if (!parsed.summary || !Array.isArray(parsed.files) || parsed.files.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function stripFixProposal(text: string): string {
  return text.replace(/<FIX_PROPOSAL>[\s\S]*?<\/FIX_PROPOSAL>/, '').trim()
}
