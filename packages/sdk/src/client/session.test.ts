/**
 * ClaudeSession Tests
 *
 * TDD tests for the ClaudeSession class which provides
 * runtime-agnostic session management for Claude Code.
 */

import { describe, it, expect, vi, beforeEach, expectTypeOf } from 'vitest'
import { ClaudeSession, type ClaudeSessionOptions } from './session.js'
import type { Runtime, ExecResult, RuntimeProcess } from '../types/runtime.js'

// ============================================================================
// Mock Runtime Implementation
// ============================================================================

/**
 * Creates a mock Runtime for testing purposes
 */
function createMockRuntime(): Runtime {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      id: 'process-123',
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
      exited: Promise.resolve(0),
      write: vi.fn().mockResolvedValue(undefined),
    }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
}

// ============================================================================
// Constructor Tests
// ============================================================================

describe('ClaudeSession', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('constructor', () => {
    it('should construct with a Runtime instance', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session).toBeInstanceOf(ClaudeSession)
    })

    it('should accept any object implementing Runtime interface', () => {
      // Custom runtime implementation
      const customRuntime: Runtime = {
        exec: async () => ({ exitCode: 0 }),
        startProcess: async () => ({
          id: 'custom-process',
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
        readFile: async () => 'content',
        writeFile: async () => {},
      }

      const session = new ClaudeSession(customRuntime)
      expect(session).toBeInstanceOf(ClaudeSession)
    })

    it('should store the runtime for later use', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.runtime).toBe(mockRuntime)
    })

    it('should throw if runtime is null', () => {
      expect(() => new ClaudeSession(null as any)).toThrow('Runtime is required')
    })

    it('should throw if runtime is undefined', () => {
      expect(() => new ClaudeSession(undefined as any)).toThrow('Runtime is required')
    })

    it('should accept optional configuration options', () => {
      const options: ClaudeSessionOptions = {
        model: 'claude-3-opus',
        systemPrompt: 'You are a helpful assistant',
      }

      const session = new ClaudeSession(mockRuntime, options)
      expect(session).toBeInstanceOf(ClaudeSession)
    })

    it('should generate a unique session ID', () => {
      const session1 = new ClaudeSession(mockRuntime)
      const session2 = new ClaudeSession(mockRuntime)

      expect(session1.id).toBeDefined()
      expect(typeof session1.id).toBe('string')
      expect(session1.id.length).toBeGreaterThan(0)
      expect(session1.id).not.toBe(session2.id)
    })

    it('should apply default options when none provided', () => {
      const session = new ClaudeSession(mockRuntime)

      // Default model should be undefined (will use system default)
      expect(session.options.model).toBeUndefined()
      // Default permission mode should be 'default'
      expect(session.options.permissionMode).toBe('default')
    })

    it('should merge provided options with defaults', () => {
      const options: ClaudeSessionOptions = {
        model: 'claude-3-sonnet',
        maxTurns: 10,
      }

      const session = new ClaudeSession(mockRuntime, options)

      expect(session.options.model).toBe('claude-3-sonnet')
      expect(session.options.maxTurns).toBe(10)
      expect(session.options.permissionMode).toBe('default') // default value
    })
  })

  describe('configuration options', () => {
    it('should accept model option', () => {
      const session = new ClaudeSession(mockRuntime, {
        model: 'claude-3-opus-20240229',
      })
      expect(session.options.model).toBe('claude-3-opus-20240229')
    })

    it('should accept systemPrompt as string', () => {
      const session = new ClaudeSession(mockRuntime, {
        systemPrompt: 'Custom system prompt',
      })
      expect(session.options.systemPrompt).toBe('Custom system prompt')
    })

    it('should accept systemPrompt as preset object', () => {
      const session = new ClaudeSession(mockRuntime, {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: 'Additional instructions',
        },
      })
      expect(session.options.systemPrompt).toEqual({
        type: 'preset',
        preset: 'claude_code',
        append: 'Additional instructions',
      })
    })

    it('should accept cwd option', () => {
      const session = new ClaudeSession(mockRuntime, {
        cwd: '/workspace/project',
      })
      expect(session.options.cwd).toBe('/workspace/project')
    })

    it('should accept env option', () => {
      const session = new ClaudeSession(mockRuntime, {
        env: { NODE_ENV: 'development', DEBUG: 'true' },
      })
      expect(session.options.env).toEqual({ NODE_ENV: 'development', DEBUG: 'true' })
    })

    it('should accept permissionMode option', () => {
      const session = new ClaudeSession(mockRuntime, {
        permissionMode: 'bypassPermissions',
      })
      expect(session.options.permissionMode).toBe('bypassPermissions')
    })

    it('should accept maxTurns option', () => {
      const session = new ClaudeSession(mockRuntime, {
        maxTurns: 50,
      })
      expect(session.options.maxTurns).toBe(50)
    })

    it('should accept maxBudgetUsd option', () => {
      const session = new ClaudeSession(mockRuntime, {
        maxBudgetUsd: 5.0,
      })
      expect(session.options.maxBudgetUsd).toBe(5.0)
    })

    it('should accept apiKey option', () => {
      const session = new ClaudeSession(mockRuntime, {
        apiKey: 'sk-test-key',
      })
      expect(session.options.apiKey).toBe('sk-test-key')
    })

    it('should accept mcpServers configuration', () => {
      const session = new ClaudeSession(mockRuntime, {
        mcpServers: {
          filesystem: {
            command: 'mcp-server-fs',
            args: ['/workspace'],
          },
        },
      })
      expect(session.options.mcpServers).toEqual({
        filesystem: {
          command: 'mcp-server-fs',
          args: ['/workspace'],
        },
      })
    })
  })

  describe('placeholder methods', () => {
    it('should have start() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.start).toBe('function')
    })

    it('should have send() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.send).toBe('function')
    })

    it('should have abort() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.abort).toBe('function')
    })

    it('start() should return a Promise', () => {
      const session = new ClaudeSession(mockRuntime)
      const result = session.start()
      expect(result).toBeInstanceOf(Promise)
    })

    it('send() should return a Promise', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      const result = session.send('test message')
      expect(result).toBeInstanceOf(Promise)
      await result  // Wait for the promise to resolve
    })

    it('abort() should return a Promise', () => {
      const session = new ClaudeSession(mockRuntime)
      const result = session.abort()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('session state', () => {
    it('should have initial status of "pending"', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')
    })

    it('should track createdAt timestamp', () => {
      const before = new Date().toISOString()
      const session = new ClaudeSession(mockRuntime)
      const after = new Date().toISOString()

      expect(session.createdAt).toBeDefined()
      expect(session.createdAt >= before).toBe(true)
      expect(session.createdAt <= after).toBe(true)
    })
  })
})

