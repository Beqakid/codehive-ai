/**
 * Product Agent — Phase 2
 * Calls OpenAI GPT-4.1 with streaming to produce a product specification.
 * Uses native fetch — no additional packages required.
 */

import type { RepoContext } from '../lib/github'
import { parseOpenAIStream } from '../lib/stream-parsers'
import { withRetry } from '../lib/retry'

// Legacy interface kept for type compatibility
export interface ProductSpec {
  summary: string
  userStories: Array<{
    id: string
    title: string
    description: string
    acceptanceCriteria: string[]
  }>
  scope: { included: string[]; excluded: string[] }
  estimatedComplexity: 'low' | 'medium' | 'high'
}

export interface ProductAgentInput {
  title: string
  description: string
  projectName: string
  repoContext?: RepoContext
}

export async function runProductAgent(
  input: ProductAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const repoSection = input.repoContext
    ? `\n## Repository: ${input.repoContext.owner}/${input.repoContext.repo}\n${input.repoContext.description}\n\n### File Structure\n${input.repoContext.structure}\n\n${input.repoContext.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
    : ''

  const systemPrompt = `You are a senior product manager. Analyze coding requests and produce clear, actionable product specifications. Be concise and structured. Use markdown formatting.`

  const userPrompt = `# Coding Request
**Project:** ${input.projectName}
**Title:** ${input.title}
**Description:** ${input.description}
${repoSection}

Write a product specification including:
1. **Summary** — 2-3 sentences describing what will be built
2. **User Stories** — 2-3 stories with acceptance criteria
3. **Scope** — what's in and out of scope
4. **Estimated Complexity** — low/medium/high with brief reasoning`

  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        max_tokens: 2000,
      }),
    })

    if (!res.ok || !res.body) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }

    return res
  })

  return parseOpenAIStream(response.body!, onChunk)
}
