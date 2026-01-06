/**
 * Async Utilities
 *
 * Helper functions for handling asynchronous operations safely.
 */

/**
 * Execute a promise in the background, logging any errors.
 * Use this for fire-and-forget operations that should not block.
 *
 * @param promise - The promise to execute
 * @param context - A description of the operation for error logging
 *
 * @example
 * ```typescript
 * // Instead of:
 * this.persistSessions() // Unhandled rejection if this fails!
 *
 * // Use:
 * fireAndForget(this.persistSessions(), 'persist sessions')
 * ```
 */
export function fireAndForget(
  promise: Promise<unknown>,
  context: string
): void {
  promise.catch(error => {
    console.error(`Background task failed (${context}):`, error)
  })
}