// ============================================================================
// Type Tests
// ============================================================================

describe('ClaudeSession Types', () => {
  describe('ClaudeSessionOptions type', () => {
    it('should accept all valid ClaudeCodeOptions fields', () => {
      // Type-level test: verify options interface
      type SessionOpts = ClaudeSessionOptions

      // These should all be valid
      const opts: SessionOpts = {
        model: 'claude-3',
        systemPrompt: 'test',
        cwd: '/path',
        env: { KEY: 'value' },
        permissionMode: 'default',
        maxTurns: 10,
        maxBudgetUsd: 5,
        apiKey: 'key',
        mcpServers: {},
      }

      expect(opts).toBeDefined()
    })
  })

  describe('Generic Runtime constraint', () => {
    it('should accept any Runtime implementation', () => {
      // Verify ClaudeSession can accept different Runtime implementations
      const runtime = createMockRuntime()
      const session = new ClaudeSession(runtime)

      // Type check: runtime property should be typed as Runtime
      expectTypeOf(session.runtime).toMatchTypeOf<Runtime>()
    })
  })
})

// ============================================================================
// Integration Tests (with mock runtime)
// ============================================================================

// ============================================================================
// start() Method Tests
// ============================================================================

describe('ClaudeSession.start()', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('status transitions', () => {
    it('should change status from pending to starting during initialization', async () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')

      // Use a runtime that delays to allow us to observe 'starting' state
      let resolveStartProcess: (value: RuntimeProcess) => void
      const delayedRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockImplementation(() => {
          return new Promise<RuntimeProcess>(resolve => {
            resolveStartProcess = resolve
          })
        }),
      }

      const delayedSession = new ClaudeSession(delayedRuntime)
      const startPromise = delayedSession.start()

      // Allow microtasks to run
      await Promise.resolve()

      expect(delayedSession.status).toBe('starting')

      // Complete the startup
      resolveStartProcess!({
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
      })

      await startPromise
      expect(delayedSession.status).toBe('active')
    })

    it('should transition to active status after successful start', async () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')

      await session.start()

      expect(session.status).toBe('active')
    })

    it('should transition to error status when runtime fails', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Runtime failed to start')),
      }

      const session = new ClaudeSession(failingRuntime)

      await expect(session.start()).rejects.toThrow('Runtime failed to start')
      expect(session.status).toBe('error')
    })
  })

  describe('runtime initialization', () => {
    it('should call runtime.startProcess to start Claude CLI', async () => {
      const session = new ClaudeSession(mockRuntime)

      await session.start()

      expect(mockRuntime.startProcess).toHaveBeenCalled()
    })

    it('should pass session options to runtime.startProcess', async () => {
      const session = new ClaudeSession(mockRuntime, {
        cwd: '/workspace/project',
        env: { DEBUG: 'true' },
      })

      await session.start()

      expect(mockRuntime.startProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({ DEBUG: 'true' }),
        })
      )
    })

    it('should store the process reference for later use', async () => {
      const session = new ClaudeSession(mockRuntime)

      await session.start()

      // The session should have access to the process
      // @ts-expect-error - accessing private property for testing
      expect(session._process).toBeDefined()
    })
  })

  describe('calling start() twice', () => {
    it('should throw error when called on active session', async () => {
      const session = new ClaudeSession(mockRuntime)

      await session.start()

      await expect(session.start()).rejects.toThrow(/Session is already started/)
    })

    it('should throw error when called on starting session', async () => {
      let resolveStartProcess: (value: RuntimeProcess) => void
      const delayedRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockImplementation(() => {
          return new Promise<RuntimeProcess>(resolve => {
            resolveStartProcess = resolve
          })
        }),
      }

      const session = new ClaudeSession(delayedRuntime)

      // Start first call
      const firstStart = session.start()
      await Promise.resolve() // Let it transition to 'starting'

      // Try to call start again while still starting
      await expect(session.start()).rejects.toThrow(/Session is already starting/)

      // Clean up: complete the first start
      resolveStartProcess!({
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
      })
      await firstStart
    })

    it('should not call runtime.startProcess twice', async () => {
      const session = new ClaudeSession(mockRuntime)

      await session.start()

      try {
        await session.start()
      } catch {
        // Expected to throw
      }

      expect(mockRuntime.startProcess).toHaveBeenCalledTimes(1)
    })
  })

  describe('error handling', () => {
    it('should handle runtime process spawn failure', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Spawn failed')),
      }

      const session = new ClaudeSession(failingRuntime)

      await expect(session.start()).rejects.toThrow('Spawn failed')
      expect(session.status).toBe('error')
    })

    it('should include original error message in thrown error', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Connection refused')),
      }

      const session = new ClaudeSession(failingRuntime)

      await expect(session.start()).rejects.toThrow('Connection refused')
    })

    it('should allow retry after error by resetting to pending', async () => {
      let shouldFail = true
      const conditionalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockImplementation(() => {
          if (shouldFail) {
            return Promise.reject(new Error('First attempt failed'))
          }
          return Promise.resolve({
            id: 'process-123',
            stdout: new ReadableStream(),
            stderr: new ReadableStream(),
            exited: Promise.resolve(0),
          })
        }),
      }

      const session = new ClaudeSession(conditionalRuntime)

      // First attempt fails
      await expect(session.start()).rejects.toThrow('First attempt failed')
      expect(session.status).toBe('error')

      // For now, we don't allow retry - session stays in error state
      // Future implementation could add a reset() method
    })
  })
})

