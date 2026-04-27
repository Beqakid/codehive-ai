/**
 * POST /api/coach/refine — Prompt Coach refinement endpoint
 *
 * Takes the original prompt + user answers to clarifying questions,
 * returns a fully enriched prompt ready for the pipeline.
 */

import { enrichWithAnswers } from '../../../../../agents/promptCoachAgent'
import type { CoachQuestion } from '../../../../../agents/promptCoachAgent'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt?: string
      questions?: CoachQuestion[]
      answers?: Record<string, string>
    }

    const prompt = body.prompt?.trim()
    if (!prompt || !body.questions?.length || !body.answers) {
      return Response.json(
        { error: 'Missing required fields: prompt, questions, answers' },
        { status: 400 },
      )
    }

    const result = await enrichWithAnswers(prompt, body.questions, body.answers)
    return Response.json(result)
  } catch (err) {
    console.error('[coach/refine] error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Refinement failed' },
      { status: 500 },
    )
  }
}
