import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WriteBatcher, type WriteBatcherOptions, type WriteBatcherMetrics } from './write-batching'

describe('WriteBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('batching multiple rapid writes into single storage operation', () => {
    it('coalesces multiple writes within batch window into one flush', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      // Multiple rapid writes
      batcher.write('state-1')
      batcher.write('state-2')
      batcher.write('state-3')

      // Storage should not be called yet
      expect(storageFn).not.toHaveBeenCalled()

      // Advance past batch window
      await vi.advanceTimersByTimeAsync(100)

      // Only one storage call with the last value
      expect(storageFn).toHaveBeenCalledTimes(1)
      expect(storageFn).toHaveBeenCalledWith('state-3')
    })

    it('uses the most recent value for each flush', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<{ count: number }>({
        batchWindowMs: 50,
        storage: storageFn,
      })

      batcher.write({ count: 1 })
      batcher.write({ count: 2 })
      batcher.write({ count: 5 })

      await vi.advanceTimersByTimeAsync(50)

      expect(storageFn).toHaveBeenCalledWith({ count: 5 })
    })

    it('handles no writes within a window gracefully', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      // Advance time without any writes
      await vi.advanceTimersByTimeAsync(200)

      expect(storageFn).not.toHaveBeenCalled()
    })
  })

  describe('flushing writes immediately on session end', () => {
    it('flushes immediately when flush() is called', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 1000, // Long window
        storage: storageFn,
      })

      batcher.write('pending-data')

      // Flush immediately without waiting for timer
      await batcher.flush()

      expect(storageFn).toHaveBeenCalledTimes(1)
      expect(storageFn).toHaveBeenCalledWith('pending-data')
    })

    it('cancels pending timer after manual flush', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('data')
      await batcher.flush()

      // Advance past original timer - should not trigger another write
      await vi.advanceTimersByTimeAsync(200)

      expect(storageFn).toHaveBeenCalledTimes(1)
    })

    it('does nothing when flush() called with no pending writes', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      await batcher.flush()

      expect(storageFn).not.toHaveBeenCalled()
    })

    it('flushes when destroy() is called', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 1000,
        storage: storageFn,
      })

      batcher.write('final-state')
      await batcher.destroy()

      expect(storageFn).toHaveBeenCalledTimes(1)
      expect(storageFn).toHaveBeenCalledWith('final-state')
    })
  })

  describe('flushing on error conditions', () => {
    it('flushes pending writes when flushOnError() is called', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 1000,
        storage: storageFn,
      })

      batcher.write('error-state')
      await batcher.flushOnError(new Error('Something went wrong'))

      expect(storageFn).toHaveBeenCalledTimes(1)
      expect(storageFn).toHaveBeenCalledWith('error-state')
    })

    it('invokes onError callback when storage fails', async () => {
      const storageError = new Error('Storage unavailable')
      const storageFn = vi.fn().mockRejectedValue(storageError)
      const onError = vi.fn()

      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
        onError,
      })

      batcher.write('data')
      await vi.advanceTimersByTimeAsync(100)

      // Wait for the flush to complete/fail
      await vi.runAllTimersAsync()

      expect(onError).toHaveBeenCalledWith(storageError)
    })

    it('continues operating after storage error', async () => {
      const storageFn = vi.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockResolvedValueOnce(undefined)
      const onError = vi.fn()

      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
        onError,
      })

      // First write fails
      batcher.write('data-1')
      await vi.advanceTimersByTimeAsync(100)
      await vi.runAllTimersAsync()

      // Second write succeeds
      batcher.write('data-2')
      await vi.advanceTimersByTimeAsync(100)
      await vi.runAllTimersAsync()

      expect(storageFn).toHaveBeenCalledTimes(2)
      expect(onError).toHaveBeenCalledTimes(1)
    })
  })

  describe('configurable batch window', () => {
    it('respects custom batchWindowMs', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 500,
        storage: storageFn,
      })

      batcher.write('data')

      // Not flushed yet at 400ms
      await vi.advanceTimersByTimeAsync(400)
      expect(storageFn).not.toHaveBeenCalled()

      // Flushed at 500ms
      await vi.advanceTimersByTimeAsync(100)
      expect(storageFn).toHaveBeenCalledTimes(1)
    })

    it('uses default batch window of 100ms', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        storage: storageFn,
      })

      batcher.write('data')

      await vi.advanceTimersByTimeAsync(99)
      expect(storageFn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(storageFn).toHaveBeenCalledTimes(1)
    })

    it('resets batch window on each write', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('data-1')

      // Advance 50ms, then write again
      await vi.advanceTimersByTimeAsync(50)
      batcher.write('data-2')

      // At 100ms total (50ms since last write)
      await vi.advanceTimersByTimeAsync(50)
      expect(storageFn).not.toHaveBeenCalled()

      // At 150ms (100ms since last write)
      await vi.advanceTimersByTimeAsync(50)
      expect(storageFn).toHaveBeenCalledTimes(1)
      expect(storageFn).toHaveBeenCalledWith('data-2')
    })
  })

  describe('metrics for write coalescing', () => {
    it('tracks total writes queued', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('a')
      batcher.write('b')
      batcher.write('c')

      const metrics = batcher.getMetrics()
      expect(metrics.totalWritesQueued).toBe(3)
    })

    it('tracks actual flushes', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('batch-1-a')
      batcher.write('batch-1-b')
      await vi.advanceTimersByTimeAsync(100)

      batcher.write('batch-2-a')
      await vi.advanceTimersByTimeAsync(100)

      const metrics = batcher.getMetrics()
      expect(metrics.totalFlushes).toBe(2)
    })

    it('tracks coalesced writes (writes saved)', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      // 5 writes coalesced into 1 flush = 4 saved
      batcher.write('a')
      batcher.write('b')
      batcher.write('c')
      batcher.write('d')
      batcher.write('e')
      await vi.advanceTimersByTimeAsync(100)

      const metrics = batcher.getMetrics()
      expect(metrics.totalWritesQueued).toBe(5)
      expect(metrics.totalFlushes).toBe(1)
      expect(metrics.writesCoalesced).toBe(4) // 5 queued - 1 flush = 4 saved
    })

    it('tracks storage errors', async () => {
      const storageFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail-1'))
        .mockRejectedValueOnce(new Error('fail-2'))
        .mockResolvedValueOnce(undefined)
      const onError = vi.fn()

      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
        onError,
      })

      batcher.write('a')
      await vi.advanceTimersByTimeAsync(100)
      await vi.runAllTimersAsync()

      batcher.write('b')
      await vi.advanceTimersByTimeAsync(100)
      await vi.runAllTimersAsync()

      batcher.write('c')
      await vi.advanceTimersByTimeAsync(100)
      await vi.runAllTimersAsync()

      const metrics = batcher.getMetrics()
      expect(metrics.storageErrors).toBe(2)
    })

    it('provides coalescing ratio', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      // 10 writes, 2 flushes = 80% coalescing
      for (let i = 0; i < 5; i++) {
        batcher.write(`batch-1-${i}`)
      }
      await vi.advanceTimersByTimeAsync(100)

      for (let i = 0; i < 5; i++) {
        batcher.write(`batch-2-${i}`)
      }
      await vi.advanceTimersByTimeAsync(100)

      const metrics = batcher.getMetrics()
      expect(metrics.coalescingRatio).toBeCloseTo(0.8) // 8/10 writes saved
    })

    it('resets metrics when reset() is called', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('data')
      await vi.advanceTimersByTimeAsync(100)

      batcher.resetMetrics()

      const metrics = batcher.getMetrics()
      expect(metrics.totalWritesQueued).toBe(0)
      expect(metrics.totalFlushes).toBe(0)
      expect(metrics.writesCoalesced).toBe(0)
      expect(metrics.storageErrors).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles writes after destroy gracefully', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      await batcher.destroy()

      // Should not throw
      expect(() => batcher.write('data')).not.toThrow()

      // But should not schedule flush
      await vi.advanceTimersByTimeAsync(200)
      expect(storageFn).not.toHaveBeenCalled()
    })

    it('handles concurrent flushes correctly', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<string>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write('data')

      // Trigger multiple flushes concurrently
      const flush1 = batcher.flush()
      const flush2 = batcher.flush()

      await Promise.all([flush1, flush2])

      // Should only have flushed once
      expect(storageFn).toHaveBeenCalledTimes(1)
    })

    it('preserves pending data reference across multiple writes', async () => {
      const storageFn = vi.fn().mockResolvedValue(undefined)
      const batcher = new WriteBatcher<{ items: string[] }>({
        batchWindowMs: 100,
        storage: storageFn,
      })

      batcher.write({ items: ['a'] })
      batcher.write({ items: ['a', 'b'] })
      batcher.write({ items: ['a', 'b', 'c'] })

      await vi.advanceTimersByTimeAsync(100)

      expect(storageFn).toHaveBeenCalledWith({ items: ['a', 'b', 'c'] })
    })
  })
})
