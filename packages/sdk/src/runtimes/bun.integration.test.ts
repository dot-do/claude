/**
 * Integration Tests for BunRuntime
 *
 * TDD RED Phase: These tests verify real process execution with Bun runtime.
 * Unlike the unit tests (bun.test.ts), these tests spawn actual processes
 * and verify that the BunRuntime correctly handles real-world scenarios.
 *
 * Tests are conditionally skipped if not running in Bun environment.
 *
 * Run with: bun test src/runtimes/bun.integration.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BunRuntime } from './bun.js'

// Check if we're running in Bun
const isBun = typeof Bun !== 'undefined'

// Helper to conditionally run tests only in Bun environment
const describeBun = isBun ? describe : describe.skip
const itBun = isBun ? it : it.skip

describeBun('BunRuntime Integration Tests', () => {
  let runtime: BunRuntime

  beforeEach(() => {
    runtime = new BunRuntime()
  })

  afterEach(async () => {
    // Cleanup: kill all processes to prevent leaks
    await runtime.killAll()
  })

  describe('exec() - Real Process Execution', () => {
    itBun('should spawn and execute real echo command', async () => {
      const result = await runtime.exec('echo "hello world"')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello world')
      expect(result.stderr).toBe('')
    })

    itBun('should spawn and execute echo with multiple arguments', async () => {
      const result = await runtime.exec('echo "foo" "bar" "baz"')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('foo bar baz')
    })

    itBun('should handle commands that fail', async () => {
      const result = await runtime.exec('exit 42')

      expect(result.exitCode).toBe(42)
    })

    itBun('should capture stdout from real process', async () => {
      const result = await runtime.exec('echo "test output"')

      expect(result.stdout).toBeDefined()
      expect(result.stdout).toContain('test output')
      expect(typeof result.stdout).toBe('string')
    })

    itBun('should capture stderr from real process', async () => {
      const result = await runtime.exec('>&2 echo "error message"')

      expect(result.stderr).toBeDefined()
      expect(result.stderr).toContain('error message')
    })

    itBun('should handle shell pipes in real execution', async () => {
      const result = await runtime.exec('echo "hello" | cat')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello')
    })

    itBun('should handle command not found', async () => {
      const result = await runtime.exec('nonexistent_command_xyz_12345')

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toBeTruthy()
    })

    itBun('should respect timeout option on long-running commands', async () => {
      const start = Date.now()
      const result = await runtime.exec('sleep 10', { timeout: 100 })
      const duration = Date.now() - start

      // Should timeout before command completes
      expect(duration).toBeLessThan(1000)
      // When Bun aborts the process, it sends SIGTERM (exit code 143 = 128 + 15)
      // or returns timeout exit code 124 if AbortError is caught
      expect([124, 143]).toContain(result.exitCode)
    }, 2000)

    itBun('should allow commands to complete within timeout', async () => {
      const result = await runtime.exec('echo "fast"', { timeout: 5000 })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('fast')
    })

    itBun('should respect env option with real environment variables', async () => {
      const result = await runtime.exec('echo $TEST_VAR', {
        env: { TEST_VAR: 'custom_value' },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('custom_value')
    })

    itBun('should merge custom env with process.env', async () => {
      const result = await runtime.exec('echo $TEST_VAR:$PATH', {
        env: { TEST_VAR: 'merged' },
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('merged')
      // PATH should still be available from process.env
      expect(result.stdout).not.toBe('merged:')
    })
  })

  describe('startProcess() - Real Long-Running Processes', () => {
    itBun('should start a real process and return RuntimeProcess', async () => {
      const process = await runtime.startProcess('echo "streaming"')

      expect(process).toBeDefined()
      expect(process.id).toBeDefined()
      expect(process.stdout).toBeInstanceOf(ReadableStream)
      expect(process.stderr).toBeInstanceOf(ReadableStream)
      expect(process.exited).toBeInstanceOf(Promise)
    })

    itBun('should stream stdout from real process', async () => {
      const process = await runtime.startProcess('echo "streaming output"')

      const text = await new Response(process.stdout).text()
      expect(text).toContain('streaming output')
    })

    itBun('should handle process exit correctly', async () => {
      const process = await runtime.startProcess('echo "done"')

      const exitCode = await process.exited
      expect(exitCode).toBe(0)
    })

    itBun('should handle process that fails', async () => {
      const process = await runtime.startProcess('exit 1')

      const exitCode = await process.exited
      expect(exitCode).toBe(1)
    })

    itBun('should support killing a running process', async () => {
      const process = await runtime.startProcess('sleep 100')

      expect(runtime.getActiveProcessCount()).toBe(1)

      await process.kill?.()

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should respect env option in real process', async () => {
      const process = await runtime.startProcess('echo $MY_VAR', {
        env: { MY_VAR: 'process_value' },
      })

      const text = await new Response(process.stdout).text()
      expect(text).toContain('process_value')
    })

    itBun('should track multiple processes', async () => {
      const p1 = await runtime.startProcess('sleep 1')
      const p2 = await runtime.startProcess('sleep 1')
      const p3 = await runtime.startProcess('sleep 1')

      expect(runtime.getActiveProcessCount()).toBe(3)
      expect(runtime.getActiveProcessIds()).toContain(p1.id)
      expect(runtime.getActiveProcessIds()).toContain(p2.id)
      expect(runtime.getActiveProcessIds()).toContain(p3.id)
    })

    itBun('should auto-cleanup when process exits', async () => {
      const process = await runtime.startProcess('echo "quick"')

      expect(runtime.getActiveProcessCount()).toBe(1)

      // Wait for process to exit
      await process.exited

      // Wait for cleanup handler to run
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(runtime.getActiveProcessCount()).toBe(0)
    })
  })

  describe('cat command - stdin/stdout testing', () => {
    itBun('should spawn cat and handle stdin/stdout', async () => {
      // Note: cat without input will wait for stdin, so we use echo piped to cat
      const result = await runtime.exec('echo "test input" | cat')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('test input')
    })

    itBun('should handle cat with file input', async () => {
      // Create a temporary file first
      const testFile = '/tmp/bun-integration-test-cat.txt'
      await runtime.writeFile(testFile, 'file contents\n')

      const result = await runtime.exec(`cat ${testFile}`)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('file contents')

      // Cleanup
      await runtime.exec(`rm -f ${testFile}`)
    })

    itBun('should handle cat with multiple files', async () => {
      const file1 = '/tmp/bun-integration-test-cat1.txt'
      const file2 = '/tmp/bun-integration-test-cat2.txt'

      await runtime.writeFile(file1, 'first file\n')
      await runtime.writeFile(file2, 'second file\n')

      const result = await runtime.exec(`cat ${file1} ${file2}`)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('first file')
      expect(result.stdout).toContain('second file')

      // Cleanup
      await runtime.exec(`rm -f ${file1} ${file2}`)
    })

    itBun('should stream cat output from startProcess', async () => {
      const testFile = '/tmp/bun-integration-test-cat-stream.txt'
      await runtime.writeFile(testFile, 'streaming cat output\n')

      const process = await runtime.startProcess(`cat ${testFile}`)

      const text = await new Response(process.stdout).text()
      expect(text).toContain('streaming cat output')

      await process.exited

      // Cleanup
      await runtime.exec(`rm -f ${testFile}`)
    })
  })

  describe('working directory option', () => {
    itBun('should handle commands with different working directories', async () => {
      // Test by running pwd in a specific directory
      // Note: Current Runtime interface doesn't have cwd option yet,
      // but we can test using shell 'cd' command
      const result = await runtime.exec('cd /tmp && pwd')

      expect(result.exitCode).toBe(0)
      expect(result.stdout.trim()).toBe('/tmp')
    })

    itBun('should handle relative paths in working directory', async () => {
      // Create a test directory and file
      const testDir = '/tmp/bun-integration-test-dir'
      await runtime.exec(`mkdir -p ${testDir}`)
      await runtime.writeFile(`${testDir}/test.txt`, 'test content\n')

      const result = await runtime.exec(`cd ${testDir} && cat test.txt`)

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('test content')

      // Cleanup
      await runtime.exec(`rm -rf ${testDir}`)
    })

    itBun('should handle working directory with startProcess', async () => {
      const testDir = '/tmp/bun-integration-test-process-dir'
      await runtime.exec(`mkdir -p ${testDir}`)

      const process = await runtime.startProcess(`cd ${testDir} && pwd`)

      const text = await new Response(process.stdout).text()
      expect(text.trim()).toBe(testDir)

      await process.exited

      // Cleanup
      await runtime.exec(`rm -rf ${testDir}`)
    })
  })

  describe('streamProcessLogs() - Real Process Log Streaming', () => {
    itBun('should stream logs from a running process', async () => {
      // Start a process that outputs data
      const process = await runtime.startProcess('echo "log line 1"; echo "log line 2"')

      const stream = await runtime.streamProcessLogs(process.id)

      const text = await new Response(stream).text()
      expect(text).toContain('log line 1')
      expect(text).toContain('log line 2')

      await process.exited
    })

    itBun('should allow multiple readers via streamProcessLogs', async () => {
      const process = await runtime.startProcess('echo "shared data"')

      const stream1 = await runtime.streamProcessLogs(process.id)
      const stream2 = await runtime.streamProcessLogs(process.id)

      const [text1, text2] = await Promise.all([
        new Response(stream1).text(),
        new Response(stream2).text(),
      ])

      expect(text1).toContain('shared data')
      expect(text2).toContain('shared data')

      await process.exited
    })

    itBun('should handle process that exits before streaming', async () => {
      const process = await runtime.startProcess('echo "quick exit"')

      // Wait for process to exit
      await process.exited

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Should throw because process is no longer tracked
      await expect(runtime.streamProcessLogs(process.id)).rejects.toThrow(
        'No process found with ID'
      )
    })
  })

  describe('kill() - Process Termination', () => {
    itBun('should kill a running process by ID with default signal', async () => {
      const process = await runtime.startProcess('sleep 100')

      expect(runtime.getActiveProcessCount()).toBe(1)

      await runtime.kill(process.id)

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should kill a running process with SIGTERM', async () => {
      const process = await runtime.startProcess('sleep 100')

      await runtime.kill(process.id, 'SIGTERM')

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should kill a running process with SIGKILL', async () => {
      const process = await runtime.startProcess('sleep 100')

      await runtime.kill(process.id, 'SIGKILL')

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should kill a running process with SIGINT', async () => {
      const process = await runtime.startProcess('sleep 100')

      await runtime.kill(process.id, 'SIGINT')

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should throw for invalid process ID', async () => {
      await expect(runtime.kill('invalid-id-12345')).rejects.toThrow(
        'No process found with ID: invalid-id-12345'
      )
    })
  })

  describe('killAll() - Mass Process Termination', () => {
    itBun('should kill all active processes', async () => {
      await runtime.startProcess('sleep 100')
      await runtime.startProcess('sleep 100')
      await runtime.startProcess('sleep 100')

      expect(runtime.getActiveProcessCount()).toBe(3)

      await runtime.killAll()

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should handle killAll with no active processes', async () => {
      expect(runtime.getActiveProcessCount()).toBe(0)

      await expect(runtime.killAll()).resolves.toBeUndefined()

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should handle killAll with mixed process states', async () => {
      // Start some processes
      const p1 = await runtime.startProcess('echo "quick"')
      await runtime.startProcess('sleep 100')
      const p3 = await runtime.startProcess('echo "fast"')

      // Wait for quick processes to complete
      await Promise.all([p1.exited, p3.exited])
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Should still have the sleep process
      expect(runtime.getActiveProcessCount()).toBeGreaterThanOrEqual(1)

      await runtime.killAll()

      expect(runtime.getActiveProcessCount()).toBe(0)
    })
  })

  describe('readFile() and writeFile() - Real File Operations', () => {
    const testFilePath = '/tmp/bun-integration-test-file.txt'

    afterEach(async () => {
      // Cleanup test file
      await runtime.exec(`rm -f ${testFilePath}`).catch(() => {})
    })

    itBun('should write and read a file', async () => {
      const content = 'Hello, Bun Runtime!'

      await runtime.writeFile(testFilePath, content)

      const readContent = await runtime.readFile(testFilePath)
      expect(readContent).toBe(content)
    })

    itBun('should write binary data and read it back', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5])

      await runtime.writeFile(testFilePath, binaryData)

      const readContent = await runtime.readFile(testFilePath)
      const decoder = new TextDecoder()
      const decodedData = new Uint8Array(
        readContent.split('').map((c) => c.charCodeAt(0))
      )

      expect(decodedData[0]).toBe(1)
      expect(decodedData[4]).toBe(5)
    })

    itBun('should handle multi-line content', async () => {
      const content = 'line 1\nline 2\nline 3\n'

      await runtime.writeFile(testFilePath, content)

      const readContent = await runtime.readFile(testFilePath)
      expect(readContent).toBe(content)
      expect(readContent.split('\n').length).toBe(4) // 3 lines + empty after last \n
    })

    itBun('should create parent directories if they do not exist', async () => {
      const nestedPath = '/tmp/bun-test-nested/deep/dir/file.txt'

      await runtime.writeFile(nestedPath, 'nested content')

      const content = await runtime.readFile(nestedPath)
      expect(content).toBe('nested content')

      // Cleanup
      await runtime.exec('rm -rf /tmp/bun-test-nested')
    })

    itBun('should throw when reading non-existent file', async () => {
      await expect(runtime.readFile('/tmp/nonexistent-file-xyz.txt')).rejects.toThrow(
        'ENOENT'
      )
    })

    itBun('should overwrite existing file', async () => {
      await runtime.writeFile(testFilePath, 'original content')
      await runtime.writeFile(testFilePath, 'new content')

      const content = await runtime.readFile(testFilePath)
      expect(content).toBe('new content')
    })
  })

  describe('Process Tracking and Management', () => {
    itBun('should accurately track active processes', async () => {
      expect(runtime.getActiveProcessCount()).toBe(0)

      const p1 = await runtime.startProcess('sleep 1')
      expect(runtime.getActiveProcessCount()).toBe(1)

      const p2 = await runtime.startProcess('sleep 1')
      expect(runtime.getActiveProcessCount()).toBe(2)

      const ids = runtime.getActiveProcessIds()
      expect(ids).toContain(p1.id)
      expect(ids).toContain(p2.id)
    })

    itBun('should remove completed processes from tracking', async () => {
      const process = await runtime.startProcess('echo "done"')

      expect(runtime.getActiveProcessCount()).toBe(1)

      await process.exited
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(runtime.getActiveProcessCount()).toBe(0)
    })

    itBun('should handle rapid process creation and completion', async () => {
      const processes = await Promise.all([
        runtime.startProcess('echo "1"'),
        runtime.startProcess('echo "2"'),
        runtime.startProcess('echo "3"'),
        runtime.startProcess('echo "4"'),
        runtime.startProcess('echo "5"'),
      ])

      // All should be tracked initially
      expect(runtime.getActiveProcessCount()).toBe(5)

      // Wait for all to complete
      await Promise.all(processes.map((p) => p.exited))
      await new Promise((resolve) => setTimeout(resolve, 100))

      // All should be cleaned up
      expect(runtime.getActiveProcessCount()).toBe(0)
    })
  })
})

// Export a message if tests are skipped
if (!isBun) {
  console.log(
    'BunRuntime integration tests are skipped (not running in Bun environment)'
  )
}
