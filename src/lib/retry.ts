/**
 * Simple retry wrapper with exponential backoff + jitter.
 * Retries on 429 (rate limit) and 5xx (server errors).
 */

interface RetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000 } = options

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const msg = lastError.message
      const isRetryable =
        msg.includes('429') ||
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('ECONNRESET') ||
        msg.includes('fetch failed')

      if (!isRetryable || attempt === maxRetries) throw lastError

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
      const jitter = Math.random() * delay * 0.3
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
    }
  }

  throw lastError
}