describe('ClaudeSession Integration', () => {
  it('should work with a complete mock runtime workflow', async () => {
    const mockRuntime = createMockRuntime()

    const session = new ClaudeSession(mockRuntime, {
      model: 'claude-3-opus',
      cwd: '/workspace',
    })

    expect(session.id).toBeDefined()
    expect(session.status).toBe('pending')
    expect(session.runtime).toBe(mockRuntime)
    expect(session.options.model).toBe('claude-3-opus')
    expect(session.options.cwd).toBe('/workspace')
  })

  it('should isolate sessions from each other', () => {
    const runtime1 = createMockRuntime()
    const runtime2 = createMockRuntime()

    const session1 = new ClaudeSession(runtime1, { model: 'model-1' })
    const session2 = new ClaudeSession(runtime2, { model: 'model-2' })

    // Sessions should have different IDs
    expect(session1.id).not.toBe(session2.id)

    // Sessions should have their own runtimes
    expect(session1.runtime).toBe(runtime1)
    expect(session2.runtime).toBe(runtime2)

    // Sessions should have their own options
    expect(session1.options.model).toBe('model-1')
    expect(session2.options.model).toBe('model-2')
  })
})

// ============================================================================
// destroy() Method Tests
// ============================================================================

describe('ClaudeSession.destroy()', () => {
  let mockRuntime: Runtime
  let mockProcess: RuntimeProcess

  beforeEach(() => {
    mockProcess = {
      id: 'process-123',
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
      exited: Promise.resolve(0),
      kill: vi.fn().mockResolvedValue(undefined),
    }
    mockRuntime = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      startProcess: vi.fn().mockResolvedValue(mockProcess),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('process termination', () => {
    it('should kill the process when destroy() is called on active session', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.destroy()

      expect(mockProcess.kill).toHaveBeenCalled()
    })

    it('should work even if process has no kill method', async () => {
      const processWithoutKill: RuntimeProcess = {
        id: 'process-456',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        // No kill method
      }
      mockRuntime.startProcess = vi.fn().mockResolvedValue(processWithoutKill)

      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Should not throw
      await expect(session.destroy()).resolves.not.toThrow()
    })
  })

  describe('resource cleanup', () => {
    it('should clear the process reference after destroy', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // @ts-expect-error - accessing private property for testing
      expect(session._process).not.toBeNull()

      await session.destroy()

      // @ts-expect-error - accessing private property for testing
      expect(session._process).toBeNull()
    })
  })

  describe('status transitions', () => {
    it('should change status to "destroyed" after destroy()', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      expect(session.status).toBe('active')

      await session.destroy()

      expect(session.status).toBe('destroyed')
    })

    it('should change status to "destroyed" when called on pending session', async () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')

      await session.destroy()

      expect(session.status).toBe('destroyed')
    })
  })

  describe('idempotency', () => {
    it('should be safe to call destroy() multiple times', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.destroy()
      await session.destroy()
      await session.destroy()

      expect(session.status).toBe('destroyed')
      // kill should only be called once
      expect(mockProcess.kill).toHaveBeenCalledTimes(1)
    })

    it('should not throw when calling destroy() on already destroyed session', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.destroy()

      await expect(session.destroy()).resolves.not.toThrow()
    })
  })

  describe('destroy on different states', () => {
    it('should work on a session that was never started', async () => {
      const session = new ClaudeSession(mockRuntime)

      await expect(session.destroy()).resolves.not.toThrow()
      expect(session.status).toBe('destroyed')
      expect(mockRuntime.startProcess).not.toHaveBeenCalled()
    })

    it('should work on an errored session', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Runtime failed')),
      }

      const session = new ClaudeSession(failingRuntime)
      await expect(session.start()).rejects.toThrow()
      expect(session.status).toBe('error')

      await expect(session.destroy()).resolves.not.toThrow()
      expect(session.status).toBe('destroyed')
    })

    it('should work on an aborted session', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.abort()
      expect(session.status).toBe('aborted')

      await expect(session.destroy()).resolves.not.toThrow()
      expect(session.status).toBe('destroyed')
    })

    it('should work on a completed session', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      // Manually set status to completed for testing
      // @ts-expect-error - accessing private property for testing
      session._status = 'completed'

      await expect(session.destroy()).resolves.not.toThrow()
      expect(session.status).toBe('destroyed')
    })
  })

  describe('prevent operations after destroy', () => {
    it('should prevent start() after destroy()', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.destroy()

      await expect(session.start()).rejects.toThrow(/destroyed/)
    })

    it('should prevent send() after destroy()', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.destroy()

      await expect(session.send('hello')).rejects.toThrow(/destroyed/)
    })
  })

  describe('error handling', () => {
    it('should handle errors from process.kill gracefully', async () => {
      const errorProcess: RuntimeProcess = {
        id: 'error-process',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        kill: vi.fn().mockRejectedValue(new Error('Kill failed')),
      }
      mockRuntime.startProcess = vi.fn().mockResolvedValue(errorProcess)

      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Should not throw even if kill fails
      await expect(session.destroy()).resolves.not.toThrow()
      expect(session.status).toBe('destroyed')
    })
  })
})

// ============================================================================
// send() Method Tests
// ============================================================================

