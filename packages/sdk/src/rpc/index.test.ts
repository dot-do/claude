/**
 * @dotdo/claude RPC Tests
 *
 * TDD RED phase - Tests for RPC session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MockWebSocket } from './setup.js'
import {
  RpcTarget,
  RpcSession,
  createRpcSession,
  newWebSocketRpcSession,
  type ClaudeSandboxRpc,
  type RpcSessionState,
} from './index.js'

/**
 * Helper to connect a session with the mock WebSocket
 * This handles the async coordination of starting connect and triggering open
 */
async function connectWithMock<T>(session: RpcSession<T>): Promise<ReturnType<typeof session.getStub>> {
  const connectPromise = session.connect()

  // WebSocket instance is created synchronously in connect()
  const ws = MockWebSocket.getLatest()
  if (!ws) throw new Error('No WebSocket instance created')

  // Wait for the next microtask to ensure onopen handler is set up
  await Promise.resolve()

  // Trigger the open event
  ws.simulateOpen()

  return connectPromise
}

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
    MockWebSocket.clear()
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

      await connectWithMock(session)

      // Should have transitioned through connecting to connected
      expect(stateChanges).toContain('connecting')
      expect(stateChanges).toContain('connected')
    })

    it('should transition to disconnected when disconnect is called', async () => {
      await connectWithMock(session)
      expect(session.state).toBe('connected')

      session.disconnect()
      expect(session.state).toBe('disconnected')
    })
  })

  describe('connect', () => {
    it('should connect to WebSocket URL', async () => {
      await connectWithMock(session)
      expect(session.state).toBe('connected')
    })

    it('should return RPC stub on successful connection', async () => {
      const stub = await connectWithMock(session)
      expect(stub).toBeDefined()
    })
  })

  describe('getStub', () => {
    it('should throw if not connected', () => {
      expect(() => session.getStub()).toThrow('Not connected')
    })

    it('should return stub after connection', async () => {
      await connectWithMock(session)
      const stub = session.getStub()
      expect(stub).toBeDefined()
    })
  })

  describe('RPC calls', () => {
    it('should send RPC call over WebSocket', async () => {
      const stub = await connectWithMock(session)

      // Start the RPC call (won't resolve until we send response)
      const callPromise = stub.exec('ls -la')

      // Get the WebSocket instance
      const ws = MockWebSocket.instances[0]

      // Verify send was called with RPC message
      expect(ws.send.mock.calls.length).toBeGreaterThan(0)
      const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)
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
      const stub = await connectWithMock(session)
      const callPromise = stub.exec('invalid')

      const ws = MockWebSocket.instances[0]
      const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

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

      await connectWithMock(session)
      session.disconnect()

      expect(states).toContain('connecting')
      expect(states).toContain('connected')
      expect(states).toContain('disconnected')

      unsubscribe()
    })

    it('should allow unsubscribing', async () => {
      const states: RpcSessionState[] = []
      const unsubscribe = session.onStateChange((state) => states.push(state))

      await connectWithMock(session)
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

      await connectWithMock(session)

      const ws = MockWebSocket.instances[0]
      ws.receiveMessage({ type: 'pty_output', data: 'Hello' })

      expect(messages).toContainEqual({ type: 'pty_output', data: 'Hello' })
    })
  })

  describe('send', () => {
    it('should send raw data when connected', async () => {
      await connectWithMock(session)

      session.send({ type: 'pty_input', data: 'ls\n' })

      const ws = MockWebSocket.instances[0]
      expect(ws.send.mock.calls).toContainEqual([
        JSON.stringify({ type: 'pty_input', data: 'ls\n' })
      ])
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
  beforeEach(() => {
    MockWebSocket.clear()
  })

  it('should define expected methods', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    const stub = await connectWithMock(session)

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
