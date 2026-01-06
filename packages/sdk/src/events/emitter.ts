/**
 * @dotdo/claude - Typed Event Emitter
 *
 * Provides type-safe event subscription for ClaudeCode events
 */

type EventCallback<T = unknown> = (data: T) => void

interface EventSubscription {
  callback: EventCallback
  once: boolean
}

/**
 * Typed Event Emitter for ClaudeCode events
 *
 * Supports:
 * - Type-safe event subscription
 * - One-time listeners
 * - Unsubscription via returned function
 * - Wildcard listeners
 *
 * @example
 * ```typescript
 * const emitter = new TypedEventEmitter()
 *
 * // Subscribe to specific event
 * const unsubscribe = emitter.on('todo:session-123', (todos) => {
 *   console.log('Todos updated:', todos)
 * })
 *
 * // Subscribe once
 * emitter.once('result:session-123', (result) => {
 *   console.log('Final result:', result)
 * })
 *
 * // Subscribe to all events
 * emitter.onAny(({ event, data }) => {
 *   console.log(`Event ${event}:`, data)
 * })
 *
 * // Emit event
 * emitter.emit('todo:session-123', { todos: [...] })
 *
 * // Unsubscribe
 * unsubscribe()
 * ```
 */
export class TypedEventEmitter {
  private listeners: Map<string, Set<EventSubscription>> = new Map()
  private wildcardListeners: Set<EventSubscription> = new Set()

  /**
   * Subscribe to an event
   * Returns unsubscribe function
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const subscription: EventSubscription = {
      callback: callback as EventCallback,
      once: false,
    }

    this.listeners.get(event)!.add(subscription)

    return () => {
      this.listeners.get(event)?.delete(subscription)
    }
  }

  /**
   * Subscribe to an event once
   */
  once<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const subscription: EventSubscription = {
      callback: callback as EventCallback,
      once: true,
    }

    this.listeners.get(event)!.add(subscription)

    return () => {
      this.listeners.get(event)?.delete(subscription)
    }
  }

  /**
   * Subscribe to all events (wildcard)
   */
  onAny<T = unknown>(callback: EventCallback<{ event: string; data: T }>): () => void {
    const subscription: EventSubscription = {
      callback: callback as EventCallback,
      once: false,
    }

    this.wildcardListeners.add(subscription)

    return () => {
      this.wildcardListeners.delete(subscription)
    }
  }

  /**
   * Emit an event
   */
  emit<T = unknown>(event: string, data: T): void {
    // Notify specific listeners
    const listeners = this.listeners.get(event)
    if (listeners) {
      const toRemove: EventSubscription[] = []

      for (const sub of listeners) {
        try {
          sub.callback(data)
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error)
        }

        if (sub.once) {
          toRemove.push(sub)
        }
      }

      for (const sub of toRemove) {
        listeners.delete(sub)
      }
    }

    // Notify wildcard listeners
    for (const sub of this.wildcardListeners) {
      try {
        sub.callback({ event, data })
      } catch (error) {
        console.error('Error in wildcard event handler:', error)
      }
    }
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  off(event?: string): void {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
      this.wildcardListeners.clear()
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event?: string): number {
    if (event) {
      return (this.listeners.get(event)?.size ?? 0) + this.wildcardListeners.size
    }

    let count = this.wildcardListeners.size
    for (const listeners of this.listeners.values()) {
      count += listeners.size
    }
    return count
  }

  /**
   * Check if there are listeners for an event
   */
  hasListeners(event?: string): boolean {
    if (event) {
      return (this.listeners.get(event)?.size ?? 0) > 0 || this.wildcardListeners.size > 0
    }
    return this.listeners.size > 0 || this.wildcardListeners.size > 0
  }

  /**
   * Get all event names that have listeners
   */
  eventNames(): string[] {
    return Array.from(this.listeners.keys())
  }

  /**
   * Wait for an event to be emitted
   */
  waitFor<T = unknown>(event: string, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      const unsubscribe = this.once<T>(event, (data) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve(data)
      })

      if (timeout) {
        timeoutId = setTimeout(() => {
          unsubscribe()
          reject(new Error(`Timeout waiting for event: ${event}`))
        }, timeout)
      }
    })
  }
}

// ============================================================================
// Event Key Helpers
// ============================================================================

/**
 * Create a session-scoped event key
 */
export function sessionEvent(type: string, sessionId: string): string {
  return `${type}:${sessionId}`
}

/**
 * Event key types for ClaudeCode
 */
export const EventKeys = {
  // Output events
  output: (sessionId: string) => sessionEvent('output', sessionId),
  init: (sessionId: string) => sessionEvent('init', sessionId),
  result: (sessionId: string) => sessionEvent('result', sessionId),

  // Tool events
  tool: (sessionId: string) => sessionEvent('tool', sessionId),
  toolResult: (sessionId: string) => sessionEvent('tool_result', sessionId),

  // Special events
  todo: (sessionId: string) => sessionEvent('todo', sessionId),
  plan: (sessionId: string) => sessionEvent('plan', sessionId),

  // Session events
  sessionCreated: (sessionId: string) => sessionEvent('session_created', sessionId),
  sessionDestroyed: (sessionId: string) => sessionEvent('session_destroyed', sessionId),

  // Error events
  error: (sessionId: string) => sessionEvent('error', sessionId),
} as const

// ============================================================================
// Singleton Instance (optional)
// ============================================================================

let globalEmitter: TypedEventEmitter | null = null

/**
 * Get or create global event emitter instance
 */
export function getGlobalEmitter(): TypedEventEmitter {
  if (!globalEmitter) {
    globalEmitter = new TypedEventEmitter()
  }
  return globalEmitter
}

/**
 * Reset global emitter (for testing)
 */
export function resetGlobalEmitter(): void {
  globalEmitter?.off()
  globalEmitter = null
}
