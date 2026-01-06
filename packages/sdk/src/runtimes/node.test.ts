/**
 * Tests for NodeRuntime
 *
 * TDD RED Phase: These tests define the expected behavior for NodeRuntime
 * - exec(): Execute commands and return results
 * - readFile(): Read file contents
 * - writeFile(): Write content to files (string and Uint8Array)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NodeRuntime } from './node.js'
import type { ExecResult, RuntimeProcess } from '../types/runtime.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

describe('NodeRuntime', () => {
  let runtime: NodeRuntime

  beforeEach(() => {
    runtime = new NodeRuntime()
  })

  describe('exec()', () => {
    it('should run a command and return ExecResult', async () => {
      const result = await runtime.exec('echo "hello"')

      expect(result).toBeDefined()
      expect(typeof result.exitCode).toBe('number')
      expect(result.stdout).toBeDefined()
      expect(result.stderr).toBeDefined()
    })

    it('should handle successful commands with exitCode 0', async () => {
      const result = await runtime.exec('echo "success"')

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('success')
    })

    it('should handle failed commands with non-zero exitCode', async () => {
      const result = await runtime.exec('exit 42')

      expect(result.exitCode).toBe(42)
    })

    it('should capture stdout correctly', async () => {
      const result = await runtime.exec('echo "stdout output"')

      expect(result.stdout).toBeDefined()
      expect(result.stdout).toContain('stdout output')
    })

    it('should capture stderr correctly', async () => {
      // Use shell to write to stderr
      const result = await runtime.exec('>&2 echo "stderr output"')

      expect(result.stderr).toBeDefined()
      expect(result.stderr).toContain('stderr output')
    })

    it('should capture both stdout and stderr', async () => {
      // Write to both stdout and stderr
      const result = await runtime.exec('echo "out" && >&2 echo "err"')

      expect(result.stdout).toContain('out')
      expect(result.stderr).toContain('err')
    })

    describe('timeout option', () => {
      it('should respect timeout option and terminate long-running commands', async () => {
        const startTime = Date.now()
        const result = await runtime.exec('sleep 10', { timeout: 100 })
        const elapsed = Date.now() - startTime

        // Should terminate quickly (before 10 seconds)
        expect(elapsed).toBeLessThan(5000)
        // Timeout typically results in non-zero exit code
        expect(result.exitCode).not.toBe(0)
      })

      it('should complete within timeout for fast commands', async () => {
        const result = await runtime.exec('echo "fast"', { timeout: 5000 })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('fast')
      })
    })

    describe('env option', () => {
      it('should respect env option and pass environment variables', async () => {
        const result = await runtime.exec('echo $TEST_VAR', {
          env: { TEST_VAR: 'custom_value' },
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('custom_value')
      })

      it('should merge custom env with process env', async () => {
        // PATH should still work (from process env) while custom var is added
        const result = await runtime.exec('echo $TEST_VAR $HOME', {
          env: { TEST_VAR: 'merged' },
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('merged')
        // HOME should also be present from process.env
        expect(result.stdout).not.toContain('$HOME') // Variable should be expanded
      })

      it('should allow overriding existing env variables', async () => {
        const result = await runtime.exec('echo $USER', {
          env: { USER: 'testuser' },
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toContain('testuser')
      })
    })

    describe('error handling', () => {
      it('should handle command not found gracefully', async () => {
        const result = await runtime.exec('nonexistent_command_12345')

        expect(result.exitCode).not.toBe(0)
        // Should have error info in stderr
        expect(result.stderr).toBeDefined()
      })

      it('should handle empty command', async () => {
        const result = await runtime.exec('')

        // Empty command should either fail or succeed with empty output
        expect(typeof result.exitCode).toBe('number')
      })
    })
  })

  // ============================================================================
  // File Operations Tests (TDD RED Phase)
  // ============================================================================

  describe('readFile()', () => {
    let tempDir: string
    let testFilePath: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-runtime-test-'))
      testFilePath = path.join(tempDir, 'test-file.txt')
    })

    afterEach(async () => {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('should read a file and return contents as string', async () => {
      const content = 'Hello, NodeRuntime!'
      await fs.writeFile(testFilePath, content, 'utf-8')

      const result = await runtime.readFile(testFilePath)

      expect(result).toBe(content)
    })

    it('should read a file with unicode content', async () => {
      const content = 'Hello, 世界! 🎉'
      await fs.writeFile(testFilePath, content, 'utf-8')

      const result = await runtime.readFile(testFilePath)

      expect(result).toBe(content)
    })

    it('should read an empty file', async () => {
      await fs.writeFile(testFilePath, '', 'utf-8')

      const result = await runtime.readFile(testFilePath)

      expect(result).toBe('')
    })

    it('should read a file with multiple lines', async () => {
      const content = 'Line 1\nLine 2\nLine 3'
      await fs.writeFile(testFilePath, content, 'utf-8')

      const result = await runtime.readFile(testFilePath)

      expect(result).toBe(content)
    })

    it('should throw on non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.txt')

      await expect(runtime.readFile(nonExistentPath)).rejects.toThrow()
    })

    it('should throw with helpful error message for non-existent file', async () => {
      const nonExistentPath = path.join(tempDir, 'missing.txt')

      await expect(runtime.readFile(nonExistentPath)).rejects.toThrow(/ENOENT|no such file|not found/i)
    })
  })

  describe('writeFile()', () => {
    let tempDir: string

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'node-runtime-test-'))
    })

    afterEach(async () => {
      // Cleanup temp directory
      await fs.rm(tempDir, { recursive: true, force: true })
    })

    it('should write string content to a file', async () => {
      const filePath = path.join(tempDir, 'output.txt')
      const content = 'Hello from NodeRuntime!'

      await runtime.writeFile(filePath, content)

      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe(content)
    })

    it('should write Uint8Array content to a file', async () => {
      const filePath = path.join(tempDir, 'binary.bin')
      const content = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]) // "Hello"

      await runtime.writeFile(filePath, content)

      const written = await fs.readFile(filePath)
      expect(new Uint8Array(written)).toEqual(content)
    })

    it('should overwrite existing file', async () => {
      const filePath = path.join(tempDir, 'existing.txt')
      await fs.writeFile(filePath, 'original content', 'utf-8')

      const newContent = 'new content'
      await runtime.writeFile(filePath, newContent)

      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe(newContent)
    })

    it('should write unicode content correctly', async () => {
      const filePath = path.join(tempDir, 'unicode.txt')
      const content = '日本語テスト 🚀'

      await runtime.writeFile(filePath, content)

      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe(content)
    })

    it('should write empty content', async () => {
      const filePath = path.join(tempDir, 'empty.txt')

      await runtime.writeFile(filePath, '')

      const written = await fs.readFile(filePath, 'utf-8')
      expect(written).toBe('')
    })

    it('should create parent directories if needed', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'deeply', 'output.txt')
      const content = 'nested content'

      await runtime.writeFile(nestedPath, content)

      const written = await fs.readFile(nestedPath, 'utf-8')
      expect(written).toBe(content)
    })

    it('should create multiple levels of parent directories', async () => {
      const deepPath = path.join(tempDir, 'a', 'b', 'c', 'd', 'file.txt')
      const content = 'deep content'

      await runtime.writeFile(deepPath, content)

      const written = await fs.readFile(deepPath, 'utf-8')
      expect(written).toBe(content)
    })

    it('should write Uint8Array with binary data correctly', async () => {
      const filePath = path.join(tempDir, 'binary-data.bin')
      // Include various byte values including 0x00 and 0xFF
      const content = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff])

      await runtime.writeFile(filePath, content)

      const written = await fs.readFile(filePath)
      expect(new Uint8Array(written)).toEqual(content)
    })
  })

  // ============================================================================
  // startProcess() Tests (TDD RED Phase for claude-12a.2)
  // ============================================================================

  describe('startProcess()', () => {
    describe('basic process spawning', () => {
      it('should start a process and return RuntimeProcess', async () => {
        const process = await runtime.startProcess('echo "hello"')

        expect(process).toBeDefined()
        expect(process.id).toBeDefined()
        expect(typeof process.id).toBe('string')
        expect(process.id.length).toBeGreaterThan(0)

        await process.exited
      })

      it('should have stdout as ReadableStream<Uint8Array>', async () => {
        const process = await runtime.startProcess('echo "test"')

        expect(process.stdout).toBeDefined()
        expect(process.stdout).toBeInstanceOf(ReadableStream)

        // Read from stdout
        const reader = process.stdout.getReader()
        const { value, done } = await reader.read()

        expect(done).toBe(false)
        expect(value).toBeInstanceOf(Uint8Array)

        // Cleanup
        reader.releaseLock()
        await process.exited
      })

      it('should have stderr as ReadableStream<Uint8Array>', async () => {
        // Use a command that writes to stderr
        const process = await runtime.startProcess('node -e "console.error(\'error output\')"')

        expect(process.stderr).toBeDefined()
        expect(process.stderr).toBeInstanceOf(ReadableStream)

        // Read from stderr
        const reader = process.stderr.getReader()
        const { value, done } = await reader.read()

        expect(done).toBe(false)
        expect(value).toBeInstanceOf(Uint8Array)

        // Cleanup
        reader.releaseLock()
        await process.exited
      })

      it('should have exited promise that resolves to exit code', async () => {
        const process = await runtime.startProcess('echo "done"')

        expect(process.exited).toBeInstanceOf(Promise)

        const exitCode = await process.exited
        expect(typeof exitCode).toBe('number')
        expect(exitCode).toBe(0)
      })
    })

    describe('exit code handling', () => {
      it('should resolve exited with 0 for successful commands', async () => {
        const process = await runtime.startProcess('exit 0')
        const exitCode = await process.exited
        expect(exitCode).toBe(0)
      })

      it('should resolve exited with non-zero for failed commands', async () => {
        const process = await runtime.startProcess('exit 42')
        const exitCode = await process.exited
        expect(exitCode).toBe(42)
      })

      it('should resolve exited with 1 for commands that fail', async () => {
        const process = await runtime.startProcess('node -e "process.exit(1)"')
        const exitCode = await process.exited
        expect(exitCode).toBe(1)
      })
    })

    describe('kill() method', () => {
      it('should have kill method', async () => {
        const process = await runtime.startProcess('sleep 10')

        expect(process.kill).toBeDefined()
        expect(typeof process.kill).toBe('function')

        // Cleanup
        await process.kill!()
        await process.exited
      })

      it('should kill a running process', async () => {
        const process = await runtime.startProcess('sleep 10')

        // Kill the process
        await process.kill!()

        // Process should exit (with signal code, typically non-zero or null)
        const exitCode = await process.exited

        // Killed processes typically have non-zero exit or null (signal)
        // On POSIX systems, killed by SIGTERM gives exit code 143 (128 + 15)
        // or null if killed by signal - our implementation returns null as 0
        expect(typeof exitCode).toBe('number')
      })

      it('should resolve exited promise after kill', async () => {
        const process = await runtime.startProcess('sleep 60')

        const killPromise = process.kill!()
        const exitedPromise = process.exited

        // Both should resolve
        await killPromise
        const exitCode = await exitedPromise

        expect(typeof exitCode).toBe('number')
      })
    })

    describe('stdout stream reading', () => {
      it('should capture stdout output correctly', async () => {
        const process = await runtime.startProcess('echo "hello world"')

        const reader = process.stdout.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const output = new TextDecoder().decode(Buffer.concat(chunks))
        expect(output.trim()).toBe('hello world')

        await process.exited
      })

      it('should handle multi-line stdout', async () => {
        const process = await runtime.startProcess('node -e "console.log(\'line1\'); console.log(\'line2\')"')

        const reader = process.stdout.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const output = new TextDecoder().decode(Buffer.concat(chunks))
        expect(output).toContain('line1')
        expect(output).toContain('line2')

        await process.exited
      })
    })

    describe('stderr stream reading', () => {
      it('should capture stderr output correctly', async () => {
        const process = await runtime.startProcess('node -e "console.error(\'error message\')"')

        const reader = process.stderr.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const output = new TextDecoder().decode(Buffer.concat(chunks))
        expect(output.trim()).toBe('error message')

        await process.exited
      })
    })

    describe('process options', () => {
      it('should accept environment variables', async () => {
        const process = await runtime.startProcess('node -e "console.log(process.env.TEST_VAR)"', {
          env: { TEST_VAR: 'test_value' },
        })

        const reader = process.stdout.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const output = new TextDecoder().decode(Buffer.concat(chunks))
        expect(output.trim()).toBe('test_value')

        await process.exited
      })
    })

    describe('long-running processes', () => {
      it('should handle long-running processes', async () => {
        // Start a process that outputs continuously
        const process = await runtime.startProcess(
          'node -e "let i=0; const id=setInterval(() => { console.log(i++); if(i>=3) { clearInterval(id); } }, 50)"'
        )

        const reader = process.stdout.getReader()
        const chunks: Uint8Array[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const output = new TextDecoder().decode(Buffer.concat(chunks))
        expect(output).toContain('0')
        expect(output).toContain('1')
        expect(output).toContain('2')

        const exitCode = await process.exited
        expect(exitCode).toBe(0)
      })

      it('should allow reading streams while process is running', async () => {
        // Start a process that sleeps then outputs
        const process = await runtime.startProcess(
          'node -e "console.log(\'start\'); setTimeout(() => console.log(\'end\'), 100)"'
        )

        const reader = process.stdout.getReader()

        // Read first chunk (should get 'start')
        const { value: firstValue } = await reader.read()
        const firstOutput = new TextDecoder().decode(firstValue)
        expect(firstOutput).toContain('start')

        // Continue reading until done
        const chunks: Uint8Array[] = [firstValue]
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }

        const fullOutput = new TextDecoder().decode(Buffer.concat(chunks))
        expect(fullOutput).toContain('end')

        await process.exited
      })
    })

    describe('unique process IDs', () => {
      it('should generate unique process IDs', async () => {
        const process1 = await runtime.startProcess('echo "1"')
        const process2 = await runtime.startProcess('echo "2"')

        expect(process1.id).not.toBe(process2.id)

        await process1.exited
        await process2.exited
      })
    })

    describe('RuntimeProcess interface compliance', () => {
      it('should implement RuntimeProcess interface', async () => {
        const process: RuntimeProcess = await runtime.startProcess('echo "test"')

        // Verify all required properties
        expect(process.id).toBeDefined()
        expect(process.stdout).toBeDefined()
        expect(process.stderr).toBeDefined()
        expect(process.exited).toBeDefined()

        // Optional kill method should be defined for NodeRuntime
        expect(process.kill).toBeDefined()

        await process.exited
      })
    })

    describe('write() method for stdin', () => {
      it('should have write method', async () => {
        const process = await runtime.startProcess('cat')

        expect(process.write).toBeDefined()
        expect(typeof process.write).toBe('function')

        // Cleanup
        await process.kill!()
        await process.exited
      })

      it('should write string data to stdin', async () => {
        // Use cat which echoes stdin to stdout
        const process = await runtime.startProcess('cat')

        // Write to stdin
        await process.write!('hello from stdin\n')

        // Need to close stdin for cat to exit - kill the process after reading
        const reader = process.stdout.getReader()
        const { value } = await reader.read()
        reader.releaseLock()

        const output = new TextDecoder().decode(value)
        expect(output).toContain('hello from stdin')

        await process.kill!()
        await process.exited
      })

      it('should write Uint8Array data to stdin', async () => {
        const process = await runtime.startProcess('cat')

        // Write Uint8Array to stdin
        const data = new TextEncoder().encode('binary data\n')
        await process.write!(data)

        const reader = process.stdout.getReader()
        const { value } = await reader.read()
        reader.releaseLock()

        const output = new TextDecoder().decode(value)
        expect(output).toContain('binary data')

        await process.kill!()
        await process.exited
      })
    })
  })
})
