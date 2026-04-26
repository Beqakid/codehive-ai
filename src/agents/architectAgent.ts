/**
 * Architect Agent — Phase 2
 * Calls Anthropic Claude with streaming to produce an architecture design.
 * Uses native fetch — no additional packages required.
 */

import type { RepoContext } from '../lib/github'

// Legacy interface kept for type compatibility
export interface ArchitectureDesign {
  overview: string
  components: Array<{
    name: string
    type: 'frontend' | 'backend' | 'shared' | 'database'
    description: string
    dependencies: string[]
  }>
  dataModels: Array<{
    name: string
    fields: Array<{ name: string; type: string; required: boolean }>
  }>
  apiEndpoints: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    path: string
    description: string
  }>
  fileStructure: string[]
  techStack: string[]
}

export interface ArchitectAgentInput {
  title: string
  description: string
  productSpec: string
  repoContext?: RepoContext
}

export async function runArchitectAgent(
  input: ArchitectAgentInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured')

  const repoSection = input.repoContext
    ? `\n## Repository: ${input.repoContext.owner}/${input.repoContext.repo}\n${input.repoContext.description}\n\n### File Structure\n${input.repoContext.structure}\n\n${input.repoContext.files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')}`
    : ''

  const systemPrompt = `You are a senior software architect specializing in TypeScript, Next.js, and Cloudflare Workers. Design practical, implementable technical plans. Be specific about files, components, and data models. Use markdown formatting.`

  const userPrompt = `# Coding Request
**Title:** ${input.title}
**Description:** ${input.description}

# Product Specification
${input.productSpec}
${repoSection}

Design the technical architecture with:
1. **Overview** — high-level approach (2-3 sentences)
2. **Components** — list each with type (frontend/backend/shared/database) and responsibility
3. **Data Models** — key entities and their fields
4. **API Endpoints** — routes that need to be created or modified
5. **File Structure** — specific files to create or modify
6. **Implementation Steps** — ordered action plan`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok || !response.body) {
    const err = await response.text()
    throw new Error(`Anthropic API error ${response.status}: ${err}`)
  }

  return parseAnthropicStream(response.body, onChunk)
}

async function parseAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      try {
        const json = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
          const text = json.delta.text || ''
          if (text) {
            fullContent += text
            onChunk(text)
          }
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullContent
}
