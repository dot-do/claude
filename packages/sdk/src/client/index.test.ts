/**
 * @dotdo/claude Client Tests
 *
 * Tests for ClaudeClient RPC implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeClient, ClaudeClientError } from './index.js'

// Mock the capnweb module
vi.mock('capnweb', () => {
  const mockStub = {
    createSession: vi.fn(),
    getSession: vi.fn(),
    resumeSession: vi.fn(),
    listSessions: vi.fn(),
    destroySession: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageWithCallbacks: vi.fn(),
  }

  const mockSession = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    getStub: vi.fn().mockReturnValue(mockStub),
  }

  return {
    newWebSocketRpcSession: vi.fn().mockReturnValue(mockSession),
    newHttpBatchRpcSession: vi.fn().mockReturnValue(mockSession),
    RpcTarget: class {},
    __mockSession: mockSession,
    __mockStub: mockStub,
  }
})

// Get mock references
const getMocks = async () => {
  const capnweb = await import('capnweb')
  return {
    mockSession: (capnweb as any).__mockSession,
    mockStub: (capnweb as any).__mockStub,
  }
}

describe('ClaudeClient', () => {
  let client: ClaudeClient

  beforeEach(async () => {
    vi.clearAllMocks()
    const { mockStub } = await getMocks()
    // Reset mock implementations
    Object.values(mockStub).forEach((mock: any) => mock?.mockReset?.())
    client = new ClaudeClient({ url: 'wss://test.com/rpc' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create client with url', () => {
      const testClient = new ClaudeClient({ url: 'wss://test.com/rpc' })
      expect(testClient).toBeInstanceOf(ClaudeClient)
    })

    it('should accept transport option', () => {
      const httpClient = new ClaudeClient({
        url: 'https://test.com/rpc',
        transport: 'http',
      })
      expect(httpClient).toBeInstanceOf(ClaudeClient)
    })

    it('should accept callbacks option', () => {
      const callbackClient = new ClaudeClient({
        url: 'wss://test.com/rpc',
        callbacks: {
          onMessage: vi.fn(),
          onComplete: vi.fn(),
        },
      })
      expect(callbackClient).toBeInstanceOf(ClaudeClient)
    })
  })

  describe('connect', () => {
    it('should connect to RPC server', async () => {
      const { mockSession } = await getMocks()
      await client.connect()
      expect(mockSession.connect).toHaveBeenCalled()
      expect(client.connected).toBe(true)
    })

    it('should not reconnect if already connected', async () => {
      const { mockSession } = await getMocks()
      await client.connect()
      await client.connect()
      expect(mockSession.connect).toHaveBeenCalledTimes(1)
    })
  })

  describe('disconnect', () => {
    it('should disconnect from RPC server', async () => {
      const { mockSession } = await getMocks()
      await client.connect()
      client.disconnect()
      expect(mockSession.disconnect).toHaveBeenCalled()
      expect(client.connected).toBe(false)
    })
  })

  describe('Session Management', () => {
    describe('createSession', () => {
      it('should create session via RPC', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.createSession.mockResolvedValue(mockSession)

        const result = await client.createSession()

        expect(mockStub.createSession).toHaveBeenCalled()
        expect(result.id).toBe('session-123')
      })

      it('should create session with options', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.createSession.mockResolvedValue(mockSession)

        const options = { cwd: '/project', model: 'claude-3-opus' }
        await client.createSession(options)

        expect(mockStub.createSession).toHaveBeenCalledWith(options)
      })
    })

    describe('getSession', () => {
      it('should get session by ID', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.getSession.mockResolvedValue(mockSession)

        const result = await client.getSession('session-123')

        expect(mockStub.getSession).toHaveBeenCalledWith('session-123')
        expect(result?.id).toBe('session-123')
      })

      it('should return null for non-existent session', async () => {
        const { mockStub } = await getMocks()
        mockStub.getSession.mockResolvedValue(null)

        const result = await client.getSession('non-existent')

        expect(result).toBeNull()
      })
    })

    describe('resumeSession', () => {
      it('should resume existing session', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.resumeSession.mockResolvedValue(mockSession)

        const result = await client.resumeSession('session-123')

        expect(mockStub.resumeSession).toHaveBeenCalledWith('session-123')
        expect(result.id).toBe('session-123')
        expect(client.currentSession).toEqual(mockSession)
      })
    })

    describe('listSessions', () => {
      it('should list all sessions', async () => {
        const { mockStub } = await getMocks()
        const mockSessions = [
          { id: 'session-1', status: 'active' },
          { id: 'session-2', status: 'completed' },
        ]
        mockStub.listSessions.mockResolvedValue(mockSessions)

        const result = await client.listSessions()

        expect(mockStub.listSessions).toHaveBeenCalled()
        expect(result).toHaveLength(2)
      })
    })

    describe('destroySession', () => {
      it('should destroy session by ID', async () => {
        const { mockStub } = await getMocks()
        mockStub.destroySession.mockResolvedValue(undefined)

        await client.destroySession('session-123')

        expect(mockStub.destroySession).toHaveBeenCalledWith('session-123')
      })

      it('should destroy current session if no ID provided', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.createSession.mockResolvedValue(mockSession)
        mockStub.destroySession.mockResolvedValue(undefined)

        await client.createSession()
        await client.destroySession()

        expect(mockStub.destroySession).toHaveBeenCalledWith('session-123')
        expect(client.currentSession).toBeNull()
      })
    })
  })

  describe('Messaging', () => {
    describe('sendMessage', () => {
      it('should send message to session', async () => {
        const { mockStub } = await getMocks()
        mockStub.sendMessage.mockResolvedValue(undefined)

        await client.sendMessage('session-123', 'Hello Claude!')

        expect(mockStub.sendMessage).toHaveBeenCalledWith('session-123', 'Hello Claude!')
      })
    })

    describe('query', () => {
      it('should create session and send message', async () => {
        const { mockStub } = await getMocks()
        const mockSession = { id: 'session-123', status: 'active' }
        mockStub.createSession.mockResolvedValue(mockSession)
        mockStub.sendMessage.mockResolvedValue(undefined)
        mockStub.getSession.mockResolvedValue({ ...mockSession, status: 'completed' })

        const result = await client.query('What is 2+2?')

        expect(mockStub.createSession).toHaveBeenCalled()
        expect(mockStub.sendMessage).toHaveBeenCalledWith('session-123', 'What is 2+2?')
        expect(result).toBe('completed')
      })
    })
  })

  describe('currentSession', () => {
    it('should track current session after create', async () => {
      const { mockStub } = await getMocks()
      const mockSession = { id: 'session-123', status: 'active' }
      mockStub.createSession.mockResolvedValue(mockSession)

      expect(client.currentSession).toBeNull()
      await client.createSession()
      expect(client.currentSession).toEqual(mockSession)
    })

    it('should clear current session on destroy', async () => {
      const { mockStub } = await getMocks()
      const mockSession = { id: 'session-123', status: 'active' }
      mockStub.createSession.mockResolvedValue(mockSession)
      mockStub.destroySession.mockResolvedValue(undefined)

      await client.createSession()
      await client.destroySession()
      expect(client.currentSession).toBeNull()
    })
  })
})

describe('ClaudeClientError', () => {
  it('should create error with message and status', () => {
    const error = new ClaudeClientError('Not found', 404)
    expect(error.message).toBe('Not found')
    expect(error.status).toBe(404)
    expect(error.name).toBe('ClaudeClientError')
  })

  it('should include errorId when provided', () => {
    const error = new ClaudeClientError('Server error', 500, 'err-abc123')
    expect(error.errorId).toBe('err-abc123')
  })
})

describe('RpcStub type safety', () => {
  it('stub methods return RpcPromise', async () => {
    // Type test - if this compiles, the types work
    const client = new ClaudeClient({ url: 'ws://test' })
    // Connect first to initialize the stub
    await client.connect()
    // @ts-expect-error - accessing private for test
    const stub = client.stub
    // Methods should exist and return promises
    expect(typeof stub?.createSession).toBe('function')
  })
})
