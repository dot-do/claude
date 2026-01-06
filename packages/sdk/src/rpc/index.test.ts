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
  RpcTimeoutError,
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

// ============================================================================
// RPC Timeout Tests (TDD RED Phase - Issue claude-7hy)
// ============================================================================

describe('RPC call timeout handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should timeout RPC call after configured ms with no response', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      callTimeout: 5000, // 5 second timeout
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call but never respond
    const callPromise = stub.exec('long-running-command')

    // Advance time past the timeout
    vi.advanceTimersByTime(5001)

    // Should reject with timeout error
    await expect(callPromise).rejects.toThrow('RPC call timed out')

    session.disconnect()
  })

  it('should use default timeout of 30000ms when not configured', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      // No callTimeout specified - should default to 30000ms
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call but never respond
    const callPromise = stub.exec('command')

    // Advance time but not past default timeout
    vi.advanceTimersByTime(29000)

    // Should still be pending
    let resolved = false
    callPromise.then(() => { resolved = true }).catch(() => { resolved = true })
    await Promise.resolve()
    expect(resolved).toBe(false)

    // Advance past 30 second default timeout
    vi.advanceTimersByTime(2000)

    // Should reject with timeout error
    await expect(callPromise).rejects.toThrow('RPC call timed out')

    session.disconnect()
  })

  it('should allow per-call timeout override', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      callTimeout: 30000, // Default 30 seconds
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    await connectPromise

    // Use per-call timeout option (shorter than default)
    const callPromise = session.callWithTimeout('exec', ['quick-command'], { timeout: 1000 })

    // Advance time past the per-call timeout
    vi.advanceTimersByTime(1001)

    // Should reject with timeout error
    await expect(callPromise).rejects.toThrow('RPC call timed out')

    session.disconnect()
  })

  it('should cleanup pending call handlers on timeout', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      callTimeout: 1000,
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Track message listeners count before call
    const initialListenerCount = session.getMessageListenerCount()

    // Start an RPC call
    const callPromise = stub.exec('command')

    // Should have added a listener for this call
    expect(session.getMessageListenerCount()).toBe(initialListenerCount + 1)

    // Advance time past the timeout
    vi.advanceTimersByTime(1001)

    // Let the rejection propagate
    await callPromise.catch(() => {})

    // Listener should be cleaned up after timeout
    expect(session.getMessageListenerCount()).toBe(initialListenerCount)

    session.disconnect()
  })

  it('should clear timeout when response arrives before timeout', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      callTimeout: 5000,
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.exec('command')

    // Advance time but not past timeout
    vi.advanceTimersByTime(1000)

    // Send response before timeout
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)
    ws.receiveMessage({
      id: sentData.id,
      result: { exitCode: 0, stdout: 'success', stderr: '' },
    })

    // Should resolve successfully
    const result = await callPromise
    expect(result).toEqual({ exitCode: 0, stdout: 'success', stderr: '' })

    // Advance time past what would have been the timeout
    vi.advanceTimersByTime(5000)

    // No error should occur - timeout was cleared
    session.disconnect()
  })

  it('should throw RpcTimeoutError with call details', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
      callTimeout: 1000,
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.exec('test-command')

    // Advance time past the timeout
    vi.advanceTimersByTime(1001)

    // Should reject with RpcTimeoutError that includes method name
    try {
      await callPromise
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(RpcTimeoutError)
      expect((error as RpcTimeoutError).method).toBe('exec')
      expect((error as RpcTimeoutError).timeoutMs).toBe(1000)
    }

    session.disconnect()
  })
})

// ============================================================================
// RpcPromise.pipe Tests (TDD RED Phase - Issue claude-sds)
// Replace 'any' types with proper TypeScript types
// ============================================================================

