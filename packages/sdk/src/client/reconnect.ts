export interface ReconnectionOptions {
  baseDelay?: number
  maxDelay?: number
  factor?: number
  maxAttempts?: number
}

/**
 * Reconnection policy with exponential backoff.
 */
export class ReconnectionPolicy {
  private _attempts = 0
  private baseDelay: number
  private maxDelay: number
  private factor: number
  private maxAttempts: number

  constructor(options: ReconnectionOptions = {}) {
    this.baseDelay = options.baseDelay ?? 1000
    this.maxDelay = options.maxDelay ?? 30000
    this.factor = options.factor ?? 2
    this.maxAttempts = options.maxAttempts ?? Infinity
  }

  get attempts(): number {
    return this._attempts
  }

  /**
   * Calculate the next delay with exponential backoff and jitter.
   */
  getNextDelay(): number {
    const delay = Math.min(
      this.baseDelay * Math.pow(this.factor, this._attempts),
      this.maxDelay
    )
    // Add jitter (0-1s)
    return delay + Math.random() * 1000
  }

  /**
   * Record a reconnection attempt.
   */
  recordAttempt(): void {
    this._attempts++
  }

  /**
   * Check if we should retry based on max attempts.
   */
  shouldRetry(): boolean {
    return this._attempts < this.maxAttempts
  }

  /**
   * Reset the policy after successful connection.
   */
  reset(): void {
    this._attempts = 0
  }
}
