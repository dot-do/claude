/**
 * @module write-batching
 * @packageDocumentation
 *
 * Write Batching for Storage Operations
 *
 * Coalesces multiple rapid writes into single storage operations to reduce
 * I/O overhead. Uses a configurable batch window to collect writes before
 * flushing to storage.
 *
 * ## Key Features
 *
 * - **Configurable batch window** - Default 100ms, adjustable per use case
 * - **Immediate flush on session end** - Ensures data is persisted before cleanup
 * - **Error resilience** - Continues operating after storage failures
 * - **Metrics tracking** - Monitor coalescing efficiency
 *
 * ## Use Cases
 *
 * - Session state persistence in Durable Objects
 * - High-frequency updates (e.g., typing indicators, cursor positions)
 * - Reducing storage write costs in serverless environments
 *
 * @example Basic usage
 * ```typescript
 * const batcher = new WriteBatcher<SessionData>({
 *   batchWindowMs: 100,
 *   storage: async (data) => {
 *     await state.storage.put('sessions', data)
 *   },
 *   onError: (error) => console.error('Storage failed:', error),
 * })
 *
 * // Multiple writes within 100ms are coalesced
 * batcher.write(sessionData1)
 * batcher.write(sessionData2)
 * batcher.write(sessionData3) // Only this is persisted
 *
 * // Flush immediately on session end
 * await batcher.flush()
 * ```
 *
 * @example With metrics
 * ```typescript
 * // After some operations...
 * const metrics = batcher.getMetrics()
 * console.log(`Coalescing ratio: ${(metrics.coalescingRatio * 100).toFixed(1)}%`)
 * // Output: "Coalescing ratio: 80.0%" (4 out of 5 writes saved)
 * ```
 *
 * @since 1.0.0
 */

/**
 * Configuration options for WriteBatcher.
 *
 * @template T - The type of data being batched
 * @since 1.0.0
 */
export interface WriteBatcherOptions<T> {
  /**
   * Batch window in milliseconds. Writes within this window are coalesced
   * into a single storage operation.
   *
   * Lower values provide faster persistence but less coalescing.
   * Higher values provide better coalescing but delayed persistence.
   *
   * @default 100
   */
  readonly batchWindowMs?: number

  /**
   * Storage function to persist data. Called with the most recent value
   * when the batch window expires or flush() is called.
   *
   * This function should be idempotent - it may be called with the same
   * data if a retry occurs after a transient error.
   *
   * @param data - The most recent data to persist
   * @returns Promise that resolves when storage is complete
   * @throws If storage fails (will be caught and passed to onError)
   */
  readonly storage: (data: T) => Promise<void>

  /**
   * Callback invoked when storage operation fails.
   * The batcher continues operating after errors, allowing recovery.
   *
   * Use this to log errors, trigger alerts, or implement retry logic.
   *
   * @param error - The error from the storage operation
   */
  readonly onError?: (error: Error) => void
}

/**
 * Metrics for tracking write coalescing efficiency.
 *
 * These metrics help monitor the effectiveness of batching and can be
 * used for performance tuning and observability.
 *
 * @since 1.0.0
 */
export interface WriteBatcherMetrics {
  /**
   * Total number of write() calls received.
   * Represents the total demand for storage operations.
   */
  readonly totalWritesQueued: number

  /**
   * Total number of actual storage operations performed.
   * This is the number of times the storage function was called.
   */
  readonly totalFlushes: number

  /**
   * Number of writes that were coalesced (saved).
   * Calculated as: totalWritesQueued - totalFlushes
   */
  readonly writesCoalesced: number

  /**
   * Number of storage errors encountered.
   * Errors are passed to onError but don't stop the batcher.
   */
  readonly storageErrors: number

  /**
   * Ratio of writes saved through coalescing (0-1).
   *
   * - 0 = No coalescing (every write triggers storage)
   * - 0.8 = 80% of writes were coalesced (4 out of 5 writes saved)
   * - 1 = Maximum coalescing (would require infinite batch window)
   *
   * Calculated as: writesCoalesced / totalWritesQueued
   */
  readonly coalescingRatio: number
}

/**
 * Internal metrics state (mutable).
 * @internal
 */
interface InternalMetrics {
  totalWritesQueued: number
  totalFlushes: number
  storageErrors: number
}

