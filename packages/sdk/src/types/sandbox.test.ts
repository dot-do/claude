/**
 * Tests for Sandbox interface consolidation
 *
 * These tests verify that:
 * 1. There is a single Sandbox interface source of truth
 * 2. All modules import from the canonical location
 * 3. No duplicate interface definitions exist
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

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
 * Count occurrences of "interface Sandbox" in source files
 */
function countSandboxInterfaceDefinitions(): { count: number; files: string[] } {
  const files = getAllTsFiles(SRC_DIR)
  const filesWithInterface: string[] = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    // Match "interface Sandbox {" but not "interface SandboxNamespace"
    if (/interface\s+Sandbox\s*\{/.test(content) && !/interface\s+SandboxNamespace/.test(content.match(/interface\s+Sandbox[^\n]*/)?.[0] || '')) {
      // More precise: check if it's exactly "interface Sandbox" not "interface SandboxSomething"
      const matches = content.match(/interface\s+Sandbox\s*\{/g)
      if (matches && matches.length > 0) {
        filesWithInterface.push(path.relative(SRC_DIR, file))
      }
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
    it('should have exactly one file defining the Sandbox interface', () => {
      const result = countSandboxInterfaceDefinitions()
      expect(result.count).toBe(1)
      expect(result.files).toHaveLength(1)
    })

    it('should define Sandbox interface in types/sandbox.ts', () => {
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
})
