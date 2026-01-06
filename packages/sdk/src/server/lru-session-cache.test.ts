import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LRUSessionCache, type SessionEntry } from './lru-session-cache'

describe('LRUSessionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('session tracking by last access time', () => {
    it('tracks session access time on set', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      const now = Date.now()
      vi.setSystemTime(now)

      cache.set('session-1', 'data-1')

      const entry = cache.getEntry('session-1')
      expect(entry).toBeDefined()
      expect(entry!.lastAccessedAt).toBe(now)
    })

    it('tracks session access time on get', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      const startTime = Date.now()
      vi.setSystemTime(startTime)

      cache.set('session-1', 'data-1')

      // Advance time
      const laterTime = startTime + 5000
      vi.setSystemTime(laterTime)

      // Access the session
      cache.get('session-1')

      const entry = cache.getEntry('session-1')
      expect(entry!.lastAccessedAt).toBe(laterTime)
    })

    it('tracks creation time separately from access time', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      const createTime = Date.now()
      vi.setSystemTime(createTime)

      cache.set('session-1', 'data-1')

      const accessTime = createTime + 10000
      vi.setSystemTime(accessTime)

      cache.get('session-1')

      const entry = cache.getEntry('session-1')
      expect(entry!.createdAt).toBe(createTime)
      expect(entry!.lastAccessedAt).toBe(accessTime)
    })
  })

  describe('LRU eviction when max is reached', () => {
    it('evicts oldest session when max sessions reached', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 3 })
      const baseTime = Date.now()

      vi.setSystemTime(baseTime)
      cache.set('session-1', 'data-1')

      vi.setSystemTime(baseTime + 1000)
      cache.set('session-2', 'data-2')

      vi.setSystemTime(baseTime + 2000)
      cache.set('session-3', 'data-3')

      // Adding a 4th should evict session-1 (oldest)
      vi.setSystemTime(baseTime + 3000)
      cache.set('session-4', 'data-4')

      expect(cache.has('session-1')).toBe(false)
      expect(cache.has('session-2')).toBe(true)
      expect(cache.has('session-3')).toBe(true)
      expect(cache.has('session-4')).toBe(true)
      expect(cache.size).toBe(3)
    })

    it('evicts least recently used, not oldest created', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 3 })
      const baseTime = Date.now()

      // Create sessions
      vi.setSystemTime(baseTime)
      cache.set('session-1', 'data-1')

      vi.setSystemTime(baseTime + 1000)
      cache.set('session-2', 'data-2')

      vi.setSystemTime(baseTime + 2000)
      cache.set('session-3', 'data-3')

      // Access session-1, making it recently used
      vi.setSystemTime(baseTime + 3000)
      cache.get('session-1')

      // Adding 4th should evict session-2 (least recently used)
      vi.setSystemTime(baseTime + 4000)
      cache.set('session-4', 'data-4')

      expect(cache.has('session-1')).toBe(true) // Was accessed recently
      expect(cache.has('session-2')).toBe(false) // Evicted (LRU)
      expect(cache.has('session-3')).toBe(true)
      expect(cache.has('session-4')).toBe(true)
    })

    it('triggers onEvict callback when session is evicted', () => {
      const onEvict = vi.fn()
      const cache = new LRUSessionCache<string>({
        maxSessions: 2,
        onEvict,
      })

      cache.set('session-1', 'data-1')
      cache.set('session-2', 'data-2')

      // This should trigger eviction of session-1
      cache.set('session-3', 'data-3')

      expect(onEvict).toHaveBeenCalledTimes(1)
      expect(onEvict).toHaveBeenCalledWith('session-1', 'data-1')
    })
  })

  describe('accessing a session updates its priority', () => {
    it('get() updates last access time', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      const startTime = Date.now()
      vi.setSystemTime(startTime)

      cache.set('session-1', 'data-1')

      const accessTime = startTime + 5000
      vi.setSystemTime(accessTime)

      const data = cache.get('session-1')

      expect(data).toBe('data-1')
      expect(cache.getEntry('session-1')!.lastAccessedAt).toBe(accessTime)
    })

    it('touch() updates access time without returning data', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      const startTime = Date.now()
      vi.setSystemTime(startTime)

      cache.set('session-1', 'data-1')

      const touchTime = startTime + 5000
      vi.setSystemTime(touchTime)

      cache.touch('session-1')

      expect(cache.getEntry('session-1')!.lastAccessedAt).toBe(touchTime)
    })

    it('accessing keeps session from being evicted', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 3 })
      const baseTime = Date.now()

      vi.setSystemTime(baseTime)
      cache.set('session-1', 'data-1')
      vi.setSystemTime(baseTime + 100)
      cache.set('session-2', 'data-2')
      vi.setSystemTime(baseTime + 200)
      cache.set('session-3', 'data-3')

      // Periodically access session-1 to keep it alive
      vi.setSystemTime(baseTime + 300)
      cache.touch('session-1')

      vi.setSystemTime(baseTime + 400)
      cache.set('session-4', 'data-4') // Evicts session-2

      vi.setSystemTime(baseTime + 500)
      cache.touch('session-1')

      vi.setSystemTime(baseTime + 600)
      cache.set('session-5', 'data-5') // Evicts session-3

      // session-1 should still exist
      expect(cache.has('session-1')).toBe(true)
      expect(cache.has('session-2')).toBe(false)
      expect(cache.has('session-3')).toBe(false)
      expect(cache.has('session-4')).toBe(true)
      expect(cache.has('session-5')).toBe(true)
    })
  })

  describe('configurable eviction threshold', () => {
    it('accepts maxSessions configuration', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 5 })
      expect(cache.maxSessions).toBe(5)
    })

    it('evicts at the configured threshold', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 2 })

      cache.set('s1', 'd1')
      cache.set('s2', 'd2')
      expect(cache.size).toBe(2)

      cache.set('s3', 'd3')
      expect(cache.size).toBe(2)
      expect(cache.has('s1')).toBe(false)
    })

    it('allows changing maxSessions at runtime', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 5 })
      const baseTime = Date.now()

      // Set sessions at different times so LRU order is deterministic
      vi.setSystemTime(baseTime)
      cache.set('s1', 'd1')
      vi.setSystemTime(baseTime + 1000)
      cache.set('s2', 'd2')
      vi.setSystemTime(baseTime + 2000)
      cache.set('s3', 'd3')

      // Reduce maxSessions to 1, requiring eviction of 2 sessions
      cache.maxSessions = 1

      // Should immediately evict oldest sessions (s1 and s2)
      expect(cache.size).toBe(1)
      expect(cache.has('s1')).toBe(false)
      expect(cache.has('s2')).toBe(false)
      expect(cache.has('s3')).toBe(true)
    })

    it('supports eviction percentage threshold', () => {
      const cache = new LRUSessionCache<string>({
        maxSessions: 10,
        evictCount: 3, // Evict 3 at once when full
      })

      // Fill the cache
      for (let i = 1; i <= 10; i++) {
        vi.setSystemTime(i * 1000)
        cache.set(`s${i}`, `d${i}`)
      }
      expect(cache.size).toBe(10)

      // Add one more - should evict 3 oldest
      vi.setSystemTime(11000)
      cache.set('s11', 'd11')

      expect(cache.size).toBe(8) // 10 - 3 + 1 = 8
      expect(cache.has('s1')).toBe(false)
      expect(cache.has('s2')).toBe(false)
      expect(cache.has('s3')).toBe(false)
      expect(cache.has('s4')).toBe(true)
    })
  })

  describe('basic cache operations', () => {
    it('set and get work correctly', () => {
      const cache = new LRUSessionCache<{ userId: string }>({ maxSessions: 10 })

      cache.set('session-1', { userId: 'user-123' })
      const data = cache.get('session-1')

      expect(data).toEqual({ userId: 'user-123' })
    })

    it('returns undefined for non-existent sessions', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      expect(cache.get('non-existent')).toBeUndefined()
    })

    it('delete removes a session', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('session-1', 'data-1')
      expect(cache.has('session-1')).toBe(true)

      cache.delete('session-1')
      expect(cache.has('session-1')).toBe(false)
    })

    it('clear removes all sessions', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')
      cache.set('s3', 'd3')
      expect(cache.size).toBe(3)

      cache.clear()
      expect(cache.size).toBe(0)
    })

    it('keys() returns all session IDs', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')
      cache.set('s3', 'd3')

      const keys = Array.from(cache.keys())
      expect(keys).toContain('s1')
      expect(keys).toContain('s2')
      expect(keys).toContain('s3')
    })

    it('values() returns all session data', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')

      const values = Array.from(cache.values())
      expect(values).toContain('d1')
      expect(values).toContain('d2')
    })

    it('entries() returns all sessionId-data pairs', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')

      const entries = Array.from(cache.entries())
      expect(entries).toContainEqual(['s1', 'd1'])
      expect(entries).toContainEqual(['s2', 'd2'])
    })

    it('forEach iterates over all sessions', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')

      const collected: Array<[string, string]> = []
      cache.forEach((data, sessionId) => {
        collected.push([sessionId, data])
      })

      expect(collected).toContainEqual(['s1', 'd1'])
      expect(collected).toContainEqual(['s2', 'd2'])
    })
  })

  describe('getStats()', () => {
    it('returns cache statistics', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 10 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')
      cache.get('s1') // Hit
      cache.get('non-existent') // Miss

      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.maxSessions).toBe(10)
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.evictions).toBe(0)
    })

    it('tracks eviction count', () => {
      const cache = new LRUSessionCache<string>({ maxSessions: 2 })
      cache.set('s1', 'd1')
      cache.set('s2', 'd2')
      cache.set('s3', 'd3') // Evicts s1
      cache.set('s4', 'd4') // Evicts s2

      const stats = cache.getStats()
      expect(stats.evictions).toBe(2)
    })
  })
})