describe('RpcPromise.pipe method', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow promise pipelining with typed arguments', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.readFile('/path/to/file')

    // Get sent data
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

    // Simulate response with an object that has a method
    ws.receiveMessage({
      id: sentData.id,
      result: 'file content here',
    })

    const result = await callPromise
    expect(result).toBe('file content here')

    session.disconnect()
  })

  it('should pipe method calls with typed string arguments', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.readFile('/path/to/file')

    // Get sent data
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

    // Simulate response with a string (strings have methods like toUpperCase)
    ws.receiveMessage({
      id: sentData.id,
      result: 'hello world',
    })

    // Test piping to string's toUpperCase method
    const piped = callPromise.pipe('toUpperCase')
    const pipedResult = await piped
    expect(pipedResult).toBe('HELLO WORLD')

    session.disconnect()
  })

  it('should pipe method calls with typed number arguments', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.readFile('/path/to/file')

    // Get sent data
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

    // Simulate response with a string (strings have slice method with number args)
    ws.receiveMessage({
      id: sentData.id,
      result: 'hello world',
    })

    // Test piping with number args (string.slice takes start, end)
    const piped = callPromise.pipe('slice', 0, 5)
    const pipedResult = await piped
    expect(pipedResult).toBe('hello')

    session.disconnect()
  })

  it('should pipe method calls with mixed typed arguments', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.readFile('/path/to/file')

    // Get sent data
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

    // Simulate response with a string
    ws.receiveMessage({
      id: sentData.id,
      result: 'hello world',
    })

    // Test piping with mixed args: string.replace(string, string)
    const piped = callPromise.pipe('replace', 'world', 'there')
    const pipedResult = await piped
    expect(pipedResult).toBe('hello there')

    session.disconnect()
  })

  it('should throw when piped method does not exist on result', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    const connectPromise = session.connect()
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')
    await Promise.resolve()
    ws.simulateOpen()
    const stub = await connectPromise

    // Start an RPC call
    const callPromise = stub.exec('ls')

    // Get sent data
    const sentData = JSON.parse(ws.send.mock.calls[0][0] as string)

    // Simulate response with simple object
    ws.receiveMessage({
      id: sentData.id,
      result: { exitCode: 0, stdout: 'output', stderr: '' },
    })

    // Test piping to non-existent method
    const piped = callPromise.pipe('nonExistentMethod', 'arg1', 42)
    await expect(piped).rejects.toThrow('Method nonExistentMethod not found on result')

    session.disconnect()
  })
})

describe('WebSocket lifecycle', () => {
  beforeEach(() => {
    MockWebSocket.clear()
  })

  it('cleans up on close', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    await connectWithMock(session)
    expect(session.state).toBe('connected')

    // Manually trigger close
    session.disconnect()

    expect(session.state).toBe('disconnected')
  })

  it('cleans up on error', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Start connection
    const connectPromise = session.connect()

    // Get the WebSocket instance
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')

    // Wait for handlers to be set up
    await Promise.resolve()

    // Simulate an error
    ws.simulateError(new Error('Connection failed'))

    // Connect should fail and clean up
    await connectPromise.catch(() => {})

    // State should be error or disconnected
    expect(['disconnected', 'error']).toContain(session.state)
  })

  it('cleans up WebSocket handlers on disconnect to prevent memory leaks', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    await connectWithMock(session)

    // Get the WebSocket instance
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')

    // Disconnect
    session.disconnect()

    // Verify handlers are cleaned up (null)
    expect(ws.onopen).toBeNull()
    expect(ws.onclose).toBeNull()
    expect(ws.onerror).toBeNull()
    expect(ws.onmessage).toBeNull()
  })

  it('cleans up WebSocket handlers on close event to prevent memory leaks', async () => {
    const session = createRpcSession<ClaudeSandboxRpc>({
      url: 'wss://test.com/rpc',
    })

    // Connect the session
    await connectWithMock(session)

    // Get the WebSocket instance
    const ws = MockWebSocket.getLatest()
    if (!ws) throw new Error('No WebSocket instance created')

    // Simulate close event from server
    ws.simulateClose()

    // Verify handlers are cleaned up (null)
    expect(ws.onopen).toBeNull()
    expect(ws.onclose).toBeNull()
    expect(ws.onerror).toBeNull()
    expect(ws.onmessage).toBeNull()
  })
})
