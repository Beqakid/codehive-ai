/**
 * POST /api/coach — Prompt Coach endpoint
 *
 * Analyzes a raw user prompt and returns either:
 * - Auto-enriched prompt with assumptions (detailed prompts)
 * - Clarifying questions (vague prompts)
 */

import { analyzePrompt } from '../../../../agents/promptCoachAgent'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: string }
    const prompt = body.prompt?.trim()

    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const analysis = await analyzePrompt(prompt)
    return Response.json(analysis)
  } catch (err) {
    console.error('[coach] error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Coach analysis failed' },
      { status: 500 },
    )
  }
}
