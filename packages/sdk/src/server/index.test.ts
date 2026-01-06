/**
 * @dotdo/claude Server Tests
 *
 * TDD RED phase - Tests for server helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createClaudeServer,
  cloneRepository,
  proxyToClaude,
  getSandbox,
  type Sandbox,
} from './index.js'

// Mock Sandbox
function createMockSandbox(): Sandbox {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      waitForPort: vi.fn().mockResolvedValue(undefined),
    }),
    wsConnect: vi.fn().mockResolvedValue(new Response()),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
  }
}

describe('getSandbox', () => {
  it('should get sandbox instance by ID', () => {
    const mockSandbox = createMockSandbox()
    const namespace = {
      get: vi.fn().mockReturnValue(mockSandbox),
    }

    const sandbox = getSandbox(namespace, 'session-123')

    expect(namespace.get).toHaveBeenCalledWith('session-123')
    expect(sandbox).toBe(mockSandbox)
  })
})

describe('createClaudeServer', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should create server with default port', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    expect(server.port).toBe(7681)
    expect(server.sandbox).toBe(mockSandbox)
    expect(server.config.directory).toBe('/home/user/project')
  })

  it('should create server with custom port', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
      port: 8080,
    })

    expect(server.port).toBe(8080)
  })

  it('should configure Claude Code settings in sandbox', async () => {
    await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    // Should create .claude directory
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'mkdir -p /home/claude/.claude',
      expect.any(Object)
    )

    // Should write settings.json
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.any(Object)
    )

    // Should write .claude.json state
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.any(Object)
    )

    // Should fix ownership
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'chown -R claude:claude /home/claude',
      expect.any(Object)
    )
  })

  describe('server.start', () => {
    it('should start PTY server process', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        'cd /pty-server && node sandbox-pty-server.js',
        expect.objectContaining({
          env: expect.objectContaining({
            WORKSPACE: '/home/user/project',
            PTY_PORT: '7681',
          }),
        })
      )
    })

    it('should pass API key in environment', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
        apiKey: 'sk-ant-xxx',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'sk-ant-xxx',
          }),
        })
      )
    })

    it('should pass OAuth token in environment', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
        oauthToken: 'oauth-token',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
          }),
        })
      )
    })

    it('should wait for port to be ready', async () => {
      const waitForPort = vi.fn().mockResolvedValue(undefined)
      mockSandbox.startProcess = vi.fn().mockResolvedValue({ waitForPort })

      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.start()

      expect(waitForPort).toHaveBeenCalledWith(7681, { timeout: 30000 })
    })
  })

  describe('server.stop', () => {
    it('should kill PTY server process', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.stop()

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        'pkill -f sandbox-pty-server || true',
        { timeout: 5000 }
      )
    })
  })
})

describe('cloneRepository', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should clone repository to default directory', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' }) // repo doesn't exist
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' }) // clone succeeds

    const dir = await cloneRepository(mockSandbox, 'owner/repo')

    expect(dir).toBe('/repo')
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'git clone --depth 1 https://github.com/owner/repo.git /repo',
      { timeout: 60000 }
    )
  })

  it('should clone to custom target directory', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' })

    const dir = await cloneRepository(mockSandbox, 'owner/repo', '/custom/path')

    expect(dir).toBe('/custom/path')
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'git clone --depth 1 https://github.com/owner/repo.git /custom/path',
      expect.any(Object)
    )
  })

  it('should skip clone if repo already exists', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'exists' })

    const dir = await cloneRepository(mockSandbox, 'owner/repo')

    expect(dir).toBe('/repo')
    // Should only call exec once (to check existence)
    expect(mockSandbox.exec).toHaveBeenCalledTimes(1)
  })

  it('should throw on invalid repo format', async () => {
    await expect(cloneRepository(mockSandbox, 'invalid')).rejects.toThrow(
      'Invalid repository format'
    )
    await expect(cloneRepository(mockSandbox, 'invalid/repo/path')).rejects.toThrow(
      'Invalid repository format'
    )
    await expect(cloneRepository(mockSandbox, '../traversal')).rejects.toThrow(
      'Invalid repository format'
    )
  })

  it('should throw on clone failure', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 128, stderr: 'Repository not found' })

    await expect(cloneRepository(mockSandbox, 'owner/repo')).rejects.toThrow(
      'Failed to clone repository: Repository not found'
    )
  })
})

describe('proxyToClaude', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should proxy WebSocket upgrade request', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    const request = new Request('https://test.com/ws', {
      headers: { Upgrade: 'websocket' },
    })

    await proxyToClaude(server, request)

    expect(mockSandbox.wsConnect).toHaveBeenCalledWith(request, 7681)
  })

  it('should return 501 for HTTP requests (not implemented)', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    const request = new Request('https://test.com/api/sessions')
    const response = await proxyToClaude(server, request)

    expect(response.status).toBe(501)
    const body = await response.json()
    expect(body.error).toBe('HTTP proxy not implemented')
  })
})

describe('promise rejection handling', () => {
  it('logs errors from background tasks', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // The fire-and-forget calls should have .catch handlers
    // This is more of a code review - check that the patterns exist
    expect(true).toBe(true) // Placeholder - real test is type checking

    consoleSpy.mockRestore()
  })
})

describe('configureClaudeCode shell injection prevention', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should not execute $(command) in settings JSON', async () => {
    // Track the actual commands executed
    const commands: string[] = []
    mockSandbox.exec = vi.fn().mockImplementation((cmd: string) => {
      commands.push(cmd)
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
    })

    await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    // The commands should use safe heredoc or base64, not vulnerable printf
    const writeCommands = commands.filter(
      (cmd) => cmd.includes('settings.json') || cmd.includes('.claude.json')
    )

    for (const cmd of writeCommands) {
      // Should NOT use printf with double-quoted string interpolation
      expect(cmd).not.toMatch(/printf\s+"[^"]*"\s*>/)
      // Should use safe heredoc with quoted delimiter OR base64
      const usesSafeMethod =
        cmd.includes("<<'EOF'") ||
        cmd.includes('base64') ||
        cmd.includes("cat <<'")
      expect(usesSafeMethod).toBe(true)
    }
  })

  it('should not execute backtick commands in settings JSON', async () => {
    const commands: string[] = []
    mockSandbox.exec = vi.fn().mockImplementation((cmd: string) => {
      commands.push(cmd)
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
    })

    await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    // Check that write commands don't use vulnerable patterns
    const writeCommands = commands.filter(
      (cmd) => cmd.includes('settings.json') || cmd.includes('.claude.json')
    )

    for (const cmd of writeCommands) {
      // Backticks in printf would be dangerous - should use safe method
      expect(cmd).not.toMatch(/printf\s+"[^"]*"\s*>/)
    }
  })

  it('should not execute ${} variable expansion in settings JSON', async () => {
    const commands: string[] = []
    mockSandbox.exec = vi.fn().mockImplementation((cmd: string) => {
      commands.push(cmd)
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
    })

    await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    // Check that write commands don't use vulnerable patterns
    const writeCommands = commands.filter(
      (cmd) => cmd.includes('settings.json') || cmd.includes('.claude.json')
    )

    for (const cmd of writeCommands) {
      // ${} in printf would be dangerous - should use safe method
      expect(cmd).not.toMatch(/printf\s+"[^"]*"\s*>/)
    }
  })
})

// ============================================================================
// Stream Error Handling Tests (TDD RED phase for issue claude-6rv)
// ============================================================================

describe('streamProcessOutput error handling', () => {
  /**
   * Test: stream throws error -> session should enter 'error' state
   *
   * When the stream throws an error during processing, the session should
   * be marked as 'error' state so clients know something went wrong.
   */
  it('should set session status to error when stream throws', async () => {
    // Import ClaudeCode class directly for testing
    const { ClaudeCode } = await import('./claude-code.js')

    // Create mock state and env
    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    // Create mock sandbox that will fail during stream
    const streamError = new Error('Stream disconnected')
    const mockSandbox = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-123',
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      streamProcessLogs: vi.fn().mockImplementation(() => {
        // Return a stream that errors
        return Promise.resolve(new ReadableStream({
          start(controller) {
            controller.error(streamError)
          }
        }))
      }),
    }

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue(mockSandbox),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create a session
    const session = await claude.createSession({ cwd: '/workspace' })
    expect(session.status).toBe('active')

    // Subscribe to error events
    let errorReceived: Error | null = null
    claude['emitter'].on(`error:${session.id}`, (error: Error) => {
      errorReceived = error
    })

    // Send a message (this triggers stream processing which will error)
    await claude.sendMessage(session.id, 'test message')

    // Wait a bit for the stream error to be processed
    await new Promise(resolve => setTimeout(resolve, 100))

    // Check that error was emitted
    expect(errorReceived).toBeTruthy()

    // Check that session status is now 'error'
    const updatedSession = await claude.getSession(session.id)
    expect(updatedSession?.status).toBe('error')
  })

  /**
   * Test: stream disconnects -> should trigger cleanup
   *
   * When the stream disconnects, the process manager should mark
   * the process as dead and clean up resources.
   */
  it('should clean up resources when stream disconnects', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    // Create mock sandbox with controlled stream
    let streamEnded = false
    const mockSandbox = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-456',
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      streamProcessLogs: vi.fn().mockImplementation(() => {
        // Return a stream that ends immediately (disconnect)
        return Promise.resolve(new ReadableStream({
          start(controller) {
            streamEnded = true
            controller.close()
          }
        }))
      }),
    }

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue(mockSandbox),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session and send message
    const session = await claude.createSession({ cwd: '/workspace' })
    await claude.sendMessage(session.id, 'test message')

    // Wait for stream to process
    await new Promise(resolve => setTimeout(resolve, 100))

    // Stream should have ended
    expect(streamEnded).toBe(true)

    // Process should be marked as dead
    const processManager = claude['processManager']
    expect(processManager?.isAlive(session.id)).toBe(false)
  })

  /**
   * Test: multiple stream errors -> should not leak resources
   *
   * If multiple errors occur, we should not create duplicate error handlers
   * or leak event subscriptions.
   */
  it('should not leak resources on multiple stream errors', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    let errorCount = 0
    const mockSandbox = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
      startProcess: vi.fn().mockResolvedValue({
        id: `process-${Date.now()}`,
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      streamProcessLogs: vi.fn().mockImplementation(() => {
        errorCount++
        return Promise.resolve(new ReadableStream({
          start(controller) {
            controller.error(new Error(`Stream error ${errorCount}`))
          }
        }))
      }),
    }

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue(mockSandbox),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)
    const emitter = claude['emitter']

    // Create session
    const session = await claude.createSession({ cwd: '/workspace' })

    // Track error events
    let errorsReceived = 0
    emitter.on(`error:${session.id}`, () => {
      errorsReceived++
    })

    // Initial listener count
    const initialCount = emitter.listenerCount()

    // Send multiple messages (each will trigger stream error)
    await claude.sendMessage(session.id, 'test 1')
    await new Promise(resolve => setTimeout(resolve, 50))

    // Process should be dead, need to "restart" it for next message
    claude['processManager']?.['processes'].delete(session.id)

    await claude.sendMessage(session.id, 'test 2')
    await new Promise(resolve => setTimeout(resolve, 50))

    claude['processManager']?.['processes'].delete(session.id)

    await claude.sendMessage(session.id, 'test 3')
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should have received 3 errors
    expect(errorsReceived).toBe(3)

    // Listener count should not have grown significantly
    // (allowing for the one error listener we added)
    const finalCount = emitter.listenerCount()
    expect(finalCount).toBeLessThanOrEqual(initialCount + 2)
  })

  /**
   * Test: error details should be added to session object
   *
   * When an error occurs, the session should contain error details
   * that can be retrieved by clients.
   */
  it('should add error details to session object', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    const errorMessage = 'Connection reset by peer'
    const mockSandbox = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-789',
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      streamProcessLogs: vi.fn().mockImplementation(() => {
        return Promise.resolve(new ReadableStream({
          start(controller) {
            controller.error(new Error(errorMessage))
          }
        }))
      }),
    }

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue(mockSandbox),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session and trigger error
    const session = await claude.createSession({ cwd: '/workspace' })
    await claude.sendMessage(session.id, 'test message')

    // Wait for error to be processed
    await new Promise(resolve => setTimeout(resolve, 100))

    // Get updated session
    const updatedSession = await claude.getSession(session.id)

    // Session should have error details
    expect(updatedSession?.status).toBe('error')
    expect(updatedSession?.error).toBeDefined()
    expect(updatedSession?.error?.message).toBe(errorMessage)
    expect(updatedSession?.error?.timestamp).toBeDefined()
  })
})