/**
 * WriteBatcher coalesces multiple rapid writes into single storage operations.
 *
 * ## How It Works
 *
 * When write() is called, it schedules a flush after the batch window expires.
 * Subsequent writes within the window update the pending data and reset the timer.
 * Only the most recent value is persisted when the timer fires.
 *
 * ```
 * Time: 0ms   50ms  100ms  150ms  200ms  250ms
 *       |     |     |      |      |      |
 *       W1    W2    W3            |      Flush(W3)
 *       |-----|-----|-------------|
 *             |-----|-------------|
 *                   |-------------|
 *                   100ms window expires
 * ```
 *
 * ## Thread Safety
 *
 * This class is designed for single-threaded JavaScript execution.
 * For Durable Objects, the DO's own concurrency guarantees apply.
 *
 * ## Performance Characteristics
 *
 * - O(1) for write() operations
 * - Memory: Stores only the most recent pending value
 * - Timer overhead: One active timer at most
 *
 * @template T - The type of data being batched
 * @since 1.0.0
 */
export class WriteBatcher<T> {
  private readonly batchWindowMs: number
  private readonly storage: (data: T) => Promise<void>
  private readonly onError?: (error: Error) => void

  /** Data waiting to be flushed, undefined if no pending writes */
  private pendingData: T | undefined = undefined

  /** Timer for the batch window, null if no flush scheduled */
  private timer: ReturnType<typeof setTimeout> | null = null

  /** Whether the batcher has been destroyed */
  private destroyed = false

  /** Promise for in-progress flush, prevents concurrent flushes */
  private flushPromise: Promise<void> | null = null

  /** Internal mutable metrics state */
  private metrics: InternalMetrics = {
    totalWritesQueued: 0,
    totalFlushes: 0,
    storageErrors: 0,
  }

  constructor(options: WriteBatcherOptions<T>) {
    this.batchWindowMs = options.batchWindowMs ?? 100
    this.storage = options.storage
    this.onError = options.onError
  }

  /**
   * Queue a write operation. The data will be persisted after the batch
   * window expires, or immediately if flush() is called.
   *
   * Multiple writes within the batch window are coalesced - only the
   * most recent value is persisted.
   *
   * @param data - The data to persist
   */
  write(data: T): void {
    if (this.destroyed) {
      return
    }

    this.metrics.totalWritesQueued++
    this.pendingData = data

    // Reset timer on each write (debounce behavior)
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.timer = setTimeout(() => {
      this.doFlush().catch(() => {
        // Error handled in doFlush
      })
    }, this.batchWindowMs)
  }

  /**
   * Immediately flush any pending writes to storage.
   * Useful for session end or when immediate persistence is required.
   *
   * This method is idempotent - calling it multiple times concurrently
   * will only trigger one storage operation.
   */
  async flush(): Promise<void> {
    // Return existing flush promise if already in progress
    if (this.flushPromise) {
      return this.flushPromise
    }

    return this.doFlush()
  }

  /**
   * Flush pending writes due to an error condition.
   * Ensures data is persisted before error handling completes.
   *
   * @param _error - The error that triggered the flush (for logging/context)
   */
  async flushOnError(_error: Error): Promise<void> {
    return this.flush()
  }

  /**
   * Destroy the batcher, flushing any pending writes.
   * After destruction, write() calls are ignored.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    await this.flush()
  }

  /**
   * Get current metrics for write coalescing efficiency.
   */
  getMetrics(): WriteBatcherMetrics {
    const writesCoalesced = this.metrics.totalWritesQueued - this.metrics.totalFlushes
    const coalescingRatio = this.metrics.totalWritesQueued > 0
      ? writesCoalesced / this.metrics.totalWritesQueued
      : 0

    return {
      totalWritesQueued: this.metrics.totalWritesQueued,
      totalFlushes: this.metrics.totalFlushes,
      writesCoalesced,
      storageErrors: this.metrics.storageErrors,
      coalescingRatio,
    }
  }

  /**
   * Reset all metrics to zero.
   */
  resetMetrics(): void {
    this.metrics = {
      totalWritesQueued: 0,
      totalFlushes: 0,
      storageErrors: 0,
    }
  }

  /**
   * Internal flush implementation
   */
  private async doFlush(): Promise<void> {
    // Cancel any pending timer
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }

    // Nothing to flush
    if (this.pendingData === undefined) {
      return
    }

    // Track the flush promise to prevent concurrent flushes
    const data = this.pendingData
    this.pendingData = undefined

    this.flushPromise = (async () => {
      try {
        await this.storage(data)
        this.metrics.totalFlushes++
      } catch (error) {
        this.metrics.storageErrors++
        if (this.onError) {
          this.onError(error instanceof Error ? error : new Error(String(error)))
        }
      }
    })()

    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
  }
}
