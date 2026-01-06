/**
 * @dotdo/claude RPC Server Tests
 *
 * Tests for ClaudeCodeRpcServer (capnweb RPC Durable Object wrapper)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeRpcServer, createRpcHandler, createRpcServer } from './server.js'
import type { ClaudeCode } from '../server/claude-code.js'
import type { ClaudeSession, PermissionMode } from '../types/options.js'
import type {
  SDKMessage,
  SDKResultMessage,
  ModelInfo,
  McpServerStatus,
} from '../types/messages.js'
import type { TodoUpdate, PlanUpdate } from '../types/events.js'
import type { IStreamCallbacks } from './interfaces.js'

/**
 * Create a mock ClaudeCode Durable Object
 */
function createMockClaudeCode(): Partial<ClaudeCode> {
  const sessions: Map<string, ClaudeSession> = new Map()
  const outputListeners: Map<string, Array<(msg: SDKMessage) => void>> = new Map()
  const todoListeners: Map<string, Array<(update: TodoUpdate) => void>> = new Map()
  const planListeners: Map<string, Array<(update: PlanUpdate) => void>> = new Map()
  let sessionCounter = 0

  return {
    createSession: vi.fn().mockImplementation(async (options = {}) => {
      const session: ClaudeSession = {
        id: `session-${Date.now()}-${++sessionCounter}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        cwd: options.cwd ?? '/workspace',
        model: options.model,
        systemPrompt: options.systemPrompt,
        tools: options.tools,
        permissionMode: options.permissionMode ?? 'default',
        maxTurns: options.maxTurns,
        turnCount: 0,
        totalCostUsd: 0,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
        },
      }
      sessions.set(session.id, session)
      return session
    }),

    getSession: vi.fn().mockImplementation(async (sessionId: string) => {
      return sessions.get(sessionId) ?? null
    }),

    resumeSession: vi.fn().mockImplementation(async (sessionId: string) => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      session.status = 'active'
      return session
    }),

    listSessions: vi.fn().mockImplementation(async () => {
      return Array.from(sessions.values())
    }),

    destroySession: vi.fn().mockImplementation(async (sessionId: string) => {
      sessions.delete(sessionId)
      outputListeners.delete(sessionId)
      todoListeners.delete(sessionId)
      planListeners.delete(sessionId)
    }),

    sendMessage: vi.fn().mockImplementation(async () => {
      // Simulate message sent
    }),

    interrupt: vi.fn().mockImplementation(async (sessionId: string) => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      session.status = 'interrupted'
    }),

    setPermissionMode: vi.fn().mockImplementation(async (sessionId: string, mode: PermissionMode) => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      session.permissionMode = mode
    }),

    supportedModels: vi.fn().mockResolvedValue([
      { value: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', description: 'Fast model' },
      { value: 'claude-opus-4-20250514', displayName: 'Claude Opus 4', description: 'Most capable' },
    ]),

    mcpServerStatus: vi.fn().mockImplementation(async (sessionId: string) => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      return session.mcpServers?.map((s) => ({ name: s.name, status: s.status ?? 'pending' })) ?? []
    }),

    // Event subscription methods
    onOutput: vi.fn().mockImplementation((sessionId: string, callback: (msg: SDKMessage) => void) => {
      if (!outputListeners.has(sessionId)) {
        outputListeners.set(sessionId, [])
      }
      outputListeners.get(sessionId)!.push(callback)
      return () => {
        const listeners = outputListeners.get(sessionId)
        if (listeners) {
          const index = listeners.indexOf(callback)
          if (index > -1) listeners.splice(index, 1)
        }
      }
    }),

    onTodoUpdate: vi.fn().mockImplementation((sessionId: string, callback: (update: TodoUpdate) => void) => {
      if (!todoListeners.has(sessionId)) {
        todoListeners.set(sessionId, [])
      }
      todoListeners.get(sessionId)!.push(callback)
      return () => {
        const listeners = todoListeners.get(sessionId)
        if (listeners) {
          const index = listeners.indexOf(callback)
          if (index > -1) listeners.splice(index, 1)
        }
      }
    }),

    onPlanUpdate: vi.fn().mockImplementation((sessionId: string, callback: (update: PlanUpdate) => void) => {
      if (!planListeners.has(sessionId)) {
        planListeners.set(sessionId, [])
      }
      planListeners.get(sessionId)!.push(callback)
      return () => {
        const listeners = planListeners.get(sessionId)
        if (listeners) {
          const index = listeners.indexOf(callback)
          if (index > -1) listeners.splice(index, 1)
        }
      }
    }),

    // Async generator for query
    query: vi.fn().mockImplementation(async function* (prompt: string, options = {}) {
      yield { type: 'system', subtype: 'init', session_id: 'test-session', cwd: '/workspace' } as SDKMessage
      yield {
        type: 'assistant',
        uuid: 'msg-1',
        session_id: 'test-session',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
        parent_tool_use_id: null,
      } as SDKMessage
      yield {
        type: 'result',
        subtype: 'success',
        uuid: 'result-1',
        session_id: 'test-session',
        duration_ms: 1000,
        duration_api_ms: 900,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.001,
        usage: { input_tokens: 100, output_tokens: 50 },
        result: 'Hello!',
      } as SDKResultMessage
    }),

    // Helper for tests to simulate output events
    _simulateOutput: (sessionId: string, msg: SDKMessage) => {
      outputListeners.get(sessionId)?.forEach((cb) => cb(msg))
    },
    _simulateTodoUpdate: (sessionId: string, update: TodoUpdate) => {
      todoListeners.get(sessionId)?.forEach((cb) => cb(update))
    },
    _simulatePlanUpdate: (sessionId: string, update: PlanUpdate) => {
      planListeners.get(sessionId)?.forEach((cb) => cb(update))
    },
    _getSession: (sessionId: string) => sessions.get(sessionId),
    _setSessionStatus: (sessionId: string, status: ClaudeSession['status']) => {
      const session = sessions.get(sessionId)
      if (session) session.status = status
    },
  }
}

/**
 * Create mock stream callbacks
 */
function createMockCallbacks(): IStreamCallbacks & {
  messages: SDKMessage[]
  todoUpdates: TodoUpdate[]
  planUpdates: PlanUpdate[]
  errors: Array<{ code: string; message: string }>
  completions: SDKResultMessage[]
} {
  const callbacks = {
    messages: [] as SDKMessage[],
    todoUpdates: [] as TodoUpdate[],
    planUpdates: [] as PlanUpdate[],
    errors: [] as Array<{ code: string; message: string }>,
    completions: [] as SDKResultMessage[],

    onMessage: vi.fn((msg: SDKMessage) => {
      callbacks.messages.push(msg)
    }),
    onTodoUpdate: vi.fn((update: TodoUpdate) => {
      callbacks.todoUpdates.push(update)
    }),
    onPlanUpdate: vi.fn((update: PlanUpdate) => {
      callbacks.planUpdates.push(update)
    }),
    onError: vi.fn((error: { code: string; message: string }) => {
      callbacks.errors.push(error)
    }),
    onComplete: vi.fn((result: SDKResultMessage) => {
      callbacks.completions.push(result)
    }),
  }
  return callbacks as IStreamCallbacks & typeof callbacks
}

// Extended mock type for internal test helpers
type MockClaudeCode = ReturnType<typeof createMockClaudeCode> & {
  _simulateOutput: (sessionId: string, msg: SDKMessage) => void
  _simulateTodoUpdate: (sessionId: string, update: TodoUpdate) => void
  _simulatePlanUpdate: (sessionId: string, update: PlanUpdate) => void
  _getSession: (sessionId: string) => ClaudeSession | undefined
  _setSessionStatus: (sessionId: string, status: ClaudeSession['status']) => void
}

describe('ClaudeCodeRpcServer', () => {
  let mockClaude: MockClaudeCode
  let server: ClaudeCodeRpcServer

  beforeEach(() => {
    vi.clearAllMocks()
    mockClaude = createMockClaudeCode() as MockClaudeCode
    server = new ClaudeCodeRpcServer(mockClaude as ClaudeCode)
  })

  describe('session management', () => {
    describe('createSession', () => {
      it('should create a new session with default options', async () => {
        const session = await server.createSession()

        expect(mockClaude.createSession).toHaveBeenCalledWith(undefined)
        expect(session).toBeDefined()
        expect(session.id).toBeDefined()
        expect(session.status).toBe('active')
        expect(session.permissionMode).toBe('default')
      })

      it('should create session with custom options', async () => {
        const options = {
          cwd: '/custom/workspace',
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are a helpful assistant.',
          permissionMode: 'bypassPermissions' as PermissionMode,
          maxTurns: 10,
        }

        const session = await server.createSession(options)

        expect(mockClaude.createSession).toHaveBeenCalledWith(options)
        expect(session.cwd).toBe('/custom/workspace')
        expect(session.model).toBe('claude-opus-4-20250514')
        expect(session.permissionMode).toBe('bypassPermissions')
        expect(session.maxTurns).toBe(10)
      })
    })

    describe('getSession', () => {
      it('should return session by ID', async () => {
        const created = await server.createSession()
        const retrieved = await server.getSession(created.id)

        expect(mockClaude.getSession).toHaveBeenCalledWith(created.id)
        expect(retrieved).toEqual(created)
      })

      it('should return null for non-existent session', async () => {
        const result = await server.getSession('non-existent-id')

        expect(mockClaude.getSession).toHaveBeenCalledWith('non-existent-id')
        expect(result).toBeNull()
      })
    })

    describe('resumeSession', () => {
      it('should resume an existing session', async () => {
        const created = await server.createSession()
        mockClaude._setSessionStatus(created.id, 'completed')

        const resumed = await server.resumeSession(created.id)

        expect(mockClaude.resumeSession).toHaveBeenCalledWith(created.id)
        expect(resumed.status).toBe('active')
      })

      it('should throw error for non-existent session', async () => {
        await expect(server.resumeSession('non-existent')).rejects.toThrow(
          'Session not found: non-existent'
        )
      })
    })

    describe('listSessions', () => {
      it('should return empty array when no sessions exist', async () => {
        const sessions = await server.listSessions()

        expect(mockClaude.listSessions).toHaveBeenCalled()
        expect(sessions).toEqual([])
      })

      it('should return all sessions', async () => {
        // Create sessions sequentially
        await server.createSession({ cwd: '/project1' })
        await server.createSession({ cwd: '/project2' })
        await server.createSession({ cwd: '/project3' })

        const sessions = await server.listSessions()

        // Verify listSessions was called
        expect(mockClaude.listSessions).toHaveBeenCalled()
        // Check that all 3 sessions are returned
        expect(sessions).toHaveLength(3)
        expect(sessions.map((s) => s.cwd)).toEqual(['/project1', '/project2', '/project3'])
      })
    })

    describe('destroySession', () => {
      it('should destroy an existing session', async () => {
        const session = await server.createSession()
        await server.destroySession(session.id)

        expect(mockClaude.destroySession).toHaveBeenCalledWith(session.id)

        const retrieved = await server.getSession(session.id)
        expect(retrieved).toBeNull()
      })

      it('should not throw for non-existent session', async () => {
        await expect(server.destroySession('non-existent')).resolves.not.toThrow()
      })
    })
  })

  describe('messaging', () => {
    describe('sendMessage', () => {
      it('should send message to session', async () => {
        const session = await server.createSession()

        await server.sendMessage(session.id, 'Hello, Claude!')

        expect(mockClaude.sendMessage).toHaveBeenCalledWith(session.id, 'Hello, Claude!')
      })
    })

    describe('sendMessageWithCallbacks', () => {
      it('should register callbacks and send message', async () => {
        const session = await server.createSession()
        const callbacks = createMockCallbacks()

        // Simulate a quick result for the callback flow
        const sendPromise = server.sendMessageWithCallbacks(
          session.id,
          'Build a todo app',
          callbacks
        )

        // Simulate output message
        mockClaude._simulateOutput(session.id, {
          type: 'assistant',
          uuid: 'msg-1',
          session_id: session.id,
          message: { role: 'assistant', content: [{ type: 'text', text: 'Building todo app...' }] },
          parent_tool_use_id: null,
        })

        // Simulate todo update
        mockClaude._simulateTodoUpdate(session.id, {
          todos: [{ content: 'Create components', status: 'in_progress', activeForm: 'Creating components' }],
          timestamp: new Date().toISOString(),
        })

        // Simulate result message to complete
        const resultMessage: SDKResultMessage = {
          type: 'result',
          subtype: 'success',
          uuid: 'result-1',
          session_id: session.id,
          duration_ms: 1000,
          duration_api_ms: 900,
          is_error: false,
          num_turns: 1,
          total_cost_usd: 0.001,
          usage: { input_tokens: 100, output_tokens: 50 },
          result: 'Todo app created!',
        }
        mockClaude._simulateOutput(session.id, resultMessage)

        await sendPromise

        expect(mockClaude.sendMessage).toHaveBeenCalledWith(session.id, 'Build a todo app')
        expect(mockClaude.onOutput).toHaveBeenCalled()
        expect(mockClaude.onTodoUpdate).toHaveBeenCalled()
        expect(mockClaude.onPlanUpdate).toHaveBeenCalled()
        expect(callbacks.onMessage).toHaveBeenCalled()
        expect(callbacks.onTodoUpdate).toHaveBeenCalled()
        expect(callbacks.onComplete).toHaveBeenCalledWith(resultMessage)
      })

      it('should handle callback errors gracefully', async () => {
        const session = await server.createSession()
        const callbacks = createMockCallbacks()

        // Make onMessage throw
        callbacks.onMessage = vi.fn(() => {
          throw new Error('Callback error')
        })

        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

        const sendPromise = server.sendMessageWithCallbacks(session.id, 'Test', callbacks)

        // Simulate message and result
        mockClaude._simulateOutput(session.id, {
          type: 'assistant',
          uuid: 'msg-1',
          session_id: session.id,
          message: { role: 'assistant', content: [{ type: 'text', text: 'Test response' }] },
          parent_tool_use_id: null,
        })

        mockClaude._simulateOutput(session.id, {
          type: 'result',
          subtype: 'success',
          uuid: 'result-1',
          session_id: session.id,
          duration_ms: 100,
          duration_api_ms: 90,
          is_error: false,
          num_turns: 1,
          total_cost_usd: 0.0001,
          usage: { input_tokens: 10, output_tokens: 5 },
          result: '',
        } as SDKResultMessage)

        await sendPromise

        expect(consoleError).toHaveBeenCalledWith('Callback error (onMessage):', expect.any(Error))
        consoleError.mockRestore()
      })
    })

    describe('query', () => {
      it('should execute one-shot query and return result', async () => {
        const result = await server.query('What is 2+2?')

        // Note: query passes undefined when no options provided
        expect(mockClaude.query).toHaveBeenCalledWith('What is 2+2?', undefined)
        expect(result).toBe('Hello!')
      })

      it('should pass options to query', async () => {
        const options = {
          model: 'claude-opus-4-20250514',
          systemPrompt: 'You are a math tutor.',
        }

        await server.query('What is 2+2?', options)

        expect(mockClaude.query).toHaveBeenCalledWith('What is 2+2?', options)
      })
    })

    describe('queryWithCallbacks', () => {
      it('should execute query with callbacks', async () => {
        const callbacks = createMockCallbacks()

        // Mock sendMessageWithCallbacks on the server itself
        server.sendMessageWithCallbacks = vi.fn().mockResolvedValue(undefined)

        const result = await server.queryWithCallbacks(
          'Build a calculator',
          { model: 'claude-sonnet-4-20250514' },
          callbacks
        )

        expect(mockClaude.createSession).toHaveBeenCalled()
        expect(server.sendMessageWithCallbacks).toHaveBeenCalled()
        expect(typeof result).toBe('string')
      })
    })
  })

  describe('control', () => {
    describe('interrupt', () => {
      it('should interrupt active session', async () => {
        const session = await server.createSession()

        await server.interrupt(session.id)

        expect(mockClaude.interrupt).toHaveBeenCalledWith(session.id)
      })

      it('should throw for non-existent session', async () => {
        await expect(server.interrupt('non-existent')).rejects.toThrow(
          'Session not found: non-existent'
        )
      })
    })

    describe('setPermissionMode', () => {
      it('should update permission mode', async () => {
        const session = await server.createSession()

        await server.setPermissionMode(session.id, 'bypassPermissions')

        expect(mockClaude.setPermissionMode).toHaveBeenCalledWith(
          session.id,
          'bypassPermissions'
        )
      })

      it('should throw for non-existent session', async () => {
        await expect(
          server.setPermissionMode('non-existent', 'acceptEdits')
        ).rejects.toThrow('Session not found: non-existent')
      })
    })
  })

  describe('info', () => {
    describe('supportedModels', () => {
      it('should return list of supported models', async () => {
        const models = await server.supportedModels()

        expect(mockClaude.supportedModels).toHaveBeenCalled()
        expect(models).toHaveLength(2)
        expect(models[0].value).toBe('claude-sonnet-4-20250514')
        expect(models[1].value).toBe('claude-opus-4-20250514')
      })
    })

    describe('mcpServerStatus', () => {
      it('should return MCP server status', async () => {
        // Create session with MCP servers
        const session = await server.createSession()
        const sessionData = mockClaude._getSession(session.id)
        if (sessionData) {
          sessionData.mcpServers = [
            { name: 'filesystem', config: { command: 'mcp-filesystem' }, status: 'connected' },
            { name: 'github', config: { type: 'sse', url: 'https://mcp.github.com' }, status: 'pending' },
          ]
        }

        const status = await server.mcpServerStatus(session.id)

        expect(mockClaude.mcpServerStatus).toHaveBeenCalledWith(session.id)
        expect(status).toHaveLength(2)
        expect(status[0]).toEqual({ name: 'filesystem', status: 'connected' })
        expect(status[1]).toEqual({ name: 'github', status: 'pending' })
      })

      it('should throw for non-existent session', async () => {
        await expect(server.mcpServerStatus('non-existent')).rejects.toThrow(
          'Session not found: non-existent'
        )
      })
    })
  })

  describe('error scenarios', () => {
    it('should handle ClaudeCode errors gracefully', async () => {
      mockClaude.createSession = vi.fn().mockRejectedValue(new Error('Sandbox unavailable'))

      await expect(server.createSession()).rejects.toThrow('Sandbox unavailable')
    })

    it('should handle timeout errors', async () => {
      mockClaude.sendMessage = vi.fn().mockRejectedValue(new Error('Process timeout'))

      const session = await server.createSession()

      await expect(server.sendMessage(session.id, 'Test')).rejects.toThrow('Process timeout')
    })

    it('should handle API key errors', async () => {
      mockClaude.sendMessage = vi.fn().mockRejectedValue(
        new Error('Invalid API key')
      )

      const session = await server.createSession()

      await expect(server.sendMessage(session.id, 'Test')).rejects.toThrow('Invalid API key')
    })
  })
})

describe('createRpcHandler', () => {
  it('should create a request handler function', () => {
    const mockClaude = createMockClaudeCode()
    const handler = createRpcHandler(mockClaude as ClaudeCode)

    expect(typeof handler).toBe('function')
  })

  it('should return a function that takes a Request and returns a Promise<Response>', async () => {
    const mockClaude = createMockClaudeCode()
    const handler = createRpcHandler(mockClaude as ClaudeCode)

    // Note: This would require mocking newWorkersRpcResponse from capnweb
    // For now, just verify the handler signature
    expect(handler.length).toBe(1)
  })
})

describe('createRpcServer', () => {
  it('should create a ClaudeCodeRpcServer instance', () => {
    const mockClaude = createMockClaudeCode()
    const server = createRpcServer(mockClaude as ClaudeCode)

    expect(server).toBeInstanceOf(ClaudeCodeRpcServer)
  })

  it('should expose all expected methods', () => {
    const mockClaude = createMockClaudeCode()
    const server = createRpcServer(mockClaude as ClaudeCode)

    // Session management
    expect(typeof server.createSession).toBe('function')
    expect(typeof server.getSession).toBe('function')
    expect(typeof server.resumeSession).toBe('function')
    expect(typeof server.listSessions).toBe('function')
    expect(typeof server.destroySession).toBe('function')

    // Messaging
    expect(typeof server.sendMessage).toBe('function')
    expect(typeof server.sendMessageWithCallbacks).toBe('function')
    expect(typeof server.query).toBe('function')
    expect(typeof server.queryWithCallbacks).toBe('function')

    // Control
    expect(typeof server.interrupt).toBe('function')
    expect(typeof server.setPermissionMode).toBe('function')

    // Info
    expect(typeof server.supportedModels).toBe('function')
    expect(typeof server.mcpServerStatus).toBe('function')
  })
})
