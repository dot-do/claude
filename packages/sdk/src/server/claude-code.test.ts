/**
 * @dotdo/claude ClaudeCode Durable Object Tests
 *
 * TDD tests for ClaudeCode using CloudflareRuntime type
 * (with backward compatibility for Sandbox type alias)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CloudflareRuntime, Sandbox, CloudflareNamespace, SandboxNamespace } from '../types/sandbox.js'
import type { ClaudeCodeEnv, ClaudeSession } from '../types/options.js'

// ============================================================================
// Mock CloudflareRuntime Factory
// ============================================================================

/**
 * Create a mock CloudflareRuntime for testing
 */
function createMockCloudflareRuntime(): CloudflareRuntime {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      id: 'mock-process-id',
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

/**
 * Create a mock CloudflareNamespace for testing
 */
function createMockCloudflareNamespace(runtime: CloudflareRuntime): CloudflareNamespace {
  return {
    get: vi.fn().mockReturnValue(runtime),
  }
}

/**
 * Create mock DurableObjectState for testing
 */
function createMockState(): DurableObjectState {
  const mockStorage = new Map<string, unknown>()
  return {
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
}

/**
 * Create mock ClaudeCodeEnv for testing
 */
function createMockEnv(namespace: CloudflareNamespace): ClaudeCodeEnv {
  return {
    Sandbox: namespace,
    ANTHROPIC_API_KEY: 'test-api-key',
  } as ClaudeCodeEnv
}

// ============================================================================
// CloudflareRuntime Type Tests
// ============================================================================

describe('ClaudeCode with CloudflareRuntime', () => {
  let mockRuntime: CloudflareRuntime
  let mockNamespace: CloudflareNamespace
  let mockState: DurableObjectState
  let mockEnv: ClaudeCodeEnv

  beforeEach(() => {
    mockRuntime = createMockCloudflareRuntime()
    mockNamespace = createMockCloudflareNamespace(mockRuntime)
    mockState = createMockState()
    mockEnv = createMockEnv(mockNamespace)
  })

  it('should construct with CloudflareRuntime from namespace', async () => {
    const { ClaudeCode } = await import('./claude-code.js')

    // ClaudeCode should work when env.Sandbox contains a CloudflareNamespace
    const claude = new ClaudeCode(mockState, mockEnv)

    expect(claude).toBeInstanceOf(ClaudeCode)
  })

  it('should use CloudflareRuntime interface methods correctly', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create a session (triggers runtime usage)
    const session = await claude.createSession({ cwd: '/workspace' })

    expect(session.id).toBeDefined()
    expect(session.status).toBe('active')

    // Verify the namespace.get was called to obtain runtime
    expect(mockNamespace.get).toHaveBeenCalledWith('test-do-id')

    // Verify runtime.setEnvVars was called
    expect(mockRuntime.setEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({
        ANTHROPIC_API_KEY: 'test-api-key',
      })
    )
  })

  it('should use CloudflareRuntime.exec for command execution', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session first
    await claude.createSession({ cwd: '/workspace' })

    // The runtime should be accessible and its methods should be callable
    expect(mockRuntime.exec).toBeDefined()
    expect(typeof mockRuntime.exec).toBe('function')
  })

  it('should use CloudflareRuntime.startProcess for spawning processes', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session
    const session = await claude.createSession({ cwd: '/workspace' })

    // Send a message to trigger process spawning
    await claude.sendMessage(session.id, 'test message')

    // startProcess should have been called via ProcessManager
    expect(mockRuntime.startProcess).toHaveBeenCalled()
  })

  it('should use CloudflareRuntime.streamProcessLogs for output streaming', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session
    const session = await claude.createSession({ cwd: '/workspace' })

    // Send a message
    await claude.sendMessage(session.id, 'test message')

    // Wait for stream to be set up
    await new Promise((resolve) => setTimeout(resolve, 50))

    // streamProcessLogs should have been called
    expect(mockRuntime.streamProcessLogs).toHaveBeenCalled()
  })
})

// ============================================================================
// Backward Compatibility Tests (Sandbox type alias)
// ============================================================================

