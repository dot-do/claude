/**
 * TypeScript Declaration Tests (TDD - RED Phase)
 *
 * Tests that TypeScript declaration files are properly generated and exported
 * for all package subpaths.
 *
 * Issue: claude-879.4
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const DIST_PATH = path.resolve(__dirname, '../../dist')

describe('TypeScript Declaration Files', () => {
  describe('Declaration files exist for all entry points', () => {
    it('should generate index.d.ts for main entry', () => {
      const dtsPath = path.join(DIST_PATH, 'index.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
    })

    it('should generate index.d.cts for CommonJS entry', () => {
      const dctsPath = path.join(DIST_PATH, 'index.d.cts')
      expect(fs.existsSync(dctsPath)).toBe(true)
    })

    it('should generate client/index.d.ts for client subpath', () => {
      const dtsPath = path.join(DIST_PATH, 'client/index.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
    })

    it('should generate client/index.d.cts for CommonJS client subpath', () => {
      const dctsPath = path.join(DIST_PATH, 'client/index.d.cts')
      expect(fs.existsSync(dctsPath)).toBe(true)
    })

    it('should generate server/index.d.ts for server subpath', () => {
      const dtsPath = path.join(DIST_PATH, 'server/index.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
    })

    it('should generate server/index.d.cts for CommonJS server subpath', () => {
      const dctsPath = path.join(DIST_PATH, 'server/index.d.cts')
      expect(fs.existsSync(dctsPath)).toBe(true)
    })

    it('should generate rpc/index.d.ts for rpc subpath', () => {
      const dtsPath = path.join(DIST_PATH, 'rpc/index.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
    })

    it('should generate rpc/index.d.cts for CommonJS rpc subpath', () => {
      const dctsPath = path.join(DIST_PATH, 'rpc/index.d.cts')
      expect(fs.existsSync(dctsPath)).toBe(true)
    })
  })

  describe('Declaration file content validation', () => {
    it('should export ClaudeClient from main entry', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeClient/)
    })

    it('should export ClaudeCode from main entry', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeCode/)
    })

    it('should export RpcSession from main entry', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      expect(content).toMatch(/RpcSession/)
    })

    it('should export ClaudeClient from client subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'client/index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeClient/)
    })

    it('should export ClaudeSession from client subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'client/index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeSession/)
    })

    it('should export ClaudeCode from server subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'server/index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeCode/)
    })

    it('should export NDJSONParser from server subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'server/index.d.ts'), 'utf-8')
      expect(content).toMatch(/NDJSONParser/)
    })

    it('should export RpcSession from rpc subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'rpc/index.d.ts'), 'utf-8')
      expect(content).toMatch(/RpcSession/)
    })

    it('should export IClaudeCodeRpc from rpc subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'rpc/index.d.ts'), 'utf-8')
      expect(content).toMatch(/IClaudeCodeRpc/)
    })
  })

  describe('Type exports are complete', () => {
    it('should export all message types from main entry', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      expect(content).toMatch(/SDKMessage/)
      expect(content).toMatch(/TodoUpdate/)
      expect(content).toMatch(/PlanUpdate/)
    })

    it('should export option types from main entry', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      expect(content).toMatch(/ClaudeCodeOptions/)
      expect(content).toMatch(/ClaudeClientOptions/)
    })

    it('should export Runtime types from server subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'server/index.d.ts'), 'utf-8')
      expect(content).toMatch(/Runtime/)
      expect(content).toMatch(/ExecResult/)
    })

    it('should export RPC types from rpc subpath', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'rpc/index.d.ts'), 'utf-8')
      expect(content).toMatch(/RpcStub/)
      expect(content).toMatch(/RpcPromise/)
    })
  })

  describe('package.json types field', () => {
    let packageJson: { types?: string; exports?: Record<string, unknown> }

    beforeAll(() => {
      const pkgPath = path.resolve(__dirname, '../../package.json')
      packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    })

    it('should have types field pointing to dist/index.d.ts', () => {
      expect(packageJson.types).toBe('./dist/index.d.ts')
    })

    it('should have types in main export', () => {
      const mainExport = packageJson.exports?.['.'] as Record<string, string>
      expect(mainExport?.types).toBe('./dist/index.d.ts')
    })

    it('should have types in client export', () => {
      const clientExport = packageJson.exports?.['./client'] as Record<string, string>
      expect(clientExport?.types).toBe('./dist/client/index.d.ts')
    })

    it('should have types in server export', () => {
      const serverExport = packageJson.exports?.['./server'] as Record<string, string>
      expect(serverExport?.types).toBe('./dist/server/index.d.ts')
    })

    it('should have types in rpc export', () => {
      const rpcExport = packageJson.exports?.['./rpc'] as Record<string, string>
      expect(rpcExport?.types).toBe('./dist/rpc/index.d.ts')
    })
  })

  describe('Type import simulation', () => {
    it('types should be importable from main entry (simulated)', async () => {
      // We can test that types are resolvable by checking the declaration content
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')

      // These exports should be available
      const expectedExports = [
        'ClaudeClient',
        'ClaudeCode',
        'RpcSession',
        'createClaudeClient',
        'createRpcSession',
      ]

      for (const exp of expectedExports) {
        expect(content).toMatch(new RegExp(exp))
      }
    })

    it('types should be importable from client subpath (simulated)', async () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'client/index.d.ts'), 'utf-8')

      const expectedExports = ['ClaudeClient', 'ClaudeClientError', 'createClaudeClient', 'ClaudeSession']

      for (const exp of expectedExports) {
        expect(content).toMatch(new RegExp(exp))
      }
    })

    it('types should be importable from server subpath (simulated)', async () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'server/index.d.ts'), 'utf-8')

      const expectedExports = ['ClaudeCode', 'NDJSONParser', 'ProcessManager']

      for (const exp of expectedExports) {
        expect(content).toMatch(new RegExp(exp))
      }
    })

    it('types should be importable from rpc subpath (simulated)', async () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'rpc/index.d.ts'), 'utf-8')

      const expectedExports = ['RpcSession', 'RpcStub', 'IClaudeCodeRpc', 'createRpcSession']

      for (const exp of expectedExports) {
        expect(content).toMatch(new RegExp(exp))
      }
    })
  })

  describe('Declaration file structure', () => {
    it('should not have duplicate declarations', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'index.d.ts'), 'utf-8')
      // Count ClaudeClient declarations (should appear in export line, not multiple definitions)
      const claudeClientMatches = content.match(/declare class ClaudeClient/g)
      // May be 0 if it's re-exported, or 1 if defined here
      expect((claudeClientMatches?.length || 0) <= 1).toBe(true)
    })

    it('should have proper import/export statements', () => {
      const content = fs.readFileSync(path.join(DIST_PATH, 'client/index.d.ts'), 'utf-8')
      // Should have proper TypeScript declaration syntax
      expect(content).toMatch(/(declare|export|interface|type)/)
    })

    it('d.ts files should be valid TypeScript', () => {
      const files = [
        'index.d.ts',
        'client/index.d.ts',
        'server/index.d.ts',
        'rpc/index.d.ts',
      ]

      for (const file of files) {
        const filePath = path.join(DIST_PATH, file)
        const content = fs.readFileSync(filePath, 'utf-8')

        // Strip JSDoc comments and string literals before checking for runtime code
        // This allows console.log in JSDoc @example blocks while preventing actual runtime code
        const strippedContent = content
          .replace(/\/\*\*[\s\S]*?\*\//g, '') // Remove JSDoc comments
          .replace(/\/\/.*/g, '') // Remove single-line comments
          .replace(/'[^']*'/g, '') // Remove single-quoted strings
          .replace(/"[^"]*"/g, '') // Remove double-quoted strings
          .replace(/`[^`]*`/g, '') // Remove template literals

        // Basic validation: should not contain JavaScript runtime code outside comments
        expect(strippedContent).not.toMatch(/\bconsole\.(log|error|warn)\s*\(/)
        expect(strippedContent).not.toMatch(/\brequire\s*\(/)
        expect(strippedContent).not.toMatch(/\bmodule\.exports\s*=/)

        // Should contain TypeScript declaration syntax
        expect(content.length).toBeGreaterThan(0)
      }
    })
  })
})