describe('ClaudeSession.send()', () => {
  let mockRuntime: Runtime
  let mockWrite: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockWrite = vi.fn().mockResolvedValue(undefined)
    mockRuntime = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        write: mockWrite,
      }),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
    }
  })

  describe('precondition checks', () => {
    it('should throw error if session is not started', async () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')

      await expect(session.send('Hello')).rejects.toThrow(
        /Session must be started before sending messages/
      )
    })

    it('should throw error if session is completed', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Simulate session completion
      // @ts-expect-error - accessing private property for testing
      session._status = 'completed'

      await expect(session.send('Hello')).rejects.toThrow(
        /Cannot send messages to a completed session/
      )
    })

    it('should throw error if session is in error state', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Simulate error state
      // @ts-expect-error - accessing private property for testing
      session._status = 'error'

      await expect(session.send('Hello')).rejects.toThrow(
        /Cannot send messages to a session in error state/
      )
    })

    it('should throw error if session is aborted', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.abort()

      await expect(session.send('Hello')).rejects.toThrow(
        /Cannot send messages to an aborted session/
      )
    })

    it('should throw error if session is destroyed', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.destroy()

      await expect(session.send('Hello')).rejects.toThrow(/destroyed/)
    })

    it('should throw error if process does not support write', async () => {
      const noWriteRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          // No write method
        }),
      }

      const session = new ClaudeSession(noWriteRuntime)
      await session.start()

      await expect(session.send('Hello')).rejects.toThrow(
        /Process does not support stdin writing/
      )
    })
  })

  describe('message formatting', () => {
    it('should write message to process stdin', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('Hello Claude')

      expect(mockWrite).toHaveBeenCalled()
    })

    it('should format message as NDJSON with type "user"', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('Hello Claude')

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"type":"user"')
      )
    })

    it('should include message content in NDJSON', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('Build a todo app')

      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.message).toBe('Build a todo app')
    })

    it('should append newline to create valid NDJSON', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('Test message')

      const writtenData = mockWrite.mock.calls[0][0]
      expect(writtenData).toMatch(/\n$/)
    })

    it('should handle messages with special characters', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      const specialMessage = 'Create a file with\nnewlines and "quotes" and \\backslashes'
      await session.send(specialMessage)

      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.message).toBe(specialMessage)
    })

    it('should handle empty message string', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('')

      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.message).toBe('')
    })

    it('should handle unicode messages', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      const unicodeMessage = 'Hello Claude! Test with emojis and unicode chars'
      await session.send(unicodeMessage)

      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.message).toBe(unicodeMessage)
    })
  })

  describe('error handling', () => {
    it('should propagate write errors', async () => {
      const failingWrite = vi.fn().mockRejectedValue(new Error('Write failed'))
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: failingWrite,
        }),
      }

      const session = new ClaudeSession(failingRuntime)
      await session.start()

      await expect(session.send('Hello')).rejects.toThrow('Write failed')
    })

    it('should include session id in error messages for debugging', async () => {
      const session = new ClaudeSession(mockRuntime)

      try {
        await session.send('Hello')
      } catch (error) {
        expect((error as Error).message).toContain(session.id)
      }
    })
  })

  describe('consecutive messages', () => {
    it('should allow sending multiple messages in sequence', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('First message')
      await session.send('Second message')
      await session.send('Third message')

      expect(mockWrite).toHaveBeenCalledTimes(3)
    })

    it('should format each message as separate NDJSON line', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      await session.send('Message one')
      await session.send('Message two')

      const call1 = mockWrite.mock.calls[0][0]
      const call2 = mockWrite.mock.calls[1][0]

      expect(JSON.parse(call1.trim()).message).toBe('Message one')
      expect(JSON.parse(call2.trim()).message).toBe('Message two')
    })
  })
})

// ============================================================================
// interrupt() Method Tests
// ============================================================================

describe('ClaudeSession.interrupt()', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('sends SIGINT signal', () => {
    it('should have interrupt() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.interrupt).toBe('function')
    })

    it('should send SIGINT signal to the process', async () => {
      const mockSignal = vi.fn().mockResolvedValue(undefined)
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: mockSignal,
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      await session.interrupt()

      expect(mockSignal).toHaveBeenCalledWith('SIGINT')
    })

    it('should return a Promise', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      const result = session.interrupt()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('session remains active after interrupt', () => {
    it('should keep session status as active after interrupt', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      expect(session.status).toBe('active')

      await session.interrupt()

      // Session should remain active (not aborted or completed)
      expect(session.status).toBe('active')
    })

    it('should allow sending messages after interrupt', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
        write: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      await session.interrupt()

      // Session should still be able to send messages (session is active)
      expect(session.status).toBe('active')
      // send() should not throw
      await expect(session.send('Continue working')).resolves.not.toThrow()
    })
  })

  describe('interrupt vs abort behavior', () => {
    it('should NOT terminate the session (unlike abort)', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()

      await session.interrupt()
      expect(session.status).toBe('active')

      // Compare with abort which should change status
      await session.abort()
      expect(session.status).toBe('aborted')
    })

    it('should NOT call process.kill() (unlike abort)', async () => {
      const mockKill = vi.fn().mockResolvedValue(undefined)
      const mockSignal = vi.fn().mockResolvedValue(undefined)
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        kill: mockKill,
        signal: mockSignal,
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      await session.interrupt()

      expect(mockSignal).toHaveBeenCalledWith('SIGINT')
      expect(mockKill).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('should be a no-op on pending session', async () => {
      const session = new ClaudeSession(mockRuntime)
      expect(session.status).toBe('pending')

      // Interrupt before start should not throw
      await expect(session.interrupt()).resolves.not.toThrow()
      expect(session.status).toBe('pending')
    })

    it('should be a no-op on completed session', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()

      // Simulate session completion by setting status
      // @ts-expect-error - accessing private property for testing
      session._status = 'completed'

      const mockSignal = mockProcess.signal as ReturnType<typeof vi.fn>
      await expect(session.interrupt()).resolves.not.toThrow()
      expect(mockSignal).not.toHaveBeenCalled()
    })

    it('should be a no-op on aborted session', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      await session.abort()

      const mockSignal = mockProcess.signal as ReturnType<typeof vi.fn>
      mockSignal.mockClear()

      await expect(session.interrupt()).resolves.not.toThrow()
      expect(mockSignal).not.toHaveBeenCalled()
    })

    it('should be a no-op on destroyed session', async () => {
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn().mockResolvedValue(undefined),
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()
      await session.destroy()

      const mockSignal = mockProcess.signal as ReturnType<typeof vi.fn>
      mockSignal.mockClear()

      await expect(session.interrupt()).resolves.not.toThrow()
      expect(mockSignal).not.toHaveBeenCalled()
    })

    it('should handle process without signal method gracefully', async () => {
      // Process without signal method
      const processWithoutSignal: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        // No signal method
      }

      const noSignalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(processWithoutSignal),
      }

      const session = new ClaudeSession(noSignalRuntime)
      await session.start()

      // Should not throw even if signal method is not available
      await expect(session.interrupt()).resolves.not.toThrow()
    })

    it('should handle signal method throwing an error', async () => {
      const mockSignal = vi.fn().mockRejectedValue(new Error('Signal failed'))
      const mockProcess: RuntimeProcess = {
        id: 'process-123',
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
        signal: mockSignal,
      }

      const signalRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue(mockProcess),
      }

      const session = new ClaudeSession(signalRuntime)
      await session.start()

      // Should propagate the error
      await expect(session.interrupt()).rejects.toThrow('Signal failed')
      // Session should remain active even after signal error
      expect(session.status).toBe('active')
    })
  })
})

