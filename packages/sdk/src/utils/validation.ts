// UUID v4 regex pattern
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Valid repo path pattern: owner/repo with alphanumeric, hyphens, underscores, dots
const REPO_PATH_PATTERN = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/

const MAX_MESSAGE_LENGTH = 1_000_000

/**
 * Validate a session ID is a valid UUID v4.
 */
export function isValidSessionId(id: string): boolean {
  if (!id || typeof id !== 'string') return false
  return UUID_PATTERN.test(id)
}

/**
 * Validate a repository path (owner/repo format).
 */
export function isValidRepoPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false
  // Check for null bytes
  if (path.includes('\x00')) return false
  // Check for path traversal
  if (path.includes('..')) return false
  return REPO_PATH_PATTERN.test(path)
}

/**
 * Validate message content and return it if valid.
 * @throws Error if message is too long
 */
export function validateMessageContent(content: string): string {
  if (content.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long: ${content.length} chars (max ${MAX_MESSAGE_LENGTH})`)
  }
  return content
}
