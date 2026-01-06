/**
 * Tests for BunRuntime
 *
 * TDD RED Phase: These tests define the expected behavior for BunRuntime.exec()
 * - exec(): Execute commands and return ExecResult
 * - Handle successful commands (exitCode: 0)
 * - Handle failed commands (non-zero exitCode)
 * - Capture stdout and stderr
 * - Respect timeout option
 * - Respect env option
 *
 * Note: These tests mock the Bun global to run in Node.js/Vitest.
 * For real integration testing, use Bun's test runner.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BunRuntime } from './bun.js'
import type { ExecResult, RuntimeProcess } from '../types/runtime.js'

// Mock Bun types for testing
interface MockBunProcess {
  stdout: ReadableStream<Uint8Array>
  stderr: ReadableStream<Uint8Array>
  exited: Promise<number>
  kill: () => void
}

interface MockBunSpawnOptions {
  env?: Record<string, string>
  stdout?: 'pipe' | 'inherit' | 'ignore'
  stderr?: 'pipe' | 'inherit' | 'ignore'
  signal?: AbortSignal
}

/**
 * Create a mock ReadableStream from a string
 */
function createMockStream(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
}

/**
 * Create a mock Bun process
 */
function createMockProcess(
  exitCode: number,
  stdout: string,
  stderr: string
): MockBunProcess {
  return {
    stdout: createMockStream(stdout),
    stderr: createMockStream(stderr),
    exited: Promise.resolve(exitCode),
    kill: vi.fn(),
  }
}

/**
 * Setup global Bun mock
 */
function setupBunMock(
  spawnImpl?: (cmd: string[], opts?: MockBunSpawnOptions) => MockBunProcess
) {
  const defaultSpawn = (_cmd: string[], _opts?: MockBunSpawnOptions) =>
    createMockProcess(0, '', '')

  const spawn = vi.fn(spawnImpl ?? defaultSpawn)

  // @ts-expect-error - Mocking global Bun
  globalThis.Bun = { spawn }

  return { spawn }
}

/**
 * Teardown global Bun mock
 */
function teardownBunMock() {
  // @ts-expect-error - Removing Bun mock
  delete globalThis.Bun
}