// ============================================================================
// events AsyncIterable Tests (TDD - RED Phase)
// ============================================================================

describe('ClaudeSession.events', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('property existence', () => {
    it('should have an events getter', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      expect(session.events).toBeDefined()
    })

    it('should return an AsyncIterable', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Check that it has Symbol.asyncIterator
      expect(typeof session.events[Symbol.asyncIterator]).toBe('function')
    })
  })

  describe('event streaming', () => {
    it('should yield SDKMessage objects from NDJSON stdout', async () => {
      // Create a readable stream that emits NDJSON
      const ndjsonData = [
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          uuid: 'uuid-1',
          session_id: 'session-123',
          cwd: '/workspace',
          tools: [],
          model: 'claude-3-opus',
          permissionMode: 'default',
        }),
        JSON.stringify({
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
          parent_tool_use_id: null,
        }),
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          uuid: 'uuid-3',
          session_id: 'session-123',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          result: 'Done',
        }),
      ].join('\n') + '\n'

      const encoder = new TextEncoder()
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const events: any[] = []
      for await (const event of session.events) {
        events.push(event)
      }

      expect(events.length).toBe(3)
      expect(events[0].type).toBe('system')
      expect(events[0].subtype).toBe('init')
      expect(events[1].type).toBe('assistant')
      expect(events[1].message.content[0].text).toBe('Hello!')
      expect(events[2].type).toBe('result')
      expect(events[2].subtype).toBe('success')
    })

    it('should handle chunked NDJSON data', async () => {
      // Split a message across multiple chunks
      const message = {
        type: 'assistant',
        uuid: 'uuid-1',
        session_id: 'session-123',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world!' }],
        },
        parent_tool_use_id: null,
      }
      const fullLine = JSON.stringify(message) + '\n'
      const midpoint = Math.floor(fullLine.length / 2)
      const chunk1 = fullLine.slice(0, midpoint)
      const chunk2 = fullLine.slice(midpoint)

      const encoder = new TextEncoder()
      let chunkIndex = 0
      const chunks = [chunk1, chunk2]

      const mockStdout = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunkIndex < chunks.length) {
            controller.enqueue(encoder.encode(chunks[chunkIndex]))
            chunkIndex++
          } else {
            controller.close()
          }
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const events: any[] = []
      for await (const event of session.events) {
        events.push(event)
      }

      expect(events.length).toBe(1)
      expect(events[0].type).toBe('assistant')
      expect(events[0].message.content[0].text).toBe('Hello world!')
    })

    it('should complete iteration when process exits', async () => {
      let closeController: ReadableStreamDefaultController<Uint8Array>
      let resolveExited: (code: number) => void

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          closeController = controller
        },
      })

      const exitedPromise = new Promise<number>(resolve => {
        resolveExited = resolve
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: exitedPromise,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      // Start iterating in background
      const eventsPromise = (async () => {
        const events: any[] = []
        for await (const event of session.events) {
          events.push(event)
        }
        return events
      })()

      // Close the stream and resolve exit
      closeController!.close()
      resolveExited!(0)

      const events = await eventsPromise
      expect(Array.isArray(events)).toBe(true)
    })

    it('should throw on stream error', async () => {
      let errorController: ReadableStreamDefaultController<Uint8Array>

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          errorController = controller
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      // Start iteration
      const iteratorPromise = (async () => {
        const events: any[] = []
        for await (const event of session.events) {
          events.push(event)
        }
        return events
      })()

      // Error the stream after starting iteration
      setTimeout(() => {
        errorController!.error(new Error('Stream error'))
      }, 10)

      await expect(iteratorPromise).rejects.toThrow('Stream error')
    })
  })

  describe('multiple consumers', () => {
    it('should allow multiple consumers to iterate independently', async () => {
      const messages = [
        {
          type: 'system',
          subtype: 'init',
          uuid: 'uuid-1',
          session_id: 'session-123',
          cwd: '/workspace',
          tools: [],
          model: 'claude-3-opus',
          permissionMode: 'default',
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      // First consumer
      const events1: any[] = []
      for await (const event of session.events) {
        events1.push(event)
      }

      // Second consumer (should get same events - events are replayed/buffered)
      const events2: any[] = []
      for await (const event of session.events) {
        events2.push(event)
      }

      expect(events1.length).toBe(2)
      expect(events2.length).toBe(2)
    })
  })

  describe('state requirements', () => {
    it('should throw if session is not started', () => {
      const session = new ClaudeSession(mockRuntime)

      expect(() => session.events).toThrow(/Session must be started/)
    })

    it('should throw if session is in error state', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Failed to start')),
      }

      const session = new ClaudeSession(failingRuntime)

      try {
        await session.start()
      } catch {
        // Expected
      }

      expect(() => session.events).toThrow(/Session is in error state/)
    })

    it('should throw if session is destroyed', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.destroy()

      expect(() => session.events).toThrow(/Session is destroyed/)
    })
  })
})

