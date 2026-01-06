import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TerminalProxy, ConnectionState, type ConnectionStateCallback } from './websocket-proxy'

/**
 * Mock WebSocket for testing
 */
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  private listeners: Map<string, Set<(event: unknown) => void>> = new Map()

  addEventListener(event: string, callback: (event: unknown) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  removeEventListener(event: string, callback: (event: unknown) => void): void {
    this.listeners.get(event)?.delete(callback)
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    // No-op for mock
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED
    this.dispatchEvent('close', { code, reason })
  }

  // Test helpers
  dispatchEvent(event: string, data?: unknown): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach((cb) => cb(data))
    }
  }

  simulateError(error: Error): void {
    this.dispatchEvent('error', { error })
  }

  simulateClose(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED
    this.dispatchEvent('close', { code, reason })
  }

  simulateMessage(data: string): void {
    this.dispatchEvent('message', { data })
  }
}

/**
 * Mock Sandbox for testing
 */
function createMockSandbox() {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
    startProcess: vi.fn().mockResolvedValue({
      id: 'test-process-id',
      waitForPort: vi.fn().mockResolvedValue(undefined),
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    streamProcessLogs: vi.fn().mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
    ),
  }
}

describe('TerminalProxy - WebSocket disconnect handling', () => {
  let proxy: TerminalProxy
  let mockSandbox: ReturnType<typeof createMockSandbox>
  let mockWs: MockWebSocket

  beforeEach(() => {
    vi.useFakeTimers()
    mockSandbox = createMockSandbox()
    mockWs = new MockWebSocket()
    proxy = new TerminalProxy(mockSandbox)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('Server closes connection', () => {
    it('should notify client via callback when server closes connection', async () => {
      const stateCallback = vi.fn()
      proxy.onConnectionStateChange(stateCallback)

      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      // Simulate server closing the connection
      mockWs.simulateClose(1000, 'Normal closure')

      // Should notify with disconnected state
      expect(stateCallback).toHaveBeenCalledWith(
        sessionId,
        ConnectionState.Disconnected,
        expect.objectContaining({ code: 1000 })
      )
    })

    it('should call onClose callback when connection is closed', async () => {
      const onClose = vi.fn()
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket, {
        onClose,
      })

      mockWs.simulateClose(1001, 'Going away')

      expect(onClose).toHaveBeenCalledWith(1001, 'Going away')
    })
  })

  describe('Network timeout and reconnection', () => {
    it('should attempt reconnection on abnormal close', async () => {
      const stateCallback = vi.fn()
      proxy.onConnectionStateChange(stateCallback)

      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket, {
        reconnect: true,
      })

      // Simulate abnormal close (code 1006 = abnormal closure)
      mockWs.simulateClose(1006, 'Abnormal closure')

      // Should transition to reconnecting state
      expect(stateCallback).toHaveBeenCalledWith(
        sessionId,
        ConnectionState.Reconnecting,
        expect.anything()
      )
    })

    it('should use exponential backoff for reconnection attempts', async () => {
      const stateCallback = vi.fn()
      proxy.onConnectionStateChange(stateCallback)

      await proxy.createSession(mockWs as unknown as WebSocket, {
        reconnect: true,
        maxReconnectAttempts: 3,
      })

      // Simulate abnormal close
      mockWs.simulateClose(1006, 'Network error')

      // First reconnect attempt should be scheduled
      expect(stateCallback).toHaveBeenCalledWith(
        expect.any(String),
        ConnectionState.Reconnecting,
        expect.anything()
      )

      // Advance timers to trigger reconnection attempts
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(4000)
      await vi.advanceTimersByTimeAsync(8000)

      // Should have attempted multiple reconnections with increasing delays
      const reconnectingCalls = stateCallback.mock.calls.filter(
        (call) => call[1] === ConnectionState.Reconnecting
      )
      expect(reconnectingCalls.length).toBeGreaterThanOrEqual(1)
    })

    it('should buffer messages during reconnection', async () => {
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket, {
        reconnect: true,
      })

      // Simulate disconnect
      mockWs.simulateClose(1006, 'Network error')

      // Try to send messages during reconnection - should be buffered
      const bufferedCount = proxy.getBufferedMessageCount(sessionId)

      // Buffer a message
      proxy.handleMessage(sessionId, JSON.stringify({ type: 'input', data: 'test' }))

      expect(proxy.getBufferedMessageCount(sessionId)).toBe(bufferedCount + 1)
    })
  })

  describe('Invalid message handling', () => {
    it('should handle invalid JSON gracefully without crash', async () => {
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      // This should not throw
      expect(() => {
        proxy.handleMessage(sessionId, 'not valid json {{{')
      }).not.toThrow()
    })

    it('should handle unknown message types gracefully', async () => {
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      // This should not throw
      expect(() => {
        proxy.handleMessage(sessionId, JSON.stringify({ type: 'unknown_type', data: 'test' }))
      }).not.toThrow()
    })

    it('should handle malformed message structure gracefully', async () => {
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      // These should not throw
      expect(() => {
        proxy.handleMessage(sessionId, JSON.stringify(null))
      }).not.toThrow()

      expect(() => {
        proxy.handleMessage(sessionId, JSON.stringify([1, 2, 3]))
      }).not.toThrow()

      expect(() => {
        proxy.handleMessage(sessionId, JSON.stringify({ noType: true }))
      }).not.toThrow()
    })
  })

  describe('Connection state machine', () => {
    it('should track connection state correctly', async () => {
      const states: ConnectionState[] = []
      const stateCallback: ConnectionStateCallback = (sessionId, state) => {
        states.push(state)
      }
      proxy.onConnectionStateChange(stateCallback)

      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      // Should be connected after session creation
      expect(proxy.getConnectionState(sessionId)).toBe(ConnectionState.Connected)

      // Simulate disconnect
      mockWs.simulateClose(1000, 'Normal closure')

      // Should be disconnected
      expect(proxy.getConnectionState(sessionId)).toBe(ConnectionState.Disconnected)
    })

    it('should return undefined state for unknown session', () => {
      expect(proxy.getConnectionState('unknown-session')).toBeUndefined()
    })
  })

  describe('Error handling', () => {
    it('should handle WebSocket errors gracefully', async () => {
      const onError = vi.fn()
      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket, {
        onError,
      })

      mockWs.simulateError(new Error('Network error'))

      expect(onError).toHaveBeenCalledWith(expect.any(Error))
    })

    it('should notify state change on error', async () => {
      const stateCallback = vi.fn()
      proxy.onConnectionStateChange(stateCallback)

      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket)

      mockWs.simulateError(new Error('Connection lost'))

      // Error should trigger state change notification
      expect(stateCallback).toHaveBeenCalled()
    })
  })

  describe('Health check', () => {
    it('should send periodic ping messages when enabled', async () => {
      const sendSpy = vi.spyOn(mockWs, 'send')

      await proxy.createSession(mockWs as unknown as WebSocket, {
        healthCheck: true,
        healthCheckInterval: 5000,
      })

      // Advance timers past the health check interval
      await vi.advanceTimersByTimeAsync(5500)

      // Should have sent a ping
      expect(sendSpy).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ping"')
      )
    })

    it('should detect stale connections', async () => {
      const stateCallback = vi.fn()
      proxy.onConnectionStateChange(stateCallback)

      const sessionId = await proxy.createSession(mockWs as unknown as WebSocket, {
        healthCheck: true,
        healthCheckInterval: 1000,
        healthCheckTimeout: 2000,
      })

      // Advance past health check timeout without pong response
      await vi.advanceTimersByTimeAsync(5000)

      // Should detect stale connection and notify
      expect(stateCallback).toHaveBeenCalledWith(
        sessionId,
        ConnectionState.Disconnected,
        expect.objectContaining({ reason: expect.stringContaining('timeout') })
      )
    })
  })
})
