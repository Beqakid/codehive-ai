/**
 * Codegen Agent — Phase 3
 *
 * Given a plan markdown and a specific file to generate,
 * produces implementation code using GPT-4.1 streaming.
 * Also provides parsePlanForFiles() to extract the file list from a plan.
 */

import { parseOpenAIStream } from '../lib/stream-parsers'
import { withRetry } from '../lib/retry'

export interface CodegenInput {
  planMarkdown: string
  filePath: string
  fileDescription: string
}

/** Generate code for a single file, streaming chunks back via onChunk. */
export async function runCodegenAgent(
  input: CodegenInput,
  onChunk: (text: string) => void,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const systemPrompt = `You are an expert software engineer. Generate clean, production-quality TypeScript/React/Node code. Output ONLY the file contents — no explanations, no markdown fences, no preamble. Just the raw code ready to save as-is.`

  const userPrompt = `Based on this agent plan, generate the complete implementation for:

**File:** ${input.filePath}
**Purpose:** ${input.fileDescription}

## Full Agent Plan
${input.planMarkdown.substring(0, 6000)}

Output only the complete file contents for ${input.filePath}. No markdown fences. No explanations.`

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
        max_tokens: 4000,
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

/** Ask GPT-4.1-mini to extract the list of files from the plan markdown. */
export async function parsePlanForFiles(
  planMarkdown: string,
): Promise<Array<{ path: string; description: string }>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')

  const systemPrompt = `You are a code analyst. Extract the list of source files to implement from a software plan. Return a JSON object with a "files" key containing an array of objects with "path" and "description" fields.`

  const userPrompt = `From this plan, extract ALL files that need to be created or implemented. Return ONLY a JSON object:
{"files": [{"path": "src/lib/auth.ts", "description": "JWT utilities"}, ...]}

Plan:
${planMarkdown.substring(0, 4000)}`

  const response = await withRetry(async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`)
    }

    return res
  })

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>
  }
  const content = data.choices[0]?.message?.content || '{"files":[]}'

  try {
    const parsed = JSON.parse(content) as {
      files?: Array<{ path: string; description: string }>
    }
    return Array.isArray(parsed.files) ? parsed.files : []
  } catch {
    return []
  }
}