describe('BunRuntime', () => {
  let runtime: BunRuntime
  let bunMock: { spawn: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bunMock = setupBunMock()
    runtime = new BunRuntime()
  })

  afterEach(() => {
    teardownBunMock()
    vi.clearAllMocks()
  })

  describe('exec()', () => {
    it('should run a command and return ExecResult', async () => {
      bunMock.spawn.mockImplementation(() =>
        createMockProcess(0, 'hello\n', '')
      )

      const result = await runtime.exec('echo "hello"')

      expect(result).toBeDefined()
      expect(typeof result.exitCode).toBe('number')
      expect(result.stdout).toBeDefined()
      expect(result.stderr).toBeDefined()
    })

    it('should satisfy ExecResult interface', async () => {
      bunMock.spawn.mockImplementation(() =>
        createMockProcess(0, 'test\n', '')
      )

      const result: ExecResult = await runtime.exec('echo "test"')

      // Type check: ensure result conforms to ExecResult
      expect(result).toHaveProperty('exitCode')
      expect(typeof result.exitCode).toBe('number')
    })

    it('should spawn with shell and pass command', async () => {
      bunMock.spawn.mockImplementation(() =>
        createMockProcess(0, '', '')
      )

      await runtime.exec('ls -la')

      expect(bunMock.spawn).toHaveBeenCalledWith(
        ['sh', '-c', 'ls -la'],
        expect.objectContaining({
          stdout: 'pipe',
          stderr: 'pipe',
        })
      )
    })

    describe('successful commands', () => {
      it('should handle successful commands with exitCode 0', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'success\n', '')
        )

        const result = await runtime.exec('echo "success"')

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('success')
      })

      it('should handle commands with multiple words', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'hello world\n', '')
        )

        const result = await runtime.exec('echo "hello world"')

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('hello world')
      })

      it('should handle commands with shell pipes', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'abc\n', '')
        )

        const result = await runtime.exec('echo "abc" | cat')

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('abc')
      })
    })

    describe('failed commands', () => {
      it('should handle failed commands with non-zero exitCode', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(42, '', 'error')
        )

        const result = await runtime.exec('exit 42')

        expect(result.exitCode).toBe(42)
      })

      it('should handle exit code 1', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(1, '', 'error')
        )

        const result = await runtime.exec('exit 1')

        expect(result.exitCode).toBe(1)
      })

      it('should handle command not found gracefully', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(127, '', 'command not found')
        )

        const result = await runtime.exec('nonexistent_command_xyz123')

        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toBeDefined()
      })
    })

    describe('stdout capture', () => {
      it('should capture stdout correctly', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'stdout output\n', '')
        )

        const result = await runtime.exec('echo "stdout output"')

        expect(result.stdout).toBeDefined()
        expect(result.stdout).toContain('stdout output')
      })

      it('should capture multi-line stdout', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'line1\nline2\n', '')
        )

        const result = await runtime.exec('echo "line1" && echo "line2"')

        expect(result.stdout).toContain('line1')
        expect(result.stdout).toContain('line2')
      })

      it('should capture empty stdout on silent commands', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, '', '')
        )

        const result = await runtime.exec('true')

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBeDefined()
      })
    })

    describe('stderr capture', () => {
      it('should capture stderr correctly', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, '', 'stderr output\n')
        )

        const result = await runtime.exec('>&2 echo "stderr output"')

        expect(result.stderr).toBeDefined()
        expect(result.stderr).toContain('stderr output')
      })

      it('should capture both stdout and stderr separately', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'out\n', 'err\n')
        )

        const result = await runtime.exec('echo "out" && >&2 echo "err"')

        expect(result.stdout).toContain('out')
        expect(result.stderr).toContain('err')
      })

      it('should capture stderr from failed commands', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(1, '', 'No such file or directory')
        )

        const result = await runtime.exec('ls /nonexistent_path_xyz')

        expect(result.exitCode).not.toBe(0)
        expect(result.stderr).toBeDefined()
        expect(result.stderr!.length).toBeGreaterThan(0)
      })
    })

    describe('timeout option', () => {
      it('should pass signal to spawn for timeout support', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'fast\n', '')
        )

        await runtime.exec('echo "fast"', { timeout: 5000 })

        expect(bunMock.spawn).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            signal: expect.any(AbortSignal),
          })
        )
      })

      it('should complete within timeout for fast commands', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'fast\n', '')
        )

        const result = await runtime.exec('echo "fast"', { timeout: 5000 })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('fast')
      })

      it('should not affect commands that complete before timeout', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, 'quick\n', '')
        )

        const result = await runtime.exec('echo "quick"', { timeout: 10000 })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('quick')
      })

      it('should handle timeout by aborting process', async () => {
        // Simulate a process that would timeout by rejecting with AbortError
        bunMock.spawn.mockImplementation((_cmd, opts) => {
          const process = createMockProcess(0, '', '')

          // If signal is set, throw AbortError immediately to simulate timeout
          if (opts?.signal) {
            const abortError = new Error('The operation was aborted')
            abortError.name = 'AbortError'

            // Replace exited promise to throw abort error
            process.exited = Promise.reject(abortError)
          }

          return process
        })

        const result = await runtime.exec('sleep 10', { timeout: 100 })

        // Should return timeout exit code
        expect(result.exitCode).toBe(124)
      })
    })

    describe('env option', () => {
      it('should respect env option and pass environment variables', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, 'custom_value\n', '')
        })

        await runtime.exec('echo $TEST_VAR', {
          env: { TEST_VAR: 'custom_value' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.TEST_VAR).toBe('custom_value')
      })

      it('should merge custom env with process env', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, 'merged\n', '')
        })

        await runtime.exec('echo $TEST_VAR $HOME', {
          env: { TEST_VAR: 'merged' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.TEST_VAR).toBe('merged')
        // Should also include process.env variables
        expect(capturedEnv?.PATH).toBeDefined()
      })

      it('should allow overriding existing env variables', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, 'testuser\n', '')
        })

        await runtime.exec('echo $USER', {
          env: { USER: 'testuser' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.USER).toBe('testuser')
      })

      it('should handle multiple custom env variables', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, 'foo-bar\n', '')
        })

        await runtime.exec('echo $VAR1-$VAR2', {
          env: { VAR1: 'foo', VAR2: 'bar' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.VAR1).toBe('foo')
        expect(capturedEnv?.VAR2).toBe('bar')
      })

      it('should handle env variable with special characters', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, 'value with spaces\n', '')
        })

        await runtime.exec('echo "$SPECIAL"', {
          env: { SPECIAL: 'value with spaces' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.SPECIAL).toBe('value with spaces')
      })

      it('should use process.env when no env option provided', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          return createMockProcess(0, '', '')
        })

        await runtime.exec('ls')

        expect(capturedEnv).toBeDefined()
        // Should be process.env
        expect(capturedEnv?.PATH).toBe(process.env.PATH)
      })
    })

    describe('error handling', () => {
      it('should handle empty command', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, '', '')
        )

        const result = await runtime.exec('')

        // Empty command should either fail or succeed with empty output
        expect(typeof result.exitCode).toBe('number')
      })

      it('should handle whitespace-only command', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(0, '', '')
        )

        const result = await runtime.exec('   ')

        expect(typeof result.exitCode).toBe('number')
      })

      it('should handle syntax errors in command', async () => {
        bunMock.spawn.mockImplementation(() =>
          createMockProcess(2, '', 'syntax error')
        )

        const result = await runtime.exec('echo "unclosed')

        expect(result.exitCode).not.toBe(0)
      })

      it('should throw when Bun is not available', async () => {
        teardownBunMock() // Remove Bun mock

        await expect(runtime.exec('ls')).rejects.toThrow(
          'BunRuntime requires Bun environment'
        )
      })
    })
  })

  describe('startProcess()', () => {
    describe('returns RuntimeProcess', () => {
      it('should return a RuntimeProcess with id property', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('node server.js')

        expect(runtimeProcess).toBeDefined()
        expect(runtimeProcess.id).toBeDefined()
        expect(typeof runtimeProcess.id).toBe('string')
      })

      it('should return RuntimeProcess with stdout stream', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "output"')

        expect(runtimeProcess.stdout).toBeInstanceOf(ReadableStream)
      })

      it('should return RuntimeProcess with stderr stream', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', 'error\n')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "error" >&2')

        expect(runtimeProcess.stderr).toBeInstanceOf(ReadableStream)
      })

      it('should return RuntimeProcess with exited promise', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('true')

        expect(runtimeProcess.exited).toBeInstanceOf(Promise)
        const exitCode = await runtimeProcess.exited
        expect(typeof exitCode).toBe('number')
      })

      it('should satisfy RuntimeProcess interface', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'test\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess: RuntimeProcess = await runtime.startProcess('echo "test"')

        // Type check: ensure runtimeProcess conforms to RuntimeProcess
        expect(runtimeProcess).toHaveProperty('id')
        expect(runtimeProcess).toHaveProperty('stdout')
        expect(runtimeProcess).toHaveProperty('stderr')
        expect(runtimeProcess).toHaveProperty('exited')
      })
    })

    describe('stdout and stderr are ReadableStream<Uint8Array>', () => {
      it('should have stdout as ReadableStream<Uint8Array>', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'hello\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "hello"')

        expect(runtimeProcess.stdout).toBeInstanceOf(ReadableStream)

        // Read from the stream to verify it's Uint8Array
        const reader = runtimeProcess.stdout.getReader()
        const { value, done } = await reader.read()
        reader.releaseLock()

        if (!done && value) {
          expect(value).toBeInstanceOf(Uint8Array)
        }
      })

      it('should have stderr as ReadableStream<Uint8Array>', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', 'error\n')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "error" >&2')

        expect(runtimeProcess.stderr).toBeInstanceOf(ReadableStream)

        // Read from the stream to verify it's Uint8Array
        const reader = runtimeProcess.stderr.getReader()
        const { value, done } = await reader.read()
        reader.releaseLock()

        if (!done && value) {
          expect(value).toBeInstanceOf(Uint8Array)
        }
      })

      it('should allow reading stdout content', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'streaming output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "streaming output"')

        const text = await new Response(runtimeProcess.stdout).text()
        expect(text).toContain('streaming output')
      })
    })

    describe('exited is Promise<number>', () => {
      it('should resolve exited promise with exit code', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('true')

        const exitCode = await runtimeProcess.exited
        expect(exitCode).toBe(0)
      })

      it('should resolve with non-zero exit code for failed commands', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(1, '', 'error')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('exit 1')

        const exitCode = await runtimeProcess.exited
        expect(exitCode).toBe(1)
      })

      it('should resolve with specific exit codes', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(42, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('exit 42')

        const exitCode = await runtimeProcess.exited
        expect(exitCode).toBe(42)
      })
    })

    describe('env option', () => {
      it('should pass env variables to spawned process', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          const proc = createMockProcess(0, 'custom_value\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        await runtime.startProcess('echo $MY_VAR', {
          env: { MY_VAR: 'custom_value' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.MY_VAR).toBe('custom_value')
      })

      it('should merge custom env with process.env', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        await runtime.startProcess('echo $CUSTOM $HOME', {
          env: { CUSTOM: 'value' },
        })

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.CUSTOM).toBe('value')
        expect(capturedEnv?.PATH).toBeDefined() // process.env included
      })

      it('should use process.env when no env option provided', async () => {
        let capturedEnv: Record<string, string> | undefined

        bunMock.spawn.mockImplementation((_cmd, opts) => {
          capturedEnv = opts?.env
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        await runtime.startProcess('ls')

        expect(capturedEnv).toBeDefined()
        expect(capturedEnv?.PATH).toBe(process.env.PATH)
      })
    })

    describe('kill() method', () => {
      it('should have kill method', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        const runtimeProcess = await runtime.startProcess('sleep 10')

        expect(runtimeProcess.kill).toBeDefined()
        expect(typeof runtimeProcess.kill).toBe('function')
      })

      it('should call kill on underlying process', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.kill = mockKill
          return proc
        })

        const runtimeProcess = await runtime.startProcess('sleep 10')

        await runtimeProcess.kill?.()

        expect(mockKill).toHaveBeenCalled()
      })

      it('kill() should return Promise<void>', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.kill = vi.fn()
          return proc
        })

        const runtimeProcess = await runtime.startProcess('sleep 10')

        const result = runtimeProcess.kill?.()
        expect(result).toBeInstanceOf(Promise)
        await expect(result).resolves.toBeUndefined()
      })
    })

    describe('process spawning', () => {
      it('should spawn with shell', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          return proc
        })

        await runtime.startProcess('node server.js')

        expect(bunMock.spawn).toHaveBeenCalledWith(
          ['sh', '-c', 'node server.js'],
          expect.objectContaining({
            stdout: 'pipe',
            stderr: 'pipe',
          })
        )
      })

      it('should use pid as process id', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 99999
          return proc
        })

        const runtimeProcess = await runtime.startProcess('echo "test"')

        expect(runtimeProcess.id).toBe('99999')
      })
    })

    describe('error handling', () => {
      it('should throw when Bun is not available', async () => {
        teardownBunMock()

        await expect(runtime.startProcess('ls')).rejects.toThrow(
          'BunRuntime requires Bun environment'
        )
      })
    })
  })

  describe('process tracking', () => {
    describe('getActiveProcessCount()', () => {
      it('should return 0 when no processes are running', () => {
        expect(runtime.getActiveProcessCount()).toBe(0)
      })

      it('should track started processes', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          // Never resolve exited so process stays "active"
          proc.exited = new Promise(() => {})
          return proc
        })

        await runtime.startProcess('sleep 10')

        expect(runtime.getActiveProcessCount()).toBe(1)
      })

      it('should track multiple processes', async () => {
        let pidCounter = 1000
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = pidCounter++
          proc.exited = new Promise(() => {})
          return proc
        })

        await runtime.startProcess('sleep 10')
        await runtime.startProcess('sleep 20')
        await runtime.startProcess('sleep 30')

        expect(runtime.getActiveProcessCount()).toBe(3)
      })
    })

    describe('getActiveProcessIds()', () => {
      it('should return empty array when no processes', () => {
        expect(runtime.getActiveProcessIds()).toEqual([])
      })

      it('should return process IDs', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 99999
          proc.exited = new Promise(() => {})
          return proc
        })

        await runtime.startProcess('sleep 10')

        expect(runtime.getActiveProcessIds()).toEqual(['99999'])
      })
    })

    describe('killAll()', () => {
      it('should kill all active processes', async () => {
        const mockKill1 = vi.fn()
        const mockKill2 = vi.fn()
        let callCount = 0

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 1000 + callCount
          proc.exited = new Promise(() => {})
          proc.kill = callCount === 0 ? mockKill1 : mockKill2
          callCount++
          return proc
        })

        await runtime.startProcess('sleep 10')
        await runtime.startProcess('sleep 20')

        expect(runtime.getActiveProcessCount()).toBe(2)

        await runtime.killAll()

        expect(mockKill1).toHaveBeenCalled()
        expect(mockKill2).toHaveBeenCalled()
        expect(runtime.getActiveProcessCount()).toBe(0)
      })
    })

    describe('kill()', () => {
      it('should kill a specific process by ID', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 55555
          proc.exited = new Promise(() => {})
          proc.kill = mockKill
          return proc
        })

        const process = await runtime.startProcess('sleep 10')

        expect(runtime.getActiveProcessCount()).toBe(1)

        await runtime.kill(process.id)

        expect(mockKill).toHaveBeenCalled()
        expect(runtime.getActiveProcessCount()).toBe(0)
      })

      it('should throw if process ID not found', async () => {
        await expect(runtime.kill('nonexistent')).rejects.toThrow(
          'No process found with ID: nonexistent'
        )
      })

      // TDD RED Phase: Tests for kill() with signal support
      it('should terminate process with default SIGTERM signal', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 55555
          proc.exited = new Promise(() => {})
          proc.kill = mockKill
          return proc
        })

        const process = await runtime.startProcess('sleep 10')

        await runtime.kill(process.id)

        // Default signal should be SIGTERM
        expect(mockKill).toHaveBeenCalledWith('SIGTERM')
        expect(runtime.getActiveProcessCount()).toBe(0)
      })

      it('should terminate process with SIGKILL signal', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 55556
          proc.exited = new Promise(() => {})
          proc.kill = mockKill
          return proc
        })

        const process = await runtime.startProcess('sleep 10')

        await runtime.kill(process.id, 'SIGKILL')

        expect(mockKill).toHaveBeenCalledWith('SIGKILL')
        expect(runtime.getActiveProcessCount()).toBe(0)
      })

      it('should terminate process with SIGINT signal', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 55557
          proc.exited = new Promise(() => {})
          proc.kill = mockKill
          return proc
        })

        const process = await runtime.startProcess('sleep 10')

        await runtime.kill(process.id, 'SIGINT')

        expect(mockKill).toHaveBeenCalledWith('SIGINT')
        expect(runtime.getActiveProcessCount()).toBe(0)
      })

      it('should throw for invalid process ID with signal', async () => {
        await expect(runtime.kill('nonexistent', 'SIGKILL')).rejects.toThrow(
          'No process found with ID: nonexistent'
        )
      })

      it('should handle already-exited process gracefully', async () => {
        const mockKill = vi.fn()

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 55558
          // Process exits immediately
          proc.exited = Promise.resolve(0)
          proc.kill = mockKill
          return proc
        })

        const process = await runtime.startProcess('echo "done"')

        // Wait for auto-cleanup
        await new Promise((r) => setTimeout(r, 10))

        // Process already exited, should not be in tracking
        expect(runtime.getActiveProcessCount()).toBe(0)

        // Attempting to kill should throw
        await expect(runtime.kill(process.id)).rejects.toThrow(
          'No process found with ID'
        )
      })
    })

    describe('process auto-cleanup on exit', () => {
      it('should remove process from tracking when it exits', async () => {
        let resolveExited: (code: number) => void = () => {}

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, '', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 77777
          proc.exited = new Promise((resolve) => {
            resolveExited = resolve
          })
          return proc
        })

        await runtime.startProcess('echo "done"')

        expect(runtime.getActiveProcessCount()).toBe(1)

        // Simulate process exit
        resolveExited(0)

        // Wait for the then() handler to run
        await new Promise((r) => setTimeout(r, 0))

        expect(runtime.getActiveProcessCount()).toBe(0)
      })
    })
  })

  describe('streamProcessLogs()', () => {
    describe('RED Phase: TDD - streamProcessLogs method', () => {
      it('should return ReadableStream<Uint8Array>', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'log output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise(() => {}) // Keep alive
          return proc
        })

        const process = await runtime.startProcess('echo "log output"')
        const stream = await runtime.streamProcessLogs(process.id)

        expect(stream).toBeInstanceOf(ReadableStream)
      })

      it('should stream stdout from running process', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'streaming log data\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise(() => {}) // Keep alive
          return proc
        })

        const process = await runtime.startProcess('echo "streaming log data"')
        const stream = await runtime.streamProcessLogs(process.id)

        // Read from the stream
        const text = await new Response(stream).text()
        expect(text).toContain('streaming log data')
      })

      it('should handle process exit gracefully', async () => {
        let resolveExited: (code: number) => void

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'process output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise((resolve) => {
            resolveExited = resolve
          })
          return proc
        })

        const process = await runtime.startProcess('echo "process output"')
        const stream = await runtime.streamProcessLogs(process.id)

        // Start reading from the stream
        const reader = stream.getReader()
        const { value, done } = await reader.read()
        reader.releaseLock()

        expect(value).toBeInstanceOf(Uint8Array)
        expect(done).toBe(false)

        // Simulate process exit
        resolveExited!(0)
        await new Promise((r) => setTimeout(r, 10))

        // Stream should still be readable (it's a clone)
        const reader2 = stream.getReader()
        await expect(reader2.read()).resolves.toBeDefined()
        reader2.releaseLock()
      })

      it('should throw for invalid process ID', async () => {
        await expect(runtime.streamProcessLogs('invalid-pid')).rejects.toThrow(
          'No process found with ID: invalid-pid'
        )
      })

      it('should allow multiple readers (tee/clone functionality)', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'shared output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise(() => {}) // Keep alive
          return proc
        })

        const process = await runtime.startProcess('echo "shared output"')

        // Get stream twice
        const stream1 = await runtime.streamProcessLogs(process.id)
        const stream2 = await runtime.streamProcessLogs(process.id)

        // Both should be readable
        const text1 = await new Response(stream1).text()
        const text2 = await new Response(stream2).text()

        expect(text1).toContain('shared output')
        expect(text2).toContain('shared output')
      })

      it('should stream data that can be read as Uint8Array', async () => {
        const testData = 'binary safe data\n'
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, testData, '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise(() => {}) // Keep alive
          return proc
        })

        const process = await runtime.startProcess('echo "binary safe data"')
        const stream = await runtime.streamProcessLogs(process.id)

        const reader = stream.getReader()
        const { value, done } = await reader.read()
        reader.releaseLock()

        expect(value).toBeInstanceOf(Uint8Array)
        expect(done).toBe(false)

        // Decode and verify
        const decoder = new TextDecoder()
        const text = decoder.decode(value)
        expect(text).toContain('binary safe data')
      })

      it('should throw if process has already exited and been removed', async () => {
        let resolveExited: (code: number) => void

        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'output\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise((resolve) => {
            resolveExited = resolve
          })
          return proc
        })

        const process = await runtime.startProcess('echo "output"')

        // Simulate process exit and cleanup
        resolveExited!(0)
        await new Promise((r) => setTimeout(r, 10))

        // Process should be removed from tracking
        await expect(runtime.streamProcessLogs(process.id)).rejects.toThrow(
          'No process found with ID: 12345'
        )
      })

      it('should return Promise<ReadableStream<Uint8Array>>', async () => {
        bunMock.spawn.mockImplementation(() => {
          const proc = createMockProcess(0, 'test\n', '')
          // @ts-expect-error - Adding pid to mock
          proc.pid = 12345
          proc.exited = new Promise(() => {}) // Keep alive
          return proc
        })

        const process = await runtime.startProcess('echo "test"')
        const streamPromise = runtime.streamProcessLogs(process.id)

        // Should return a Promise
        expect(streamPromise).toBeInstanceOf(Promise)

        // Promise should resolve to ReadableStream
        const stream = await streamPromise
        expect(stream).toBeInstanceOf(ReadableStream)
      })
    })
  })
})
