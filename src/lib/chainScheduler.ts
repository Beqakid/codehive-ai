/**
 * M6 Chain Scheduler
 *
 * Triggers the next pipeline step by making a fire-and-forget
 * fetch() to the process endpoint. Each step gets its own
 * CF Workers CPU budget via separate HTTP request.
 */

// ─── Internal Token ──────────────────────────────────────────────────

export function getInternalToken(): string {
  const secret = process.env.PAYLOAD_SECRET || 'codehive-default'
  return `codehive-chain-${secret.slice(0, 16)}`
}

export function validateInternalToken(token: string): boolean {
  return token === getInternalToken()
}

// ─── Chain to Next Step ──────────────────────────────────────────────

export function chainNextStep(
  requestUrl: string,
  runId: string,
  delayMs?: number
): void {
  const url = new URL(requestUrl)
  url.pathname = `/api/m6/process/${runId}`

  const doFetch = () => {
    fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Codehive-Chain': getInternalToken(),
      },
    }).catch((err) => {
      console.error(`[M6] Chain fetch failed for ${runId}:`, err)
    })
  }

  if (delayMs && delayMs > 0) {
    setTimeout(doFetch, Math.min(delayMs, 10000))
  } else {
    doFetch()
  }
}
