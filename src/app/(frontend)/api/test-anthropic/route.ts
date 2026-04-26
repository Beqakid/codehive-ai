export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY || ''
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    })
    const body = await res.text()
    return Response.json({
      ok: res.ok,
      status: res.status,
      keyLength: apiKey.length,
      keyPrefix: apiKey.substring(0, 12) + '...',
      body,
    })
  } catch (e: unknown) {
    return Response.json({ error: String(e), keyLength: apiKey.length })
  }
}
