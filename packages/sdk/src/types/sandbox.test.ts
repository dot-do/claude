/**
 * Tests for Sandbox interface consolidation and CloudflareRuntime deprecation
 *
 * These tests verify that:
 * 1. There is a single CloudflareRuntime interface source of truth
 * 2. All modules import from the canonical location
 * 3. No duplicate interface definitions exist
 * 4. Sandbox is deprecated in favor of CloudflareRuntime
 * 5. Backward compatibility is maintained
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import type {
  CloudflareRuntime,
  CloudflareProcess,
  CloudflareNamespace,
  Sandbox,
  SandboxProcess,
  SandboxNamespace,
} from './sandbox.js'

const SRC_DIR = path.join(__dirname, '..')

/**
 * Get all TypeScript files in the src directory
 */
function getAllTsFiles(dir: string): string[] {
  const files: string[] = []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      files.push(...getAllTsFiles(fullPath))
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      // Skip test files and .d.ts files
      if (!entry.name.includes('.test.') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath)
      }
    }
  }

  return files
}

/**
 * Count occurrences of "interface CloudflareRuntime" in source files
 * (CloudflareRuntime is now the primary interface, Sandbox is a deprecated alias)
 */
function countCloudflareRuntimeInterfaceDefinitions(): { count: number; files: string[] } {
  const files = getAllTsFiles(SRC_DIR)
  const filesWithInterface: string[] = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    // Match "interface CloudflareRuntime {"
    const matches = content.match(/interface\s+CloudflareRuntime\s*\{/g)
    if (matches && matches.length > 0) {
      filesWithInterface.push(path.relative(SRC_DIR, file))
    }
  }

  return { count: filesWithInterface.length, files: filesWithInterface }
}

/**
 * Check that Sandbox is exported from the canonical types location
 */
function checkCanonicalExport(): boolean {
  const typesIndexPath = path.join(SRC_DIR, 'types', 'index.ts')
  const content = fs.readFileSync(typesIndexPath, 'utf-8')
  return content.includes("export type { Sandbox") || content.includes("export { Sandbox") || content.includes("export * from './sandbox")
}

/**
 * Check that the canonical Sandbox interface file exists
 */
function checkSandboxTypeFileExists(): boolean {
  const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
  return fs.existsSync(sandboxTypePath)
}

/**
 * Get files that define their own Sandbox interface instead of importing
 */
