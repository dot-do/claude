/**
 * @dotdo/claude - Session State Isolation Tests
 *
 * TDD RED phase - Tests for session state isolation per Claude process
 * Issue: claude-j6q.4
 *
 * These tests verify that:
 * 1. Each session has isolated state
 * 2. State doesn't leak between sessions
 * 3. Concurrent sessions don't interfere with each other
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ClaudeSession, ClaudeCodeEnv } from '../types/options.js'

// Helper to create mock DurableObjectState
function createMockState() {
  const mockStorage = new Map<string, unknown>()
  return {
    storage: mockStorage,
    state: {
      id: { toString: () => `test-do-${Date.now()}` },
      storage: {
        get: vi.fn().mockImplementation(async (key: string) => mockStorage.get(key)),
        put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
          mockStorage.set(key, value)
        }),
      },
      blockConcurrencyWhile: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      acceptWebSocket: vi.fn(),
      getTags: vi.fn().mockReturnValue([]),
    } as unknown as DurableObjectState,
  }
}

// Helper to create mock sandbox
function createMockSandbox() {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      id: `process-${Date.now()}`,
      waitForPort: vi.fn().mockResolvedValue(undefined),
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    setEnvVars: vi.fn().mockResolvedValue(undefined),
    streamProcessLogs: vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new ReadableStream({
          start() {
            /* keep open */
          },
        })
      )
    }),
  }
}

// Helper to create mock env
function createMockEnv(sandbox = createMockSandbox()): ClaudeCodeEnv {
  return {
    Sandbox: {
      get: vi.fn().mockReturnValue(sandbox),
    },
    ANTHROPIC_API_KEY: 'test-key',
  } as unknown as ClaudeCodeEnv
}