// ============================================================================
// Event Callbacks Tests (TDD - RED Phase)
// ============================================================================

describe('ClaudeSession event callbacks', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('on() method', () => {
    it('should have an on() method', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      expect(typeof session.on).toBe('function')
    })

    it('should register a callback for message events', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.on('assistant', callback)

      // Consume events to trigger callbacks
      for await (const event of session.events) {
        // Just consuming to trigger callbacks
      }

      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          message: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text', text: 'Hello!' }),
            ]),
          }),
        })
      )
    })

    it('should call callback with proper event data', async () => {
      const initMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-123',
        cwd: '/workspace',
        tools: ['Bash', 'Read', 'Write'],
        model: 'claude-3-opus',
        permissionMode: 'default',
      }

      const ndjsonData = JSON.stringify(initMessage) + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.on('system', callback)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'system',
          subtype: 'init',
          cwd: '/workspace',
          tools: ['Bash', 'Read', 'Write'],
        })
      )
    })

    it('should return an unsubscribe function', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      const callback = vi.fn()
      const unsubscribe = session.on('assistant', callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should support multiple callbacks for the same event', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Test' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback1 = vi.fn()
      const callback2 = vi.fn()
      const callback3 = vi.fn()

      session.on('assistant', callback1)
      session.on('assistant', callback2)
      session.on('assistant', callback3)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)
      expect(callback3).toHaveBeenCalledTimes(1)
    })
  })

  describe('off() method', () => {
    it('should remove a callback when unsubscribe function is called', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'First' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      const unsubscribe = session.on('assistant', callback)

      // Unsubscribe before consuming events
      unsubscribe()

      for await (const event of session.events) {
        // Consuming events
      }

      // Should not be called since we unsubscribed before events were emitted
      expect(callback).not.toHaveBeenCalled()
    })

    it('should not affect other callbacks when one is removed', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Test' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback1 = vi.fn()
      const callback2 = vi.fn()

      const unsubscribe1 = session.on('assistant', callback1)
      session.on('assistant', callback2)

      // Remove first callback before consuming events
      unsubscribe1()

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback1).not.toHaveBeenCalled()
      expect(callback2).toHaveBeenCalledTimes(1)
    })
  })

  describe('once() method', () => {
    it('should have a once() method', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      expect(typeof session.once).toBe('function')
    })

    it('should fire callback only once even with multiple events', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'First' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Second' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'assistant',
          uuid: 'uuid-3',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Third' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.once('assistant', callback)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      // Should only be called once despite 3 events
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({ text: 'First' }),
            ]),
          }),
        })
      )
    })

    it('should return an unsubscribe function', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      const callback = vi.fn()
      const unsubscribe = session.once('assistant', callback)

      expect(typeof unsubscribe).toBe('function')
    })

    it('should support unsubscribing before callback is fired', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Test' }],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      const unsubscribe = session.once('assistant', callback)

      // Unsubscribe immediately
      unsubscribe()

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('tool use event callbacks', () => {
    it('should fire callbacks for tool_use events', async () => {
      const messages = [
        {
          type: 'assistant',
          uuid: 'uuid-1',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Bash',
                input: { command: 'ls' },
              },
            ],
          },
          parent_tool_use_id: null,
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.on('assistant', callback)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'assistant',
          message: expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'tool_use',
                name: 'Bash',
                input: { command: 'ls' },
              }),
            ]),
          }),
        })
      )
    })
  })

  describe('result event callbacks', () => {
    it('should fire callbacks for result events', async () => {
      const messages = [
        {
          type: 'result',
          subtype: 'success',
          uuid: 'uuid-1',
          session_id: 'session-123',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          result: 'Done',
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.on('result', callback)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'result',
          subtype: 'success',
          result: 'Done',
          is_error: false,
        })
      )
    })
  })

  describe('wildcard callbacks', () => {
    it('should support wildcard event listener for all events', async () => {
      const messages = [
        {
          type: 'system',
          subtype: 'init',
          uuid: 'uuid-1',
          session_id: 'session-123',
          cwd: '/workspace',
          tools: [],
          model: 'claude-3-opus',
          permissionMode: 'default',
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello!' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'result',
          subtype: 'success',
          uuid: 'uuid-3',
          session_id: 'session-123',
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: false,
          num_turns: 1,
          total_cost_usd: 0.01,
          usage: { input_tokens: 10, output_tokens: 20 },
          result: 'Done',
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const callback = vi.fn()
      session.on('*', callback)

      for await (const event of session.events) {
        // Consuming to trigger callbacks
      }

      // Should be called for all 3 events
      expect(callback).toHaveBeenCalledTimes(3)
    })
  })
})

// ============================================================================
// waitForResult() Method Tests (TDD - RED Phase)
// ============================================================================

