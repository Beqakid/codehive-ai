export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return Response.json({ ok: false, error: 'OPENAI_API_KEY secret not found' })
  }

  // Minimal non-streaming call — no repo context, just a simple prompt
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hello in one word.' }],
      max_tokens: 10,
    }),
  })

  const bodyText = await response.text()

  return Response.json({
    ok: response.ok,
    status: response.status,
    keyLength: apiKey.length,
    keyPrefix: apiKey.substring(0, 12) + '...',
    body: bodyText,
  })
}
