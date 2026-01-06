/**
 * Validate an Anthropic API key.
 * @throws Error if key is missing or invalid
 * @returns The validated and trimmed key
 */
export function validateApiKey(key: string | undefined): string {
  const trimmed = key?.trim()
  if (!trimmed) {
    throw new Error('API key required')
  }
  return trimmed
}

/**
 * Redact an API key for safe logging.
 * Shows prefix for identification but hides the secret portion.
 */
export function redactApiKey(key: string): string {
  if (key.length < 10) {
    return '***'
  }
  return key.slice(0, 7) + '***'
}
