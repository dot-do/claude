import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TypedEventEmitter } from './emitter'

interface TestEvents {
  message: { data: string }
  error: { error: Error; event?: string }
}

describe('TypedEventEmitter callback error handling', () => {
  it('catches callback errors and continues', () => {
    const emitter = new TypedEventEmitter()
    const secondHandler = vi.fn()

    emitter.on('message', () => { throw new Error('First fails') })
    emitter.on('message', secondHandler)

    // Should not throw
    emitter.emit('message', { data: 'test' })

    // Second handler should still be called
    expect(secondHandler).toHaveBeenCalled()
  })

  it('logs callback errors', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const emitter = new TypedEventEmitter()

    emitter.on('message', () => { throw new Error('Handler failed') })
    emitter.emit('message', { data: 'test' })

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ============================================================================
// Listener Memory Leak Prevention Tests (TDD - Issue claude-ic7)
// ============================================================================

describe('TypedEventEmitter listener management', () => {
  let emitter: TypedEventEmitter
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    emitter = new TypedEventEmitter()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  describe('listenerCount()', () => {
    it('should return 1000 after adding 1000 listeners', () => {
      for (let i = 0; i < 1000; i++) {
        emitter.on('test', () => {})
      }
      expect(emitter.listenerCount('test')).toBe(1000)
    })

    it('should count listeners across multiple events', () => {
      emitter.on('event1', () => {})
      emitter.on('event1', () => {})
      emitter.on('event2', () => {})

      expect(emitter.listenerCount('event1')).toBe(2)
      expect(emitter.listenerCount('event2')).toBe(1)
      // Total count (excluding wildcards for event-specific count)
      expect(emitter.listenerCount()).toBe(3)
    })

    it('should include wildcard listeners in total count', () => {
      emitter.on('test', () => {})
      emitter.onAny(() => {})

      expect(emitter.listenerCount()).toBe(2)
    })
  })

  describe('off() - specific listener removal', () => {
    it('should remove listener via returned unsubscribe function', () => {
      const handler = vi.fn()
      const unsubscribe = emitter.on('test', handler)

      expect(emitter.listenerCount('test')).toBe(1)

      unsubscribe()

      expect(emitter.listenerCount('test')).toBe(0)

      emitter.emit('test', { data: 'test' })
      expect(handler).not.toHaveBeenCalled()
    })

    it('should only remove the specific listener, not others', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      const unsubscribe1 = emitter.on('test', handler1)
      emitter.on('test', handler2)

      expect(emitter.listenerCount('test')).toBe(2)

      unsubscribe1()

      expect(emitter.listenerCount('test')).toBe(1)

      emitter.emit('test', { data: 'test' })
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith({ data: 'test' })
    })
  })

  describe('once() auto-removal', () => {
    it('should auto-remove listener after first emit', () => {
      const handler = vi.fn()
      emitter.once('test', handler)

      expect(emitter.listenerCount('test')).toBe(1)

      emitter.emit('test', { data: 'first' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(emitter.listenerCount('test')).toBe(0)

      emitter.emit('test', { data: 'second' })
      expect(handler).toHaveBeenCalledTimes(1) // Still 1, not called again
    })

    it('should allow manual removal before emit', () => {
      const handler = vi.fn()
      const unsubscribe = emitter.once('test', handler)

      unsubscribe()

      expect(emitter.listenerCount('test')).toBe(0)

      emitter.emit('test', { data: 'test' })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('removeAllListeners()', () => {
    it('should clear all listeners for a specific event', () => {
      emitter.on('event1', () => {})
      emitter.on('event1', () => {})
      emitter.on('event2', () => {})

      emitter.removeAllListeners('event1')

      expect(emitter.listenerCount('event1')).toBe(0)
      expect(emitter.listenerCount('event2')).toBe(1)
    })

    it('should clear all listeners when no event specified', () => {
      emitter.on('event1', () => {})
      emitter.on('event2', () => {})
      emitter.onAny(() => {})

      emitter.removeAllListeners()

      expect(emitter.listenerCount()).toBe(0)
    })
  })

  describe('maxListeners warning', () => {
    it('should warn when adding more than 10 listeners (default)', () => {
      for (let i = 0; i < 11; i++) {
        emitter.on('test', () => {})
      }

      expect(consoleWarnSpy).toHaveBeenCalled()
      expect(consoleWarnSpy.mock.calls[0][0]).toContain('MaxListenersExceededWarning')
    })

    it('should not warn when exactly 10 listeners', () => {
      for (let i = 0; i < 10; i++) {
        emitter.on('test', () => {})
      }

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('should respect custom maxListeners via setMaxListeners()', () => {
      emitter.setMaxListeners(5)

      for (let i = 0; i < 5; i++) {
        emitter.on('test', () => {})
      }
      expect(consoleWarnSpy).not.toHaveBeenCalled()

      emitter.on('test', () => {})
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('should allow unlimited listeners with setMaxListeners(0)', () => {
      emitter.setMaxListeners(0)

      for (let i = 0; i < 100; i++) {
        emitter.on('test', () => {})
      }

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('getMaxListeners() should return current max', () => {
      expect(emitter.getMaxListeners()).toBe(10)

      emitter.setMaxListeners(25)
      expect(emitter.getMaxListeners()).toBe(25)
    })
  })

  describe('debugging utilities', () => {
    it('rawListeners() should return array of listener functions for event', () => {
      const handler1 = () => {}
      const handler2 = () => {}

      emitter.on('test', handler1)
      emitter.on('test', handler2)

      const listeners = emitter.rawListeners('test')

      expect(listeners).toHaveLength(2)
      expect(listeners).toContain(handler1)
      expect(listeners).toContain(handler2)
    })

    it('rawListeners() should return empty array for non-existent event', () => {
      const listeners = emitter.rawListeners('nonexistent')
      expect(listeners).toEqual([])
    })
  })
})