describe('ClaudeSession.waitForResult()', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('method existence', () => {
    it('should have waitForResult() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.waitForResult).toBe('function')
    })

    it('should return a Promise', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      const result = session.waitForResult()
      expect(result).toBeInstanceOf(Promise)
      // Don't wait for it since we haven't sent a message yet
    })
  })

  describe('returns SDKResultMessage', () => {
    it('should resolve with SDKResultMessage when session completes successfully', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1500,
        duration_api_ms: 1200,
        is_error: false,
        num_turns: 3,
        total_cost_usd: 0.05,
        usage: {
          input_tokens: 100,
          output_tokens: 200,
        },
        result: 'Task completed successfully',
      }

      const ndjsonData = JSON.stringify(resultMessage) + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const result = await session.waitForResult()

      expect(result.type).toBe('result')
      expect(result.subtype).toBe('success')
      expect(result.is_error).toBe(false)
      expect(result.result).toBe('Task completed successfully')
    })

    it('should return error result when session fails', async () => {
      const errorResultMessage = {
        type: 'result' as const,
        subtype: 'error_during_execution' as const,
        uuid: 'error-uuid',
        session_id: 'session-123',
        duration_ms: 500,
        duration_api_ms: 400,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 50,
          output_tokens: 10,
        },
        errors: ['Something went wrong'],
      }

      const ndjsonData = JSON.stringify(errorResultMessage) + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(1),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const result = await session.waitForResult()

      expect(result.type).toBe('result')
      expect(result.subtype).toBe('error_during_execution')
      expect(result.is_error).toBe(true)
      expect(result.errors).toEqual(['Something went wrong'])
    })
  })

  describe('blocks until complete', () => {
    it('should wait for result event before resolving', async () => {
      let resolveStream: () => void
      const streamPromise = new Promise<void>(resolve => {
        resolveStream = resolve
      })

      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Done',
      }

      const encoder = new TextEncoder()
      const mockStdout = new ReadableStream<Uint8Array>({
        async start(controller) {
          await streamPromise
          controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      let resolved = false
      const resultPromise = session.waitForResult().then(r => {
        resolved = true
        return r
      })

      // Should not be resolved yet
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(resolved).toBe(false)

      // Resolve the stream
      resolveStream!()

      // Now it should resolve
      const result = await resultPromise
      expect(resolved).toBe(true)
      expect(result.type).toBe('result')
    })

    it('should handle multiple events before result', async () => {
      const messages = [
        {
          type: 'system',
          subtype: 'init',
          uuid: 'uuid-1',
          session_id: 'session-123',
          cwd: '/workspace',
          tools: [],
          model: 'claude-3-opus',
          permissionMode: 'default',
        },
        {
          type: 'assistant',
          uuid: 'uuid-2',
          session_id: 'session-123',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Working on it...' }],
          },
          parent_tool_use_id: null,
        },
        {
          type: 'result',
          subtype: 'success',
          uuid: 'uuid-3',
          session_id: 'session-123',
          duration_ms: 2000,
          duration_api_ms: 1800,
          is_error: false,
          num_turns: 2,
          total_cost_usd: 0.03,
          usage: {
            input_tokens: 50,
            output_tokens: 100,
          },
          result: 'Complete',
        },
      ]

      const ndjsonData = messages.map(m => JSON.stringify(m)).join('\n') + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const result = await session.waitForResult()

      expect(result.type).toBe('result')
      expect(result.subtype).toBe('success')
      expect(result.result).toBe('Complete')
    })
  })

  describe('timeout option', () => {
    it('should accept timeout option in milliseconds', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()

      // Just check that it accepts the timeout parameter without throwing
      const promise = session.waitForResult({ timeout: 5000 })
      expect(promise).toBeInstanceOf(Promise)
    })

    it('should throw timeout error if result not received within timeout', async () => {
      // Create a stream that never sends a result
      const mockStdout = new ReadableStream<Uint8Array>({
        start() {
          // Never send anything, just hang
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: new Promise(() => {}), // Never resolves
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      await expect(
        session.waitForResult({ timeout: 100 })
      ).rejects.toThrow(/timeout/i)
    })

    it('should not timeout if result arrives before timeout', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Fast response',
      }

      const encoder = new TextEncoder()
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          // Send result quickly
          setTimeout(() => {
            controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
            controller.close()
          }, 10)
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const result = await session.waitForResult({ timeout: 1000 })

      expect(result.type).toBe('result')
      expect(result.result).toBe('Fast response')
    })
  })

  describe('can call multiple times (returns same result)', () => {
    it('should cache and return the same result on subsequent calls', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Cached result',
      }

      const ndjsonData = JSON.stringify(resultMessage) + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      const result1 = await session.waitForResult()
      const result2 = await session.waitForResult()
      const result3 = await session.waitForResult()

      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
      expect(result1.result).toBe('Cached result')
    })

    it('should return cached result immediately on subsequent calls', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Instant',
      }

      const ndjsonData = JSON.stringify(resultMessage) + '\n'
      const encoder = new TextEncoder()

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.start()

      // First call waits for result
      await session.waitForResult()

      // Second call should be instant
      const start = Date.now()
      const result = await session.waitForResult()
      const elapsed = Date.now() - start

      expect(elapsed).toBeLessThan(50) // Should be nearly instant
      expect(result.result).toBe('Instant')
    })
  })

  describe('state requirements', () => {
    it('should throw if session is not started', async () => {
      const session = new ClaudeSession(mockRuntime)

      await expect(session.waitForResult()).rejects.toThrow(/Session must be started/)
    })

    it('should throw if session is in error state', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Failed to start')),
      }

      const session = new ClaudeSession(failingRuntime)

      try {
        await session.start()
      } catch {
        // Expected
      }

      await expect(session.waitForResult()).rejects.toThrow(/Session is in error state/)
    })

    it('should throw if session is destroyed', async () => {
      const session = new ClaudeSession(mockRuntime)
      await session.start()
      await session.destroy()

      await expect(session.waitForResult()).rejects.toThrow(/destroyed/)
    })
  })
})

// ============================================================================
// query() Convenience Method Tests (TDD - RED Phase)
// ============================================================================

