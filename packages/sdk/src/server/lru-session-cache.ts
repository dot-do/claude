/**
 * LRU Session Cache
 *
 * A Least Recently Used (LRU) cache for managing session data with automatic
 * eviction when the maximum session limit is reached.
 *
 * Sessions are tracked by last access time, and the least recently used
 * sessions are evicted when capacity is exceeded.
 */

/**
 * Session entry with metadata
 */
export interface SessionEntry<T> {
  data: T
  createdAt: number
  lastAccessedAt: number
}

/**
 * Configuration options for LRUSessionCache
 */
export interface LRUSessionCacheOptions<T> {
  /** Maximum number of sessions to keep in cache */
  maxSessions: number
  /** Number of sessions to evict when max is reached (default: 1) */
  evictCount?: number
  /** Callback invoked when a session is evicted */
  onEvict?: (sessionId: string, data: T) => void
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number
  maxSessions: number
  hits: number
  misses: number
  evictions: number
}

/**
 * LRU Session Cache implementation
 *
 * @example
 * ```typescript
 * const cache = new LRUSessionCache<SessionData>({
 *   maxSessions: 100,
 *   evictCount: 5,
 *   onEvict: (sessionId, data) => {
 *     console.log(`Session ${sessionId} evicted`)
 *   }
 * })
 *
 * // Add session
 * cache.set('session-1', { userId: 'user-123' })
 *
 * // Access session (updates LRU priority)
 * const data = cache.get('session-1')
 *
 * // Touch session (updates priority without returning data)
 * cache.touch('session-1')
 * ```
 */
export class LRUSessionCache<T> {
  private cache: Map<string, SessionEntry<T>> = new Map()
  private _maxSessions: number
  private evictCount: number
  private onEvict?: (sessionId: string, data: T) => void

  // Statistics
  private _hits: number = 0
  private _misses: number = 0
  private _evictions: number = 0

  constructor(options: LRUSessionCacheOptions<T>) {
    this._maxSessions = options.maxSessions
    this.evictCount = options.evictCount ?? 1
    this.onEvict = options.onEvict
  }

  /**
   * Get the current max sessions limit
   */
  get maxSessions(): number {
    return this._maxSessions
  }

  /**
   * Set the max sessions limit (triggers eviction if needed)
   */
  set maxSessions(value: number) {
    this._maxSessions = value
    this.evictIfNeeded()
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Set session data
   */
  set(sessionId: string, data: T): void {
    const now = Date.now()
    const existingEntry = this.cache.get(sessionId)

    if (existingEntry) {
      // Update existing entry
      existingEntry.data = data
      existingEntry.lastAccessedAt = now
    } else {
      // Create new entry
      this.cache.set(sessionId, {
        data,
        createdAt: now,
        lastAccessedAt: now,
      })
    }

    this.evictIfNeeded()
  }

  /**
   * Get session data (updates access time)
   */
  get(sessionId: string): T | undefined {
    const entry = this.cache.get(sessionId)

    if (!entry) {
      this._misses++
      return undefined
    }

    this._hits++
    entry.lastAccessedAt = Date.now()
    return entry.data
  }

  /**
   * Get session entry with metadata (for testing/debugging)
   */
  getEntry(sessionId: string): SessionEntry<T> | undefined {
    return this.cache.get(sessionId)
  }

  /**
   * Check if session exists
   */
  has(sessionId: string): boolean {
    return this.cache.has(sessionId)
  }

  /**
   * Touch a session (update access time without returning data)
   */
  touch(sessionId: string): boolean {
    const entry = this.cache.get(sessionId)
    if (!entry) {
      return false
    }

    entry.lastAccessedAt = Date.now()
    return true
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    return this.cache.delete(sessionId)
  }

  /**
   * Clear all sessions
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get all session IDs
   */
  keys(): IterableIterator<string> {
    return this.cache.keys()
  }

  /**
   * Get all session data values
   */
  *values(): IterableIterator<T> {
    for (const entry of this.cache.values()) {
      yield entry.data
    }
  }

  /**
   * Get all entries (sessionId, data pairs)
   */
  *entries(): IterableIterator<[string, T]> {
    for (const [sessionId, entry] of this.cache.entries()) {
      yield [sessionId, entry.data]
    }
  }

  /**
   * Iterate over all sessions
   */
  forEach(callback: (data: T, sessionId: string, cache: LRUSessionCache<T>) => void): void {
    for (const [sessionId, entry] of this.cache.entries()) {
      callback(entry.data, sessionId, this)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      size: this.cache.size,
      maxSessions: this._maxSessions,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
    }
  }

  /**
   * Evict sessions if cache exceeds max size
   */
  private evictIfNeeded(): void {
    if (this.cache.size <= this._maxSessions) {
      return
    }

    // Sort entries by last access time (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
    )

    // Calculate how many to evict: at minimum, enough to get under limit
    // If evictCount is specified and greater than the deficit, evict that many
    const deficit = this.cache.size - this._maxSessions
    const toEvict = Math.max(deficit, this.evictCount)

    // Evict oldest sessions
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      const [sessionId, entry] = entries[i]
      this.cache.delete(sessionId)
      this._evictions++

      if (this.onEvict) {
        this.onEvict(sessionId, entry.data)
      }
    }
  }
}
