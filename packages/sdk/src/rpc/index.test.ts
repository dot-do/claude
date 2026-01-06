/**
 * @dotdo/claude RPC Tests
 *
 * TDD RED phase - Tests for RPC session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RpcTarget,
  RpcSession,
  createRpcSession,
  newWebSocketRpcSession,
  type ClaudeSandboxRpc,
  type RpcSessionState,
} from './index.js'

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      this.onopen?.()
    }, 10)
  }

  send = vi.fn()
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })

  // Helper to simulate receiving a message
  receiveMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('RpcTarget', () => {
  it('should be an abstract base class', () => {
    class TestTarget extends RpcTarget {
      testMethod(): string {
        return 'test'
      }
    }

    const target = new TestTarget()
    expect(target.testMethod()).toBe('test')
  })

  it('should support optional lifecycle hooks', () => {
    class TestTarget extends RpcTarget {
      connected = false
      disconnected = false

      onConnect(): void {
        this.connected = true
      }

      onDisconnect(): void {
        this.disconnected = true
      }
    }

    const target = new TestTarget()
    target.onConnect?.()
    expect(target.connected).toBe(true)

    target.onDisconnect?.()
    expect(target.disconnected).toBe(true)
  })
})

describe('RpcSession', () => {
  let session: RpcSession<ClaudeSandboxRpc>

  beforeEach(() => {
    vi.clearAllMocks()
    session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })
  })

  afterEach(() => {
    session.disconnect()
  })

  describe('state management', () => {
    it('should start in disconnected state', () => {
      expect(session.state).toBe('disconnected')
    })

    it('should transition to connecting when connect is called', async () => {
      const stateChanges: RpcSessionState[] = []
      session.onStateChange((state) => stateChanges.push(state))

      const connectPromise = session.connect()

      // Should immediately be connecting
      expect(stateChanges).toContain('connecting')

      await connectPromise
      expect(stateChanges).toContain('connected')
    })

    it('should transition to disconnected when disconnect is called', async () => {
      await session.connect()
      expect(session.state).toBe('connected')

      session.disconnect()
      expect(session.state).toBe('disconnected')
    })
  })

  describe('connect', () => {
    it('should connect to WebSocket URL', async () => {
      await session.connect()
      expect(session.state).toBe('connected')
    })

    it('should return RPC stub on successful connection', async () => {
      const stub = await session.connect()
      expect(stub).toBeDefined()
    })
  })

  describe('getStub', () => {
    it('should throw if not connected', () => {
      expect(() => session.getStub()).toThrow('Not connected')
    })

    it('should return stub after connection', async () => {
      await session.connect()
      const stub = session.getStub()
      expect(stub).toBeDefined()
    })
  })

  describe('RPC calls', () => {
    it('should send RPC call over WebSocket', async () => {
      const stub = await session.connect()

      // Start the RPC call (won't resolve until we send response)
      const callPromise = stub.exec('ls -la')

      // Get the WebSocket instance
      const ws = (session as unknown as { ws: MockWebSocket }).ws

      // Verify send was called with RPC message
      expect(ws.send).toHaveBeenCalled()
      const sentData = JSON.parse(ws.send.mock.calls[0][0])
      expect(sentData.method).toBe('exec')
      expect(sentData.args).toEqual(['ls -la'])

      // Simulate response
      ws.receiveMessage({
        id: sentData.id,
        result: { exitCode: 0, stdout: 'file1\nfile2', stderr: '' },
      })

      const result = await callPromise
      expect(result).toEqual({ exitCode: 0, stdout: 'file1\nfile2', stderr: '' })
    })

    it('should handle RPC error response', async () => {
      const stub = await session.connect()
      const callPromise = stub.exec('invalid')

      const ws = (session as unknown as { ws: MockWebSocket }).ws
      const sentData = JSON.parse(ws.send.mock.calls[0][0])

      ws.receiveMessage({
        id: sentData.id,
        error: 'Command failed',
      })

      await expect(callPromise).rejects.toThrow('Command failed')
    })
  })

  describe('state change subscription', () => {
    it('should notify subscribers on state change', async () => {
      const states: RpcSessionState[] = []
      const unsubscribe = session.onStateChange((state) => states.push(state))

      await session.connect()
      session.disconnect()

      expect(states).toContain('connecting')
      expect(states).toContain('connected')
      expect(states).toContain('disconnected')

      unsubscribe()
    })

    it('should allow unsubscribing', async () => {
      const states: RpcSessionState[] = []
      const unsubscribe = session.onStateChange((state) => states.push(state))

      await session.connect()
      unsubscribe()

      const countBeforeDisconnect = states.length
      session.disconnect()

      // Should not receive disconnected state
      expect(states.length).toBe(countBeforeDisconnect)
    })
  })

  describe('message subscription', () => {
    it('should receive raw messages', async () => {
      const messages: unknown[] = []
      session.onMessage((data) => messages.push(data))

      await session.connect()

      const ws = (session as unknown as { ws: MockWebSocket }).ws
      ws.receiveMessage({ type: 'pty_output', data: 'Hello' })

      expect(messages).toContainEqual({ type: 'pty_output', data: 'Hello' })
    })
  })

  describe('send', () => {
    it('should send raw data when connected', async () => {
      await session.connect()

      session.send({ type: 'pty_input', data: 'ls\n' })

      const ws = (session as unknown as { ws: MockWebSocket }).ws
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'pty_input', data: 'ls\n' })
      )
    })

    it('should not throw when disconnected', () => {
      expect(() => session.send({ test: true })).not.toThrow()
    })
  })
})

describe('createRpcSession', () => {
  it('should create session with options', () => {
    const session = createRpcSession({
      url: 'wss://test.com/rpc',
      reconnect: true,
      reconnectDelay: 2000,
      maxReconnectAttempts: 3,
    })

    expect(session).toBeInstanceOf(RpcSession)
  })
})

describe('newWebSocketRpcSession', () => {
  it('should create session with URL and defaults', () => {
    const session = newWebSocketRpcSession('wss://test.com/rpc')
    expect(session).toBeInstanceOf(RpcSession)
  })

  it('should merge custom options with defaults', () => {
    const session = newWebSocketRpcSession('wss://test.com/rpc', {
      maxReconnectAttempts: 10,
    })
    expect(session).toBeInstanceOf(RpcSession)
  })
})

describe('ClaudeSandboxRpc interface', () => {
  it('should define expected methods', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    const stub = await session.connect()

    // Type checking - these should all be callable
    expect(typeof stub.exec).toBe('function')
    expect(typeof stub.readFile).toBe('function')
    expect(typeof stub.writeFile).toBe('function')
    expect(typeof stub.listDir).toBe('function')
    expect(typeof stub.search).toBe('function')
    expect(typeof stub.getDiff).toBe('function')
    expect(typeof stub.ptyWrite).toBe('function')
    expect(typeof stub.ptyResize).toBe('function')

    session.disconnect()
  })
})