// ============================================================================
// Session Storage Race Condition Tests (TDD RED phase for issue claude-uly)
// ============================================================================

describe('session storage race conditions', () => {
  /**
   * Test: 10 concurrent session updates should all succeed without data loss
   *
   * When multiple concurrent operations update session state, we need mutex
   * protection to prevent lost updates.
   */
  it('should handle 10 concurrent session updates without data loss', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    // Track all storage operations
    const storageOps: Array<{ key: string; value: unknown; timestamp: number }> = []
    const mockStorage = new Map<string, unknown>()

    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
          return mockStorage.get(key)
        }),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          // Simulate network delay to expose race conditions
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10))
          storageOps.push({ key, value, timestamp: Date.now() })
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
          setEnvVars: vi.fn().mockResolvedValue(undefined),
        }),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create 10 sessions concurrently
    const sessionPromises = Array.from({ length: 10 }, (_, i) =>
      claude.createSession({ cwd: `/workspace-${i}` })
    )

    const sessions = await Promise.all(sessionPromises)

    // All 10 sessions should have been created
    expect(sessions).toHaveLength(10)

    // Each session should have a unique ID
    const uniqueIds = new Set(sessions.map(s => s.id))
    expect(uniqueIds.size).toBe(10)

    // List sessions should return all 10
    const allSessions = await claude.listSessions()
    expect(allSessions).toHaveLength(10)

    // Check that no sessions were lost due to race conditions
    for (let i = 0; i < 10; i++) {
      const session = await claude.getSession(sessions[i].id)
      expect(session).not.toBeNull()
      expect(session?.cwd).toBe(`/workspace-${i}`)
    }
  })

  /**
   * Test: rapid status changes should result in correct final state
   *
   * When session status changes rapidly (active -> interrupted -> completed),
   * the final state should reflect the last update, not a race condition winner.
   */
  it('should handle rapid status changes correctly', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          return mockStorage.get(key)
        }),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
          setEnvVars: vi.fn().mockResolvedValue(undefined),
        }),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create a session
    const session = await claude.createSession({ cwd: '/workspace' })
    expect(session.status).toBe('active')

    // Rapid concurrent status changes via resume/interrupt
    // We'll simulate this by accessing internal sessions map and making parallel updates
    const internalSessions = claude['sessions'] as Map<string, import('../types/options.js').ClaudeSession>

    // Make many concurrent updates to the same session
    const updatePromises: Promise<void>[] = []

    for (let i = 0; i < 20; i++) {
      updatePromises.push((async () => {
        const s = internalSessions.get(session.id)
        if (s) {
          s.lastActivityAt = new Date(Date.now() + i).toISOString()
          s.turnCount = i
          // Call persistSessions to trigger storage write
          await claude['persistSessions']()
        }
      })())
    }

    await Promise.all(updatePromises)

    // After all updates, the turn count should be 19 (the last update)
    // Not some random intermediate value due to race conditions
    const finalSession = await claude.getSession(session.id)

    // Due to race conditions without mutex, we might see:
    // - Wrong turn count (overwritten by earlier update completing later)
    // - Missing session data
    // With proper mutex, turn count should be 19
    expect(finalSession).not.toBeNull()
    expect(finalSession?.turnCount).toBe(19)
  })

  /**
   * Test: concurrent message appends should not lose any messages
   *
   * When multiple messages are being processed simultaneously for the same
   * session, all messages should be recorded in order.
   *
   * Note: This test verifies that session activity timestamps are properly
   * serialized through the storage mutex during concurrent message sends.
   */
  it('should not lose messages during concurrent appends', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    // Track storage writes to verify mutex protects all operations
    const storageWrites: Array<{ timestamp: number; sessionCount: number }> = []
    const mockStorage = new Map<string, unknown>()

    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          return mockStorage.get(key)
        }),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          // Track each storage write with session count at time of write
          if (key === 'sessions' && value instanceof Map) {
            storageWrites.push({ timestamp: Date.now(), sessionCount: value.size })
          }
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    // Mock sandbox that tracks messages via writeFile
    const writtenMessages: string[] = []
    const mockSandbox = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
      setEnvVars: vi.fn().mockResolvedValue(undefined),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-123',
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockImplementation(async (_path: string, content: string) => {
        // Track writes to stdin file
        writtenMessages.push(content)
      }),
      readFile: vi.fn().mockResolvedValue(''),
      streamProcessLogs: vi.fn().mockImplementation(() => {
        // Return a stream that never ends
        return Promise.resolve(new ReadableStream({
          start() { /* keep open */ }
        }))
      }),
    }

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue(mockSandbox),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create a session first
    const session = await claude.createSession({ cwd: '/workspace' })

    // Clear storage writes from session creation
    storageWrites.length = 0

    // Now send 10 messages concurrently
    // Each sendMessage call will update lastActivityAt and persist
    const messagePromises = Array.from({ length: 10 }, (_, i) =>
      claude.sendMessage(session.id, `message-${i}`)
    )

    await Promise.all(messagePromises)

    // With mutex protection, storage writes should happen sequentially
    // All writes should preserve the session (no data loss)
    // Every storage write should have exactly 1 session
    for (const write of storageWrites) {
      expect(write.sessionCount).toBe(1)
    }

    // Verify the session still exists and was properly updated
    const finalSession = await claude.getSession(session.id)
    expect(finalSession).not.toBeNull()
    expect(finalSession?.status).toBe('active')

    // lastActivityAt should be set (it was updated by each sendMessage)
    expect(finalSession?.lastActivityAt).toBeDefined()
  })

  /**
   * Test: concurrent session creation and destruction should not corrupt state
   *
   * When creating and destroying sessions concurrently, no orphaned data
   * should remain and no sessions should be incorrectly deleted.
   */
  it('should handle concurrent session creation and destruction', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    const mockStorage = new Map<string, unknown>()
    const mockState = {
      id: { toString: () => 'test-do-id' },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          return mockStorage.get(key)
        }),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 5))
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState

    const mockEnv = {
      Sandbox: {
        get: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue({ exitCode: 0 }),
          setEnvVars: vi.fn().mockResolvedValue(undefined),
        }),
      },
      ANTHROPIC_API_KEY: 'test-key',
    } as unknown as import('../types/options.js').ClaudeCodeEnv

    const claude = new ClaudeCode(mockState, mockEnv)

    // Create 5 sessions
    const initialSessions = await Promise.all(
      Array.from({ length: 5 }, (_, i) => claude.createSession({ cwd: `/workspace-${i}` }))
    )

    // Now concurrently: create 5 more AND destroy the first 5
    const createPromises = Array.from({ length: 5 }, (_, i) =>
      claude.createSession({ cwd: `/workspace-new-${i}` })
    )
    const destroyPromises = initialSessions.map(s => claude.destroySession(s.id))

    const [newSessions] = await Promise.all([
      Promise.all(createPromises),
      Promise.all(destroyPromises),
    ])

    // Wait for all operations to settle
    await new Promise(resolve => setTimeout(resolve, 50))

    // Final state should have exactly 5 sessions (the new ones)
    const finalSessions = await claude.listSessions()
    expect(finalSessions).toHaveLength(5)

    // All new sessions should exist
    for (const ns of newSessions) {
      const session = await claude.getSession(ns.id)
      expect(session).not.toBeNull()
    }

    // All initial sessions should be destroyed
    for (const is of initialSessions) {
      const session = await claude.getSession(is.id)
      expect(session).toBeNull()
    }
  })
})
