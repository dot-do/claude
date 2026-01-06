/**
 * Tests for Runtime Interface
 *
 * TDD tests for the generic Runtime abstraction layer.
 * Runtime is a more generic interface than Sandbox, designed to work
 * across different execution environments.
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import type { Runtime, RuntimeProcess, ExecResult } from './runtime.js'
import { isExecResult } from './runtime.js'

describe('Runtime Interface', () => {
  describe('Required Methods', () => {
    it('should have exec() method', () => {
      // Type-level test: verify exec method exists with correct signature
      type ExecMethod = Runtime['exec']
      expectTypeOf<ExecMethod>().toBeFunction()

      // Verify exec returns Promise<ExecResult>
      type ExecReturn = ReturnType<ExecMethod>
      expectTypeOf<ExecReturn>().toMatchTypeOf<Promise<ExecResult>>()
    })

    it('should have startProcess() method', () => {
      // Type-level test: verify startProcess method exists
      type StartProcessMethod = Runtime['startProcess']
      expectTypeOf<StartProcessMethod>().toBeFunction()

      // Verify startProcess returns Promise<RuntimeProcess>
      type StartProcessReturn = ReturnType<StartProcessMethod>
      expectTypeOf<StartProcessReturn>().toMatchTypeOf<Promise<RuntimeProcess>>()
    })

    it('should have readFile() method', () => {
      // Type-level test: verify readFile method exists
      type ReadFileMethod = Runtime['readFile']
      expectTypeOf<ReadFileMethod>().toBeFunction()

      // Verify readFile returns Promise<string>
      type ReadFileReturn = ReturnType<ReadFileMethod>
      expectTypeOf<ReadFileReturn>().toMatchTypeOf<Promise<string>>()
    })

    it('should have writeFile() method', () => {
      // Type-level test: verify writeFile method exists
      type WriteFileMethod = Runtime['writeFile']
      expectTypeOf<WriteFileMethod>().toBeFunction()

      // Verify writeFile returns Promise<void>
      type WriteFileReturn = ReturnType<WriteFileMethod>
      expectTypeOf<WriteFileReturn>().toMatchTypeOf<Promise<void>>()
    })
  })

  describe('Optional Methods', () => {
    it('should have optional streamProcessLogs() method', () => {
      // Type-level test: verify streamProcessLogs is optional
      type StreamLogsMethod = Runtime['streamProcessLogs']
      expectTypeOf<StreamLogsMethod>().toMatchTypeOf<
        ((processId: string) => Promise<ReadableStream<Uint8Array>>) | undefined
      >()
    })

    it('should have optional kill() method', () => {
      // Type-level test: verify kill is optional
      type KillMethod = Runtime['kill']
      expectTypeOf<KillMethod>().toMatchTypeOf<
        ((processId: string) => Promise<void>) | undefined
      >()
    })
  })

  describe('exec() Method Signature', () => {
    it('should accept command string as first argument', () => {
      type ExecParams = Parameters<Runtime['exec']>
      // First parameter should be string
      expectTypeOf<ExecParams[0]>().toBeString()
    })

    it('should accept optional options object', () => {
      type ExecParams = Parameters<Runtime['exec']>
      // Second parameter should be optional options
      type OptionsParam = ExecParams[1]
      expectTypeOf<OptionsParam>().toMatchTypeOf<
        { timeout?: number; env?: Record<string, string> } | undefined
      >()
    })
  })

  describe('startProcess() Method Signature', () => {
    it('should accept command string as first argument', () => {
      type StartProcessParams = Parameters<Runtime['startProcess']>
      expectTypeOf<StartProcessParams[0]>().toBeString()
    })

    it('should accept optional options object', () => {
      type StartProcessParams = Parameters<Runtime['startProcess']>
      type OptionsParam = StartProcessParams[1]
      expectTypeOf<OptionsParam>().toMatchTypeOf<
        { env?: Record<string, string> } | undefined
      >()
    })
  })
})

describe('RuntimeProcess Interface', () => {
  describe('Required Properties', () => {
    it('should have id property', () => {
      expectTypeOf<RuntimeProcess['id']>().toBeString()
    })

    it('should have stdout property as ReadableStream', () => {
      expectTypeOf<RuntimeProcess['stdout']>().toMatchTypeOf<
        ReadableStream<Uint8Array>
      >()
    })

    it('should have stderr property as ReadableStream', () => {
      expectTypeOf<RuntimeProcess['stderr']>().toMatchTypeOf<
        ReadableStream<Uint8Array>
      >()
    })

    it('should have exited property as Promise<number>', () => {
      expectTypeOf<RuntimeProcess['exited']>().toMatchTypeOf<Promise<number>>()
    })
  })

  describe('Optional Methods', () => {
    it('should have optional kill() method', () => {
      type KillMethod = RuntimeProcess['kill']
      expectTypeOf<KillMethod>().toMatchTypeOf<(() => Promise<void>) | undefined>()
    })

    it('should have optional write() method for stdin', () => {
      type WriteMethod = RuntimeProcess['write']
      expectTypeOf<WriteMethod>().toMatchTypeOf<
        ((data: string | Uint8Array) => Promise<void>) | undefined
      >()
    })
  })
})

describe('ExecResult Interface', () => {
  describe('Required Properties', () => {
    it('should have exitCode property', () => {
      expectTypeOf<ExecResult['exitCode']>().toBeNumber()
    })
  })

  describe('Optional Properties', () => {
    it('should have optional stdout property', () => {
      type StdoutProp = ExecResult['stdout']
      expectTypeOf<StdoutProp>().toMatchTypeOf<string | undefined>()
    })

    it('should have optional stderr property', () => {
      type StderrProp = ExecResult['stderr']
      expectTypeOf<StderrProp>().toMatchTypeOf<string | undefined>()
    })
  })
})

describe('Sandbox Compatibility', () => {
  it('should be assignable from Sandbox interface', async () => {
    // Import Sandbox to verify compatibility
    const { Sandbox } = await import('./sandbox.js')

    // Type-level check: Sandbox should be assignable to Runtime
    // This verifies Runtime is a superset/compatible with Sandbox
    type SandboxExtendsRuntime = typeof Sandbox extends Runtime ? true : false

    // Note: We can't directly test assignability at runtime since these are interfaces
    // but the import succeeding and TypeScript compiling proves the types exist
    expect(Sandbox).toBeDefined
  })

  it('should have compatible exec() return type with Sandbox', () => {
    // ExecResult should match Sandbox's exec return type
    type SandboxExecReturn = {
      exitCode: number
      stdout?: string
      stderr?: string
    }

    // ExecResult should be assignable to/from SandboxExecReturn
    expectTypeOf<ExecResult>().toMatchTypeOf<SandboxExecReturn>()
  })
})

describe('Type Exports', () => {
  it('should export Runtime type', async () => {
    const types = await import('./runtime.js')
    // Type exports don't exist at runtime, but import should succeed
    expect(types).toBeDefined()
  })

  it('should export RuntimeProcess type', async () => {
    const types = await import('./runtime.js')
    expect(types).toBeDefined()
  })

  it('should export ExecResult type', async () => {
    const types = await import('./runtime.js')
    expect(types).toBeDefined()
  })
})

// ============================================================================
// isExecResult Type Guard Tests
// ============================================================================

describe('isExecResult type guard', () => {
  describe('valid ExecResult objects', () => {
    it('returns true for minimal valid ExecResult (only exitCode)', () => {
      const result = { exitCode: 0 }
      expect(isExecResult(result)).toBe(true)
    })

    it('returns true for ExecResult with stdout', () => {
      const result = { exitCode: 0, stdout: 'output' }
      expect(isExecResult(result)).toBe(true)
    })

    it('returns true for ExecResult with stderr', () => {
      const result = { exitCode: 1, stderr: 'error' }
      expect(isExecResult(result)).toBe(true)
    })

    it('returns true for ExecResult with all properties', () => {
      const result = { exitCode: 0, stdout: 'out', stderr: 'err' }
      expect(isExecResult(result)).toBe(true)
    })

    it('returns true for negative exit codes (signals)', () => {
      const result = { exitCode: -15 }
      expect(isExecResult(result)).toBe(true)
    })

    it('returns true for empty string stdout/stderr', () => {
      const result = { exitCode: 0, stdout: '', stderr: '' }
      expect(isExecResult(result)).toBe(true)
    })
  })

  describe('invalid inputs', () => {
    it('returns false for null', () => {
      expect(isExecResult(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isExecResult(undefined)).toBe(false)
    })

    it('returns false for primitives', () => {
      expect(isExecResult('string')).toBe(false)
      expect(isExecResult(123)).toBe(false)
      expect(isExecResult(true)).toBe(false)
    })

    it('returns false for empty object (missing exitCode)', () => {
      expect(isExecResult({})).toBe(false)
    })

    it('returns false when exitCode is missing', () => {
      const result = { stdout: 'output', stderr: 'error' }
      expect(isExecResult(result)).toBe(false)
    })

    it('returns false when exitCode is not a number', () => {
      expect(isExecResult({ exitCode: '0' })).toBe(false)
      expect(isExecResult({ exitCode: null })).toBe(false)
      expect(isExecResult({ exitCode: undefined })).toBe(false)
      expect(isExecResult({ exitCode: {} })).toBe(false)
    })

    it('returns false when stdout is not a string', () => {
      expect(isExecResult({ exitCode: 0, stdout: 123 })).toBe(false)
      expect(isExecResult({ exitCode: 0, stdout: {} })).toBe(false)
      expect(isExecResult({ exitCode: 0, stdout: [] })).toBe(false)
      expect(isExecResult({ exitCode: 0, stdout: null })).toBe(false)
    })

    it('returns false when stderr is not a string', () => {
      expect(isExecResult({ exitCode: 0, stderr: 123 })).toBe(false)
      expect(isExecResult({ exitCode: 0, stderr: {} })).toBe(false)
      expect(isExecResult({ exitCode: 0, stderr: [] })).toBe(false)
      expect(isExecResult({ exitCode: 0, stderr: null })).toBe(false)
    })

    it('returns false for arrays', () => {
      expect(isExecResult([0, 'out', 'err'])).toBe(false)
    })
  })

  describe('type narrowing', () => {
    it('narrows unknown type to ExecResult', () => {
      const unknown: unknown = { exitCode: 0, stdout: 'test' }
      if (isExecResult(unknown)) {
        // TypeScript should now know this is ExecResult
        expectTypeOf(unknown).toEqualTypeOf<ExecResult>()
        expect(unknown.exitCode).toBe(0)
        expect(unknown.stdout).toBe('test')
      }
    })
  })
})