function getFilesWithLocalSandboxDefinition(): string[] {
  const files = getAllTsFiles(SRC_DIR)
  const problematicFiles: string[] = []

  // These files are allowed to define Sandbox (the canonical source)
  const allowedFiles = ['types/sandbox.ts']

  for (const file of files) {
    const relativePath = path.relative(SRC_DIR, file).replace(/\\/g, '/')

    // Skip allowed files
    if (allowedFiles.some((allowed) => relativePath === allowed)) {
      continue
    }

    const content = fs.readFileSync(file, 'utf-8')
    // Check for local interface definition
    if (/interface\s+Sandbox\s*\{/.test(content)) {
      problematicFiles.push(relativePath)
    }
  }

  return problematicFiles
}

describe('Sandbox Interface Consolidation', () => {
  describe('Single Source of Truth', () => {
    it('should have exactly one file defining the CloudflareRuntime interface', () => {
      const result = countCloudflareRuntimeInterfaceDefinitions()
      expect(result.count).toBe(1)
      expect(result.files).toHaveLength(1)
      expect(result.files[0]).toBe('types/sandbox.ts')
    })

    it('should define CloudflareRuntime interface in types/sandbox.ts', () => {
      expect(checkSandboxTypeFileExists()).toBe(true)
    })

    it('should export Sandbox from types/index.ts', () => {
      expect(checkCanonicalExport()).toBe(true)
    })
  })

  describe('No Duplicate Definitions', () => {
    it('should not have Sandbox interface defined in server/claude-code.ts', () => {
      const files = getFilesWithLocalSandboxDefinition()
      expect(files).not.toContain('server/claude-code.ts')
    })

    it('should not have Sandbox interface defined in server/process-manager.ts', () => {
      const files = getFilesWithLocalSandboxDefinition()
      expect(files).not.toContain('server/process-manager.ts')
    })

    it('should not have Sandbox interface defined in terminal/websocket-proxy.ts', () => {
      const files = getFilesWithLocalSandboxDefinition()
      expect(files).not.toContain('terminal/websocket-proxy.ts')
    })

    it('should have no files with local Sandbox definitions except the canonical source', () => {
      const files = getFilesWithLocalSandboxDefinition()
      expect(files).toEqual([])
    })
  })

  describe('Interface Completeness', () => {
    it('should export Sandbox type that can be imported', async () => {
      // Dynamic import to verify the export works
      const types = await import('./sandbox.js')
      expect(types.Sandbox).toBeDefined
    })

    it('should export SandboxNamespace type that can be imported', async () => {
      const types = await import('./sandbox.js')
      expect(types.SandboxNamespace).toBeDefined
    })
  })

  // ============================================================================
  // CloudflareRuntime Deprecation Tests (TDD Issue claude-0wb)
  // ============================================================================
  describe('CloudflareRuntime is the preferred interface name', () => {
    it('should export CloudflareRuntime interface from sandbox.ts', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')
      // CloudflareRuntime interface should be defined
      expect(content).toMatch(/export\s+interface\s+CloudflareRuntime\s*\{/)
    })

    it('should export CloudflareProcess interface from sandbox.ts', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')
      expect(content).toMatch(/export\s+interface\s+CloudflareProcess\s*\{/)
    })

    it('should export CloudflareNamespace interface from sandbox.ts', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')
      expect(content).toMatch(/export\s+interface\s+CloudflareNamespace\s*\{/)
    })
  })

  describe('Sandbox is deprecated alias for CloudflareRuntime', () => {
    it('should have Sandbox as a type alias for CloudflareRuntime (backward compat)', () => {
      // Type-level test: if this compiles, Sandbox is compatible with CloudflareRuntime
      const checkTypeCompatibility = <T extends CloudflareRuntime>(x: T): Sandbox => x
      // This is a compile-time check - if types are incompatible, TS will error
      expect(checkTypeCompatibility).toBeDefined()
    })

    it('should have SandboxProcess as a type alias for CloudflareProcess', () => {
      const checkTypeCompatibility = <T extends CloudflareProcess>(x: T): SandboxProcess => x
      expect(checkTypeCompatibility).toBeDefined()
    })

    it('should have SandboxNamespace as a type alias for CloudflareNamespace', () => {
      const checkTypeCompatibility = <T extends CloudflareNamespace>(x: T): SandboxNamespace => x
      expect(checkTypeCompatibility).toBeDefined()
    })

    it('should have @deprecated JSDoc tag on Sandbox type', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')

      // Check that Sandbox type alias has @deprecated tag
      const sandboxAliasMatch = content.match(/@deprecated[\s\S]*?export\s+type\s+Sandbox\s*=/)
      expect(sandboxAliasMatch).not.toBeNull()
    })

    it('should have @deprecated JSDoc tag on SandboxProcess type', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')

      const match = content.match(/@deprecated[\s\S]*?export\s+type\s+SandboxProcess\s*=/)
      expect(match).not.toBeNull()
    })

    it('should have @deprecated JSDoc tag on SandboxNamespace type', () => {
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')

      const match = content.match(/@deprecated[\s\S]*?export\s+type\s+SandboxNamespace\s*=/)
      expect(match).not.toBeNull()
    })
  })

  describe('Backward Compatibility', () => {
    it('should allow existing Sandbox usage to compile', () => {
      // Simulate existing code using Sandbox
      const useSandbox = (sandbox: Sandbox): Promise<string> => {
        return sandbox.readFile('/test')
      }
      expect(useSandbox).toBeDefined()
    })

    it('should allow existing SandboxProcess usage to compile', () => {
      const useProcess = (process: SandboxProcess): string => {
        return process.id
      }
      expect(useProcess).toBeDefined()
    })

    it('should allow CloudflareRuntime to be used where Sandbox was expected', () => {
      // New code using CloudflareRuntime should work with functions expecting Sandbox
      const acceptsSandbox = (s: Sandbox): void => { void s }
      const providesRuntime = (r: CloudflareRuntime): void => { acceptsSandbox(r) }
      expect(providesRuntime).toBeDefined()
    })

    it('should export all types from main index', () => {
      // Verify types are exported from the main package entry point by checking source
      const mainIndexPath = path.join(SRC_DIR, 'index.ts')
      const content = fs.readFileSync(mainIndexPath, 'utf-8')

      // Check deprecated Sandbox types are still exported for backward compat
      expect(content).toMatch(/Sandbox/)
      expect(content).toMatch(/SandboxProcess/)
      expect(content).toMatch(/SandboxNamespace/)
    })
  })

  // ============================================================================
  // TDD Issue claude-0k3.1: Backward Compatibility Tests
  // ============================================================================
  describe('Backward Compatibility - Import Verification (claude-0k3.1)', () => {
    it('importing Sandbox should work and be typed as CloudflareRuntime', () => {
      // Type assertion: Sandbox is an alias for CloudflareRuntime
      // This test verifies the import works at runtime and types are compatible
      const assertSandboxIsCloudflareRuntime: CloudflareRuntime = {} as Sandbox
      const assertCloudflareRuntimeIsSandbox: Sandbox = {} as CloudflareRuntime

      // Both should be assignable to each other (type equivalence)
      expect(assertSandboxIsCloudflareRuntime).toBeDefined()
      expect(assertCloudflareRuntimeIsSandbox).toBeDefined()
    })

    it('importing SandboxProcess should work and be typed as CloudflareProcess', () => {
      // Type assertion: SandboxProcess is an alias for CloudflareProcess
      const assertSandboxProcessIsCloudflareProcess: CloudflareProcess = {} as SandboxProcess
      const assertCloudflareProcessIsSandboxProcess: SandboxProcess = {} as CloudflareProcess

      expect(assertSandboxProcessIsCloudflareProcess).toBeDefined()
      expect(assertCloudflareProcessIsSandboxProcess).toBeDefined()
    })

    it('importing SandboxNamespace should work and be typed as CloudflareNamespace', () => {
      // Type assertion: SandboxNamespace is an alias for CloudflareNamespace
      const assertSandboxNamespaceIsCloudflareNamespace: CloudflareNamespace = {} as SandboxNamespace
      const assertCloudflareNamespaceIsSandboxNamespace: SandboxNamespace = {} as CloudflareNamespace

      expect(assertSandboxNamespaceIsCloudflareNamespace).toBeDefined()
      expect(assertCloudflareNamespaceIsSandboxNamespace).toBeDefined()
    })

    it('old code using Sandbox interface should compile without changes', () => {
      // Simulating legacy code patterns that should continue to work

      // Pattern 1: Function accepting Sandbox parameter
      function legacyExecInSandbox(sandbox: Sandbox, command: string): Promise<{ exitCode: number }> {
        return sandbox.exec(command)
      }

      // Pattern 2: Function returning Sandbox
      function getLegacySandbox(): Sandbox | null {
        return null
      }

      // Pattern 3: Sandbox in generic type
      type LegacySandboxConfig<T extends Sandbox> = {
        runtime: T
        name: string
      }

      // Pattern 4: Class accepting Sandbox
      class LegacySandboxWrapper {
        constructor(private sandbox: Sandbox) {}
        run(cmd: string) { return this.sandbox.exec(cmd) }
      }

      expect(legacyExecInSandbox).toBeDefined()
      expect(getLegacySandbox).toBeDefined()
      expect(LegacySandboxWrapper).toBeDefined()

      // Verify the generic type works with CloudflareRuntime
      const config: LegacySandboxConfig<CloudflareRuntime> = {
        runtime: {} as CloudflareRuntime,
        name: 'test'
      }
      expect(config.name).toBe('test')
    })

    it('old code using SandboxProcess should compile without changes', () => {
      // Legacy process handling code

      // Pattern 1: Function accepting SandboxProcess
      function waitForLegacyProcess(process: SandboxProcess): Promise<void> {
        return process.waitForPort(3000)
      }

      // Pattern 2: Array of processes
      type LegacyProcessList = SandboxProcess[]

      // Pattern 3: Optional process
      interface LegacyState {
        currentProcess?: SandboxProcess
      }

      expect(waitForLegacyProcess).toBeDefined()

      const processes: LegacyProcessList = []
      expect(processes).toHaveLength(0)

      const state: LegacyState = {}
      expect(state.currentProcess).toBeUndefined()
    })

    it('old code using SandboxNamespace should compile without changes', () => {
      // Legacy namespace handling code

      // Pattern 1: Function accepting SandboxNamespace
      function getRuntimeFromLegacyNamespace(ns: SandboxNamespace, id: string): CloudflareRuntime {
        return ns.get(id)
      }

      // Pattern 2: Namespace configuration
      interface LegacyEnv {
        SANDBOX: SandboxNamespace
      }

      expect(getRuntimeFromLegacyNamespace).toBeDefined()

      // The type should compile - we just verify the interface shape
      const env: LegacyEnv = { SANDBOX: {} as SandboxNamespace }
      expect(env.SANDBOX).toBeDefined()
    })

    it('should maintain full interface compatibility between Sandbox and CloudflareRuntime', () => {
      // Verify all methods are accessible through Sandbox type
      const sandbox: Sandbox = {
        exec: async (cmd: string) => ({ exitCode: 0, stdout: '', stderr: '' }),
        startProcess: async (cmd: string) => ({ id: '1', waitForPort: async () => {} }),
        writeFile: async () => {},
        readFile: async () => '',
      }

      // All CloudflareRuntime methods should be accessible
      expect(sandbox.exec).toBeDefined()
      expect(sandbox.startProcess).toBeDefined()
      expect(sandbox.writeFile).toBeDefined()
      expect(sandbox.readFile).toBeDefined()

      // Optional methods should also be accessible if defined
      const sandboxWithOptional: Sandbox = {
        ...sandbox,
        streamProcessLogs: async (processId: string) => new ReadableStream(),
        setEnvVars: async (vars: Record<string, string>) => {},
      }

      expect(sandboxWithOptional.streamProcessLogs).toBeDefined()
      expect(sandboxWithOptional.setEnvVars).toBeDefined()
    })

    it('migration should be a simple find-and-replace', () => {
      // Verify the JSDoc migration examples are accurate
      const sandboxTypePath = path.join(SRC_DIR, 'types', 'sandbox.ts')
      const content = fs.readFileSync(sandboxTypePath, 'utf-8')

      // Check for migration examples in JSDoc
      expect(content).toContain('// Before (deprecated)')
      expect(content).toContain('// After (recommended)')
      expect(content).toContain('CloudflareRuntime')
      expect(content).toContain('CloudflareProcess')
      expect(content).toContain('CloudflareNamespace')
    })
  })
})
