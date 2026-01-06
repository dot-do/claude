/**
 * Tests for CloudflareRuntime wrapper
 *
 * This adapter wraps a CloudflareRuntime (from @cloudflare/sandbox) and adapts it
 * to the generic Runtime interface.
 *
 * TDD Issue: claude-0k3.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CloudflareRuntime, CloudflareProcess } from '../types/sandbox.js'
import type { Runtime, RuntimeProcess, ExecResult } from '../types/runtime.js'
import {
  createCloudflareRuntime,
  CloudflareRuntimeAdapter,
  CloudflareProcessAdapter,
} from './cloudflare.js'

/**
 * Mock CloudflareProcess for testing
 */
function createMockCloudflareProcess(overrides: Partial<CloudflareProcess> = {}): CloudflareProcess {
  return {
    id: 'mock-process-id',
    waitForPort: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

/**
 * Mock CloudflareRuntime for testing
 */
function createMockCloudflareRuntime(overrides: Partial<CloudflareRuntime> = {}): CloudflareRuntime {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue(createMockCloudflareProcess()),
    readFile: vi.fn().mockResolvedValue('file content'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('CloudflareRuntime Wrapper', () => {
  describe('createCloudflareRuntime factory function', () => {
    it('should return a Runtime interface', () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const runtime = createCloudflareRuntime(mockCfRuntime)

      // Verify it has all required Runtime methods
      expect(runtime.exec).toBeTypeOf('function')
      expect(runtime.startProcess).toBeTypeOf('function')
      expect(runtime.readFile).toBeTypeOf('function')
      expect(runtime.writeFile).toBeTypeOf('function')
    })

    it('should be usable as a Runtime type', () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const runtime: Runtime = createCloudflareRuntime(mockCfRuntime)

      expect(runtime).toBeDefined()
    })
  })

  describe('CloudflareRuntimeAdapter class', () => {
    it('should implement Runtime interface', () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const adapter = new CloudflareRuntimeAdapter(mockCfRuntime)

      // Type assertion to verify interface implementation
      const runtime: Runtime = adapter
      expect(runtime).toBeDefined()
    })

    it('should expose the underlying CloudflareRuntime', () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const adapter = new CloudflareRuntimeAdapter(mockCfRuntime)

      expect(adapter.cloudflareRuntime).toBe(mockCfRuntime)
    })
  })

  describe('exec() method', () => {
    let mockCfRuntime: CloudflareRuntime
    let runtime: Runtime

    beforeEach(() => {
      mockCfRuntime = createMockCloudflareRuntime()
      runtime = createCloudflareRuntime(mockCfRuntime)
    })

    it('should delegate to CloudflareRuntime.exec', async () => {
      const expectedResult: ExecResult = { exitCode: 0, stdout: 'hello', stderr: '' }
      vi.mocked(mockCfRuntime.exec).mockResolvedValue(expectedResult)

      const result = await runtime.exec('echo hello')

      expect(mockCfRuntime.exec).toHaveBeenCalledWith('echo hello', undefined)
      expect(result).toEqual(expectedResult)
    })

    it('should pass options to CloudflareRuntime.exec', async () => {
      const options = { timeout: 5000, env: { FOO: 'bar' } }

      await runtime.exec('test', options)

      expect(mockCfRuntime.exec).toHaveBeenCalledWith('test', options)
    })

    it('should return ExecResult with exitCode, stdout, stderr', async () => {
      vi.mocked(mockCfRuntime.exec).mockResolvedValue({
        exitCode: 1,
        stdout: 'output',
        stderr: 'error',
      })

      const result = await runtime.exec('failing command')

      expect(result.exitCode).toBe(1)
      expect(result.stdout).toBe('output')
      expect(result.stderr).toBe('error')
    })
  })

  describe('startProcess() method', () => {
    let mockCfRuntime: CloudflareRuntime
    let runtime: Runtime

    beforeEach(() => {
      mockCfRuntime = createMockCloudflareRuntime()
      runtime = createCloudflareRuntime(mockCfRuntime)
    })

    it('should delegate to CloudflareRuntime.startProcess', async () => {
      await runtime.startProcess('node server.js')

      expect(mockCfRuntime.startProcess).toHaveBeenCalledWith('node server.js', undefined)
    })

    it('should pass options to CloudflareRuntime.startProcess', async () => {
      const options = { env: { NODE_ENV: 'production' } }

      await runtime.startProcess('node server.js', options)

      expect(mockCfRuntime.startProcess).toHaveBeenCalledWith('node server.js', options)
    })

    it('should return RuntimeProcess with id', async () => {
      const mockProcess = createMockCloudflareProcess({ id: 'test-process-123' })
      vi.mocked(mockCfRuntime.startProcess).mockResolvedValue(mockProcess)

      const process = await runtime.startProcess('test')

      expect(process.id).toBe('test-process-123')
    })

    it('should return RuntimeProcess with stdout stream', async () => {
      const process = await runtime.startProcess('test')

      expect(process.stdout).toBeInstanceOf(ReadableStream)
    })

    it('should return RuntimeProcess with stderr stream', async () => {
      const process = await runtime.startProcess('test')

      expect(process.stderr).toBeInstanceOf(ReadableStream)
    })

    it('should return RuntimeProcess with exited promise', async () => {
      const process = await runtime.startProcess('test')

      expect(process.exited).toBeInstanceOf(Promise)
    })
  })

  describe('readFile() method', () => {
    let mockCfRuntime: CloudflareRuntime
    let runtime: Runtime

    beforeEach(() => {
      mockCfRuntime = createMockCloudflareRuntime()
      runtime = createCloudflareRuntime(mockCfRuntime)
    })

    it('should delegate to CloudflareRuntime.readFile', async () => {
      vi.mocked(mockCfRuntime.readFile).mockResolvedValue('file content')

      const result = await runtime.readFile('/path/to/file.txt')

      expect(mockCfRuntime.readFile).toHaveBeenCalledWith('/path/to/file.txt')
      expect(result).toBe('file content')
    })
  })

  describe('writeFile() method', () => {
    let mockCfRuntime: CloudflareRuntime
    let runtime: Runtime

    beforeEach(() => {
      mockCfRuntime = createMockCloudflareRuntime()
      runtime = createCloudflareRuntime(mockCfRuntime)
    })

    it('should delegate string content to CloudflareRuntime.writeFile', async () => {
      await runtime.writeFile('/path/to/file.txt', 'content')

      expect(mockCfRuntime.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'content')
    })

    it('should delegate Uint8Array content to CloudflareRuntime.writeFile', async () => {
      const content = new Uint8Array([1, 2, 3])

      await runtime.writeFile('/path/to/file.bin', content)

      expect(mockCfRuntime.writeFile).toHaveBeenCalledWith('/path/to/file.bin', content)
    })
  })

  describe('streamProcessLogs() optional method', () => {
    it('should delegate to CloudflareRuntime.streamProcessLogs when available', async () => {
      const mockStream = new ReadableStream<Uint8Array>()
      const mockCfRuntime = createMockCloudflareRuntime({
        streamProcessLogs: vi.fn().mockResolvedValue(mockStream),
      })
      const runtime = createCloudflareRuntime(mockCfRuntime)

      const stream = await runtime.streamProcessLogs?.('process-id')

      expect(mockCfRuntime.streamProcessLogs).toHaveBeenCalledWith('process-id')
      expect(stream).toBe(mockStream)
    })

    it('should have streamProcessLogs as undefined when CloudflareRuntime does not support it', () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      // Explicitly remove streamProcessLogs
      delete (mockCfRuntime as Record<string, unknown>).streamProcessLogs

      const runtime = createCloudflareRuntime(mockCfRuntime)

      expect(runtime.streamProcessLogs).toBeUndefined()
    })
  })

  describe('RuntimeProcess streams', () => {
    it('should provide proper ReadableStream for stdout', async () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const runtime = createCloudflareRuntime(mockCfRuntime)

      const process = await runtime.startProcess('test')

      // Verify stdout is a proper ReadableStream
      expect(process.stdout).toHaveProperty('getReader')
      expect(process.stdout).toHaveProperty('pipeTo')
    })

    it('should provide proper ReadableStream for stderr', async () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const runtime = createCloudflareRuntime(mockCfRuntime)

      const process = await runtime.startProcess('test')

      // Verify stderr is a proper ReadableStream
      expect(process.stderr).toHaveProperty('getReader')
      expect(process.stderr).toHaveProperty('pipeTo')
    })
  })

  describe('Type compatibility', () => {
    it('should accept CloudflareRuntime and return Runtime-compatible object', () => {
      // This is a compile-time type check
      const useRuntime = (_r: Runtime): void => { /* noop */ }
      const mockCfRuntime = createMockCloudflareRuntime()

      // Should compile without errors
      useRuntime(createCloudflareRuntime(mockCfRuntime))
    })

    it('should allow CloudflareRuntimeAdapter to be assigned to Runtime', () => {
      // Another compile-time type check
      const mockCfRuntime = createMockCloudflareRuntime()
      const adapter = new CloudflareRuntimeAdapter(mockCfRuntime)

      const runtime: Runtime = adapter
      expect(runtime).toBeDefined()
    })
  })

  describe('CloudflareProcessAdapter', () => {
    it('should implement RuntimeProcess interface', () => {
      const mockProcess = createMockCloudflareProcess()
      const adapter = new CloudflareProcessAdapter(mockProcess)

      const runtimeProcess: RuntimeProcess = adapter
      expect(runtimeProcess).toBeDefined()
    })

    it('should expose the underlying CloudflareProcess', () => {
      const mockProcess = createMockCloudflareProcess()
      const adapter = new CloudflareProcessAdapter(mockProcess)

      expect(adapter.cloudflareProcess).toBe(mockProcess)
    })

    it('should delegate waitForPort to CloudflareProcess', async () => {
      const mockProcess = createMockCloudflareProcess()
      const adapter = new CloudflareProcessAdapter(mockProcess)

      await adapter.waitForPort(3000, { timeout: 5000 })

      expect(mockProcess.waitForPort).toHaveBeenCalledWith(3000, { timeout: 5000 })
    })

    it('should return RuntimeProcess from startProcess that is a CloudflareProcessAdapter', async () => {
      const mockCfRuntime = createMockCloudflareRuntime()
      const runtime = createCloudflareRuntime(mockCfRuntime)

      const process = await runtime.startProcess('test')

      expect(process).toBeInstanceOf(CloudflareProcessAdapter)
    })
  })
})