describe('ClaudeCode backward compatibility with Sandbox type', () => {
  it('should work with code using Sandbox type alias', async () => {
    // Test that Sandbox type alias is compatible with CloudflareRuntime
    const mockSandbox: Sandbox = createMockCloudflareRuntime()
    const mockNamespace: SandboxNamespace = createMockCloudflareNamespace(mockSandbox)
    const mockState = createMockState()
    const mockEnv = createMockEnv(mockNamespace)

    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Should work identically to CloudflareRuntime usage
    const session = await claude.createSession({ cwd: '/workspace' })
    expect(session.status).toBe('active')
  })

  it('should accept Sandbox type where CloudflareRuntime is expected', () => {
    // Compile-time test: Sandbox should be assignable to CloudflareRuntime
    const sandbox: Sandbox = createMockCloudflareRuntime()
    const runtime: CloudflareRuntime = sandbox

    // Both should have same methods
    expect(typeof runtime.exec).toBe('function')
    expect(typeof runtime.startProcess).toBe('function')
    expect(typeof runtime.writeFile).toBe('function')
    expect(typeof runtime.readFile).toBe('function')
  })

  it('should accept SandboxNamespace where CloudflareNamespace is expected', () => {
    // Compile-time test: SandboxNamespace should be assignable to CloudflareNamespace
    const mockRuntime = createMockCloudflareRuntime()
    const sandboxNamespace: SandboxNamespace = createMockCloudflareNamespace(mockRuntime)
    const cloudflareNamespace: CloudflareNamespace = sandboxNamespace

    // Both should have get method
    expect(typeof cloudflareNamespace.get).toBe('function')
  })
})

// ============================================================================
// getSandbox Helper Function Tests
// ============================================================================

describe('getSandbox helper function', () => {
  it('should return runtime from namespace', async () => {
    const { getSandbox } = await import('./claude-code.js')
    const mockRuntime = createMockCloudflareRuntime()
    const mockNamespace = createMockCloudflareNamespace(mockRuntime)

    const result = getSandbox(mockNamespace, 'test-id')

    expect(mockNamespace.get).toHaveBeenCalledWith('test-id')
    expect(result).toBe(mockRuntime)
  })

  it('should work with both type names (backward compat)', async () => {
    const { getSandbox } = await import('./claude-code.js')

    // Using CloudflareNamespace
    const cloudflareRuntime: CloudflareRuntime = createMockCloudflareRuntime()
    const cloudflareNamespace: CloudflareNamespace = createMockCloudflareNamespace(cloudflareRuntime)
    const result1 = getSandbox(cloudflareNamespace, 'id1')
    expect(result1).toBe(cloudflareRuntime)

    // Using Sandbox/SandboxNamespace aliases
    const sandbox: Sandbox = createMockCloudflareRuntime()
    const sandboxNamespace: SandboxNamespace = createMockCloudflareNamespace(sandbox)
    const result2 = getSandbox(sandboxNamespace, 'id2')
    expect(result2).toBe(sandbox)
  })
})

// ============================================================================
// Type Export Tests
// ============================================================================

describe('type exports', () => {
  it('should export CloudflareRuntime and Sandbox from types/sandbox.js', async () => {
    const types = await import('../types/sandbox.js')

    // Types are compile-time only, but we can verify the module loads
    expect(types).toBeDefined()
  })

  it('should export getSandbox from claude-code.js', async () => {
    const { getSandbox } = await import('./claude-code.js')

    expect(getSandbox).toBeDefined()
    expect(typeof getSandbox).toBe('function')
  })
})

// ============================================================================
// Runtime Interface Compliance Tests
// ============================================================================

describe('Runtime interface compliance', () => {
  it('should call runtime.setEnvVars with merged environment', async () => {
    const mockRuntime = createMockCloudflareRuntime()
    const mockNamespace = createMockCloudflareNamespace(mockRuntime)
    const mockState = createMockState()
    const mockEnv = createMockEnv(mockNamespace)

    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session with custom env vars
    await claude.createSession({
      cwd: '/workspace',
      env: {
        CUSTOM_VAR: 'custom_value',
      },
    })

    // Should merge API key with custom vars
    expect(mockRuntime.setEnvVars).toHaveBeenCalledWith({
      ANTHROPIC_API_KEY: 'test-api-key',
      CUSTOM_VAR: 'custom_value',
    })
  })

  it('should use custom apiKey if provided in options', async () => {
    const mockRuntime = createMockCloudflareRuntime()
    const mockNamespace = createMockCloudflareNamespace(mockRuntime)
    const mockState = createMockState()
    const mockEnv = createMockEnv(mockNamespace)

    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Create session with custom API key
    await claude.createSession({
      cwd: '/workspace',
      apiKey: 'custom-api-key',
    })

    // Should use custom API key
    expect(mockRuntime.setEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({
        ANTHROPIC_API_KEY: 'custom-api-key',
      })
    )
  })

  it('should handle runtime without optional methods gracefully', async () => {
    // Create runtime without optional streamProcessLogs
    const minimalRuntime: CloudflareRuntime = {
      exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
      startProcess: vi.fn().mockResolvedValue({
        id: 'process-id',
        waitForPort: vi.fn().mockResolvedValue(undefined),
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      // No setEnvVars
      // No streamProcessLogs
    }

    const mockNamespace = createMockCloudflareNamespace(minimalRuntime)
    const mockState = createMockState()
    const mockEnv = createMockEnv(mockNamespace)

    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    // Should create session without error (setEnvVars is optional)
    const session = await claude.createSession({ cwd: '/workspace' })
    expect(session.status).toBe('active')
  })
})