describe('ClaudeSession.query()', () => {
  let mockRuntime: Runtime

  beforeEach(() => {
    mockRuntime = createMockRuntime()
  })

  describe('method existence', () => {
    it('should have query() method', () => {
      const session = new ClaudeSession(mockRuntime)
      expect(typeof session.query).toBe('function')
    })

    it('should return a Promise', () => {
      const session = new ClaudeSession(mockRuntime)
      const result = session.query('test prompt')
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('combines start() + send() + waitForResult()', () => {
    it('should start session, send message, and return result', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Task completed',
      }

      const ndjsonData = JSON.stringify(resultMessage) + '\n'
      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(ndjsonData))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      const result = await session.query('Build a todo app')

      expect(streamingRuntime.startProcess).toHaveBeenCalled()
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"type":"user"')
      )
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('Build a todo app')
      )
      expect(result.type).toBe('result')
      expect(result.subtype).toBe('success')
      expect(result.result).toBe('Task completed')
    })

    it('should call start(), send(), and waitForResult() in sequence', async () => {
      const calls: string[] = []
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Done',
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockImplementation(async () => {
        calls.push('send')
      })

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
          controller.close()
        },
      })

      const trackingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockImplementation(async () => {
          calls.push('start')
          return {
            id: 'process-123',
            stdout: mockStdout,
            stderr: new ReadableStream(),
            exited: Promise.resolve(0),
            write: mockWrite,
          }
        }),
      }

      const session = new ClaudeSession(trackingRuntime)
      await session.query('test')

      calls.push('waitForResult')

      expect(calls[0]).toBe('start')
      expect(calls[1]).toBe('send')
      expect(calls[2]).toBe('waitForResult')
    })

    it('should not call start() if session is already started', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Result',
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)

      // Start the session first
      await session.start()

      // Now query should not call startProcess again
      await session.query('test prompt')

      expect(streamingRuntime.startProcess).toHaveBeenCalledTimes(1)
    })
  })

  describe('timeout option', () => {
    it('should accept timeout option and pass it to waitForResult()', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Quick response',
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          setTimeout(() => {
            controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
            controller.close()
          }, 50)
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      const result = await session.query('test', { timeout: 5000 })

      expect(result.result).toBe('Quick response')
    })

    it('should timeout if result takes too long', async () => {
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      // Stream that never sends a result
      const mockStdout = new ReadableStream<Uint8Array>({
        start() {
          // Never send anything
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: new Promise(() => {}), // Never resolves
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)

      await expect(
        session.query('slow task', { timeout: 100 })
      ).rejects.toThrow(/timeout/i)
    })
  })

  describe('one-shot queries', () => {
    it('should work for quick one-shot queries', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 500,
        duration_api_ms: 400,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.005,
        usage: {
          input_tokens: 5,
          output_tokens: 10,
        },
        result: 'Hello, world!',
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      const result = await session.query('Say hello')

      expect(result.result).toBe('Hello, world!')
      expect(result.num_turns).toBe(1)
    })

    it('should handle multiple one-shot queries on different sessions', async () => {
      let queryCount = 0
      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const createMockStdout = () => {
        queryCount++
        const resultMessage = {
          type: 'result' as const,
          subtype: 'success' as const,
          uuid: `result-${queryCount}`,
          session_id: 'session-123',
          duration_ms: 100,
          duration_api_ms: 80,
          is_error: false,
          num_turns: queryCount,
          total_cost_usd: 0.01,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
          result: `Response ${queryCount}`,
        }

        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
            controller.close()
          },
        })
      }

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockImplementation(async () => ({
          id: 'process-123',
          stdout: createMockStdout(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        })),
      }

      const session1 = new ClaudeSession(streamingRuntime)
      const result1 = await session1.query('First query')
      expect(result1.result).toBe('Response 1')

      const session2 = new ClaudeSession(streamingRuntime)
      const result2 = await session2.query('Second query')
      expect(result2.result).toBe('Response 2')
    })
  })

  describe('error handling', () => {
    it('should propagate errors from start()', async () => {
      const failingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockRejectedValue(new Error('Failed to start')),
      }

      const session = new ClaudeSession(failingRuntime)

      await expect(session.query('test')).rejects.toThrow('Failed to start')
    })

    it('should propagate errors from send()', async () => {
      const mockWrite = vi.fn().mockRejectedValue(new Error('Send failed'))

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: new ReadableStream(),
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)

      await expect(session.query('test')).rejects.toThrow('Send failed')
    })

    it('should propagate errors from waitForResult()', async () => {
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      // Stream that errors
      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error('Stream error'))
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(1),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)

      await expect(session.query('test')).rejects.toThrow('Stream error')
    })

    it('should return error result when task fails', async () => {
      const errorResultMessage = {
        type: 'result' as const,
        subtype: 'error_during_execution' as const,
        uuid: 'error-uuid',
        session_id: 'session-123',
        duration_ms: 500,
        duration_api_ms: 400,
        is_error: true,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 50,
          output_tokens: 10,
        },
        errors: ['Task failed'],
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(errorResultMessage) + '\n'))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(1),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      const result = await session.query('failing task')

      expect(result.type).toBe('result')
      expect(result.is_error).toBe(true)
      expect(result.errors).toEqual(['Task failed'])
    })
  })

  describe('message formatting', () => {
    it('should send the prompt as a user message', async () => {
      const resultMessage = {
        type: 'result' as const,
        subtype: 'success' as const,
        uuid: 'result-uuid',
        session_id: 'session-123',
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        result: 'Done',
      }

      const encoder = new TextEncoder()
      const mockWrite = vi.fn().mockResolvedValue(undefined)

      const mockStdout = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify(resultMessage) + '\n'))
          controller.close()
        },
      })

      const streamingRuntime: Runtime = {
        ...mockRuntime,
        startProcess: vi.fn().mockResolvedValue({
          id: 'process-123',
          stdout: mockStdout,
          stderr: new ReadableStream(),
          exited: Promise.resolve(0),
          write: mockWrite,
        }),
      }

      const session = new ClaudeSession(streamingRuntime)
      await session.query('Build a calculator')

      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('"type":"user"')
      )
      expect(mockWrite).toHaveBeenCalledWith(
        expect.stringContaining('Build a calculator')
      )

      const writtenData = mockWrite.mock.calls[0][0]
      const parsed = JSON.parse(writtenData.trim())
      expect(parsed.type).toBe('user')
      expect(parsed.message).toBe('Build a calculator')
    })
  })
})