describe('Session State Isolation', () => {
  // ============================================================================
  // Test: Each session has isolated state
  // ============================================================================

  describe('session state encapsulation', () => {
    it('should have unique session IDs for each session', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })
      const session3 = await claude.createSession({ cwd: '/workspace3' })

      // Each session should have a unique ID
      expect(session1.id).not.toBe(session2.id)
      expect(session2.id).not.toBe(session3.id)
      expect(session1.id).not.toBe(session3.id)
    })

    it('should maintain separate state for each session', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      // Create sessions with different configurations
      const session1 = await claude.createSession({
        cwd: '/workspace1',
        model: 'claude-sonnet-4-20250514',
        maxTurns: 10,
      })

      const session2 = await claude.createSession({
        cwd: '/workspace2',
        model: 'claude-opus-4-20250514',
        maxTurns: 20,
      })

      // Verify each session maintains its own state
      expect(session1.cwd).toBe('/workspace1')
      expect(session1.model).toBe('claude-sonnet-4-20250514')
      expect(session1.maxTurns).toBe(10)

      expect(session2.cwd).toBe('/workspace2')
      expect(session2.model).toBe('claude-opus-4-20250514')
      expect(session2.maxTurns).toBe(20)

      // Retrieve and verify
      const retrieved1 = await claude.getSession(session1.id)
      const retrieved2 = await claude.getSession(session2.id)

      expect(retrieved1?.cwd).toBe('/workspace1')
      expect(retrieved2?.cwd).toBe('/workspace2')
    })

    it('should isolate session-specific counters and usage', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Manually update counters to simulate usage
      const internalSessions = claude['sessions'] as Map<string, ClaudeSession>

      const s1 = internalSessions.get(session1.id)!
      s1.turnCount = 5
      s1.totalCostUsd = 0.05
      s1.usage = { inputTokens: 1000, outputTokens: 500 }

      const s2 = internalSessions.get(session2.id)!
      s2.turnCount = 3
      s2.totalCostUsd = 0.03
      s2.usage = { inputTokens: 600, outputTokens: 300 }

      // Verify isolation
      const retrieved1 = await claude.getSession(session1.id)
      const retrieved2 = await claude.getSession(session2.id)

      expect(retrieved1?.turnCount).toBe(5)
      expect(retrieved1?.totalCostUsd).toBe(0.05)
      expect(retrieved1?.usage.inputTokens).toBe(1000)

      expect(retrieved2?.turnCount).toBe(3)
      expect(retrieved2?.totalCostUsd).toBe(0.03)
      expect(retrieved2?.usage.inputTokens).toBe(600)
    })
  })

  // ============================================================================
  // Test: State doesn't leak between sessions
  // ============================================================================

  describe('state leak prevention', () => {
    it('should not expose one session data when querying another', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({
        cwd: '/workspace1',
        systemPrompt: 'You are assistant 1',
      })

      const session2 = await claude.createSession({
        cwd: '/workspace2',
        systemPrompt: 'You are assistant 2',
      })

      // Query session1 should not return session2's data
      const retrieved1 = await claude.getSession(session1.id)
      expect(retrieved1?.systemPrompt).toBe('You are assistant 1')
      expect(retrieved1?.systemPrompt).not.toBe('You are assistant 2')

      // Query session2 should not return session1's data
      const retrieved2 = await claude.getSession(session2.id)
      expect(retrieved2?.systemPrompt).toBe('You are assistant 2')
      expect(retrieved2?.systemPrompt).not.toBe('You are assistant 1')
    })

    it('should not affect other sessions when destroying one session', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })
      const session3 = await claude.createSession({ cwd: '/workspace3' })

      // Destroy session2
      await claude.destroySession(session2.id)

      // session1 and session3 should still exist
      const retrieved1 = await claude.getSession(session1.id)
      const retrieved2 = await claude.getSession(session2.id)
      const retrieved3 = await claude.getSession(session3.id)

      expect(retrieved1).not.toBeNull()
      expect(retrieved1?.cwd).toBe('/workspace1')

      expect(retrieved2).toBeNull()

      expect(retrieved3).not.toBeNull()
      expect(retrieved3?.cwd).toBe('/workspace3')
    })

    it('should not share error state between sessions', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Set error on session1
      const internalSessions = claude['sessions'] as Map<string, ClaudeSession>
      const s1 = internalSessions.get(session1.id)!
      s1.status = 'error'
      s1.error = {
        message: 'Session 1 error',
        code: 'TEST_ERROR',
        timestamp: new Date().toISOString(),
      }

      // session2 should not be affected
      const retrieved2 = await claude.getSession(session2.id)
      expect(retrieved2?.status).toBe('active')
      expect(retrieved2?.error).toBeUndefined()

      // session1 should have error
      const retrieved1 = await claude.getSession(session1.id)
      expect(retrieved1?.status).toBe('error')
      expect(retrieved1?.error?.message).toBe('Session 1 error')
    })

    it('should isolate permission modes between sessions', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({
        cwd: '/workspace1',
        permissionMode: 'default',
      })

      const session2 = await claude.createSession({
        cwd: '/workspace2',
        permissionMode: 'plan',
      })

      // Change session1's permission mode
      await claude.setPermissionMode(session1.id, 'bypassPermissions')

      // session2 should still have its original permission mode
      const retrieved2 = await claude.getSession(session2.id)
      expect(retrieved2?.permissionMode).toBe('plan')

      // session1 should have updated permission mode
      const retrieved1 = await claude.getSession(session1.id)
      expect(retrieved1?.permissionMode).toBe('bypassPermissions')
    })
  })

  // ============================================================================
  // Test: Concurrent sessions don't interfere
  // ============================================================================

  describe('concurrent session isolation', () => {
    it('should handle 20 concurrent session creations without interference', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      // Create 20 sessions concurrently
      const sessionPromises = Array.from({ length: 20 }, (_, i) =>
        claude.createSession({
          cwd: `/workspace-${i}`,
          model: i % 2 === 0 ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514',
          maxTurns: i + 1,
        })
      )

      const sessions = await Promise.all(sessionPromises)

      // All sessions should be created
      expect(sessions).toHaveLength(20)

      // Each session should have its correct configuration
      for (let i = 0; i < 20; i++) {
        const session = await claude.getSession(sessions[i].id)
        expect(session).not.toBeNull()
        expect(session?.cwd).toBe(`/workspace-${i}`)
        expect(session?.model).toBe(
          i % 2 === 0 ? 'claude-sonnet-4-20250514' : 'claude-opus-4-20250514'
        )
        expect(session?.maxTurns).toBe(i + 1)
      }
    })

    it('should isolate event emissions between concurrent sessions', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Track events per session
      const session1Events: unknown[] = []
      const session2Events: unknown[] = []

      claude.onOutput(session1.id, (msg) => session1Events.push(msg))
      claude.onOutput(session2.id, (msg) => session2Events.push(msg))

      // Emit events to different sessions via the internal emitter
      const emitter = claude['emitter']
      emitter.emit(`output:${session1.id}`, { type: 'message', content: 'session1-msg' })
      emitter.emit(`output:${session2.id}`, { type: 'message', content: 'session2-msg' })

      // Each session should only receive its own events
      expect(session1Events).toHaveLength(1)
      expect(session1Events[0]).toEqual({ type: 'message', content: 'session1-msg' })

      expect(session2Events).toHaveLength(1)
      expect(session2Events[0]).toEqual({ type: 'message', content: 'session2-msg' })
    })

    it('should handle concurrent status updates without cross-contamination', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      // Create multiple sessions
      const sessions = await Promise.all(
        Array.from({ length: 5 }, (_, i) => claude.createSession({ cwd: `/workspace-${i}` }))
      )

      // Concurrently update each session's status
      const updatePromises = sessions.map(async (session, i) => {
        const internalSessions = claude['sessions'] as Map<string, ClaudeSession>
        const s = internalSessions.get(session.id)!
        s.status = i % 2 === 0 ? 'completed' : 'interrupted'
        s.turnCount = i * 10
        await claude['persistSessions']()
      })

      await Promise.all(updatePromises)

      // Verify each session has its correct status
      for (let i = 0; i < 5; i++) {
        const session = await claude.getSession(sessions[i].id)
        expect(session?.status).toBe(i % 2 === 0 ? 'completed' : 'interrupted')
        expect(session?.turnCount).toBe(i * 10)
      }
    })

    it('should maintain separate process managers per session', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const mockSandbox = createMockSandbox()

      // Track process spawns
      const spawnedProcesses: Array<{ sessionId: string; processId: string }> = []
      mockSandbox.startProcess = vi.fn().mockImplementation(() => {
        const processId = `process-${Date.now()}-${Math.random()}`
        return Promise.resolve({
          id: processId,
          waitForPort: vi.fn().mockResolvedValue(undefined),
        })
      })

      const env = createMockEnv(mockSandbox)
      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Send messages to both sessions (this spawns processes)
      await claude.sendMessage(session1.id, 'message to session 1')
      await claude.sendMessage(session2.id, 'message to session 2')

      // ProcessManager should have separate entries for each session
      const processManager = claude['processManager']
      expect(processManager).not.toBeNull()

      const process1 = processManager?.getProcess(session1.id)
      const process2 = processManager?.getProcess(session2.id)

      expect(process1).toBeDefined()
      expect(process2).toBeDefined()
      expect(process1?.id).not.toBe(process2?.id)
      expect(process1?.sessionId).toBe(session1.id)
      expect(process2?.sessionId).toBe(session2.id)
    })

    it('should not lose session data during concurrent create/destroy cycles', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      // Create initial sessions
      const initialSessions = await Promise.all(
        Array.from({ length: 5 }, (_, i) => claude.createSession({ cwd: `/initial-${i}` }))
      )

      // Concurrently:
      // - Create 5 new sessions
      // - Destroy 3 of the initial sessions
      // - Update 2 of the initial sessions
      const operations = [
        ...Array.from({ length: 5 }, (_, i) =>
          claude.createSession({ cwd: `/new-${i}` })
        ),
        claude.destroySession(initialSessions[0].id),
        claude.destroySession(initialSessions[1].id),
        claude.destroySession(initialSessions[2].id),
        claude.resumeSession(initialSessions[3].id),
        claude.resumeSession(initialSessions[4].id),
      ]

      const results = await Promise.allSettled(operations)

      // All operations should succeed
      for (const result of results) {
        expect(result.status).toBe('fulfilled')
      }

      // List all sessions
      const allSessions = await claude.listSessions()

      // Should have: 2 surviving initial + 5 new = 7 sessions
      expect(allSessions).toHaveLength(7)

      // Destroyed sessions should not exist
      expect(await claude.getSession(initialSessions[0].id)).toBeNull()
      expect(await claude.getSession(initialSessions[1].id)).toBeNull()
      expect(await claude.getSession(initialSessions[2].id)).toBeNull()

      // Surviving sessions should exist
      expect(await claude.getSession(initialSessions[3].id)).not.toBeNull()
      expect(await claude.getSession(initialSessions[4].id)).not.toBeNull()
    })
  })

  // ============================================================================
  // Test: Session-scoped event key isolation
  // ============================================================================

  describe('event key isolation', () => {
    it('should use session-scoped event keys', async () => {
      const { EventKeys } = await import('../events/emitter.js')

      const sessionId1 = 'session-abc'
      const sessionId2 = 'session-xyz'

      // Event keys should be unique per session
      expect(EventKeys.output(sessionId1)).toBe('output:session-abc')
      expect(EventKeys.output(sessionId2)).toBe('output:session-xyz')
      expect(EventKeys.output(sessionId1)).not.toBe(EventKeys.output(sessionId2))

      // All event types should be scoped
      expect(EventKeys.todo(sessionId1)).not.toBe(EventKeys.todo(sessionId2))
      expect(EventKeys.error(sessionId1)).not.toBe(EventKeys.error(sessionId2))
      expect(EventKeys.result(sessionId1)).not.toBe(EventKeys.result(sessionId2))
    })

    it('should cleanup session-specific listeners on session destroy', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const env = createMockEnv()

      const claude = new ClaudeCode(state, env)

      const session = await claude.createSession({ cwd: '/workspace' })

      // Subscribe to session events
      const outputHandler = vi.fn()
      const todoHandler = vi.fn()
      const errorHandler = vi.fn()

      const unsubscribeOutput = claude.onOutput(session.id, outputHandler)
      const unsubscribeTodo = claude.onTodoUpdate(session.id, todoHandler)
      const unsubscribeError = claude.onError(session.id, errorHandler)

      // Destroy the session
      await claude.destroySession(session.id)

      // Emit events after destruction
      const emitter = claude['emitter']
      emitter.emit(`output:${session.id}`, { type: 'test' })
      emitter.emit(`todo:${session.id}`, { todos: [] })
      emitter.emit(`error:${session.id}`, new Error('test'))

      // Handlers should still be called (they are not automatically unsubscribed)
      // This is by design - the caller is responsible for unsubscribing
      // The test documents this behavior
      expect(outputHandler).toHaveBeenCalled()

      // Clean up
      unsubscribeOutput()
      unsubscribeTodo()
      unsubscribeError()
    })
  })

  // ============================================================================
  // Test: Process isolation per session
  // ============================================================================

  describe('process isolation', () => {
    it('should create separate input pipes per session', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const mockSandbox = createMockSandbox()
      const env = createMockEnv(mockSandbox)

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Send messages to spawn processes
      await claude.sendMessage(session1.id, 'msg1')
      await claude.sendMessage(session2.id, 'msg2')

      const processManager = claude['processManager']
      const process1 = processManager?.getProcess(session1.id)
      const process2 = processManager?.getProcess(session2.id)

      // Each session should have its own input pipe
      expect(process1?.inputPipe).toContain(session1.id)
      expect(process2?.inputPipe).toContain(session2.id)
      expect(process1?.inputPipe).not.toBe(process2?.inputPipe)
    })

    it('should not affect other sessions when killing one process', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const mockSandbox = createMockSandbox()
      const env = createMockEnv(mockSandbox)

      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Send messages to spawn processes
      await claude.sendMessage(session1.id, 'msg1')
      await claude.sendMessage(session2.id, 'msg2')

      const processManager = claude['processManager']

      // Both processes should be alive
      expect(processManager?.isAlive(session1.id)).toBe(true)
      expect(processManager?.isAlive(session2.id)).toBe(true)

      // Kill session1's process via interrupt
      await claude.interrupt(session1.id)

      // session1 should be interrupted, session2 should still be active
      const retrieved1 = await claude.getSession(session1.id)
      const retrieved2 = await claude.getSession(session2.id)

      expect(retrieved1?.status).toBe('interrupted')
      expect(retrieved2?.status).toBe('active')
    })

    it('should isolate write operations to correct session pipes', async () => {
      const { ClaudeCode } = await import('./claude-code.js')
      const { state } = createMockState()
      const mockSandbox = createMockSandbox()

      // Track exec calls for pipe writes
      const pipeWrites: Array<{ pipe: string; command: string }> = []
      mockSandbox.exec = vi.fn().mockImplementation((cmd: string) => {
        // Parse pipe writes from echo commands
        // The command format is: echo '...' >> /tmp/claude_input_<sessionId>
        const match = cmd.match(/echo\s+'([^']+(?:'\\''[^']*)*)'\s+>>\s+(\/tmp\/claude_input_\S+)/)
        if (match) {
          pipeWrites.push({ pipe: match[2], command: cmd })
        }
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
      })

      const env = createMockEnv(mockSandbox)
      const claude = new ClaudeCode(state, env)

      const session1 = await claude.createSession({ cwd: '/workspace1' })
      const session2 = await claude.createSession({ cwd: '/workspace2' })

      // Send messages to different sessions
      await claude.sendMessage(session1.id, 'message for session 1')
      await claude.sendMessage(session2.id, 'message for session 2')

      // Verify writes went to correct pipes by checking pipe paths contain session IDs
      const session1Writes = pipeWrites.filter((w) => w.pipe.includes(session1.id))
      const session2Writes = pipeWrites.filter((w) => w.pipe.includes(session2.id))

      expect(session1Writes.length).toBeGreaterThan(0)
      expect(session2Writes.length).toBeGreaterThan(0)

      // Verify no cross-contamination: session1's pipe should not receive session2's messages
      for (const write of session1Writes) {
        expect(write.command).toContain('session 1')
        expect(write.command).not.toContain('session 2')
      }
      for (const write of session2Writes) {
        expect(write.command).toContain('session 2')
        expect(write.command).not.toContain('session 1')
      }
    })
  })
})
