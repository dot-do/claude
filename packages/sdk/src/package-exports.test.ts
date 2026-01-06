/**
 * Package Exports Tests
 *
 * TDD tests for subpath exports configuration.
 * Tests that imports work from main export and subpath exports.
 *
 * @see https://nodejs.org/api/packages.html#subpath-exports
 * @issue claude-879.1 - Subpath exports
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// ============================================================================
// Types for package.json structure
// ============================================================================

interface ConditionalExport {
  types?: string
  import?: string
  require?: string
  bun?: string | ConditionalExport
  node?: string | ConditionalExport
  workerd?: string | ConditionalExport
  default?: string
}

interface PackageJson {
  name: string
  type?: string
  exports: Record<string, ConditionalExport>
}

// ============================================================================
// Helper to read package.json
// ============================================================================

async function getPackageJson(): Promise<PackageJson> {
  const pkgPath = path.resolve(__dirname, '../package.json')
  const content = await fs.readFile(pkgPath, 'utf-8')
  return JSON.parse(content)
}

describe('Package Exports', () => {
  describe('Main entry point (@dotdo/claude)', () => {
    it('should export ClaudeSession from main entry', async () => {
      // Import from main entry point
      const { ClaudeSession } = await import('./index.js')

      expect(ClaudeSession).toBeDefined()
      expect(typeof ClaudeSession).toBe('function')
    })

    it('should export ClaudeClient from main entry', async () => {
      const { ClaudeClient } = await import('./index.js')

      expect(ClaudeClient).toBeDefined()
      expect(typeof ClaudeClient).toBe('function')
    })

    it('should export type utilities from main entry', async () => {
      const { isTextBlock, isToolUseBlock } = await import('./index.js')

      expect(isTextBlock).toBeDefined()
      expect(isToolUseBlock).toBeDefined()
    })
  })

  describe('Bun runtime subpath (@dotdo/claude/bun)', () => {
    it('should export BunRuntime from bun subpath', async () => {
      // Import from bun subpath
      const { BunRuntime } = await import('./runtimes/bun.js')

      expect(BunRuntime).toBeDefined()
      expect(typeof BunRuntime).toBe('function')
    })

    it('should allow creating BunRuntime instances', async () => {
      const { BunRuntime } = await import('./runtimes/bun.js')

      // BunRuntime can be instantiated (though it will throw in non-Bun env)
      const runtime = new BunRuntime()
      expect(runtime).toBeInstanceOf(BunRuntime)
    })
  })

  describe('Cloudflare runtime subpath (@dotdo/claude/cloudflare)', () => {
    it('should export createCloudflareRuntime from cloudflare subpath', async () => {
      // Import from cloudflare subpath
      const { createCloudflareRuntime } = await import('./runtimes/cloudflare.js')

      expect(createCloudflareRuntime).toBeDefined()
      expect(typeof createCloudflareRuntime).toBe('function')
    })

    it('should export CloudflareRuntimeAdapter from cloudflare subpath', async () => {
      const { CloudflareRuntimeAdapter } = await import('./runtimes/cloudflare.js')

      expect(CloudflareRuntimeAdapter).toBeDefined()
      expect(typeof CloudflareRuntimeAdapter).toBe('function')
    })

    it('should export CloudflareProcessAdapter from cloudflare subpath', async () => {
      const { CloudflareProcessAdapter } = await import('./runtimes/cloudflare.js')

      expect(CloudflareProcessAdapter).toBeDefined()
      expect(typeof CloudflareProcessAdapter).toBe('function')
    })
  })

  describe('Node runtime subpath (@dotdo/claude/node)', () => {
    it('should export NodeRuntime from node subpath', async () => {
      // Import from node subpath
      const { NodeRuntime } = await import('./runtimes/node.js')

      expect(NodeRuntime).toBeDefined()
      expect(typeof NodeRuntime).toBe('function')
    })

    it('should allow creating NodeRuntime instances', async () => {
      const { NodeRuntime } = await import('./runtimes/node.js')

      const runtime = new NodeRuntime()
      expect(runtime).toBeInstanceOf(NodeRuntime)
    })

    it('should implement Runtime interface methods', async () => {
      const { NodeRuntime } = await import('./runtimes/node.js')

      const runtime = new NodeRuntime()

      // Check that all Runtime interface methods exist
      expect(typeof runtime.exec).toBe('function')
      expect(typeof runtime.startProcess).toBe('function')
      expect(typeof runtime.readFile).toBe('function')
      expect(typeof runtime.writeFile).toBe('function')
    })
  })

  describe('Types subpath (@dotdo/claude/types)', () => {
    it('should export message types from types subpath', async () => {
      const types = await import('./types/index.js')

      // Check some core types are exported
      expect(types).toHaveProperty('isTextBlock')
      expect(types).toHaveProperty('isToolUseBlock')
      expect(types).toHaveProperty('isToolResultBlock')
    })

    it('should export runtime types from types subpath', async () => {
      // Runtime types should be available
      const types = await import('./types/index.js')

      // Types are compile-time only, but the module should import successfully
      expect(types).toBeDefined()
    })
  })

  describe('Runtimes subpath (@dotdo/claude/runtimes)', () => {
    it('should export all runtime adapters from runtimes subpath', async () => {
      const runtimes = await import('./runtimes/index.js')

      // Cloudflare adapter exports
      expect(runtimes.createCloudflareRuntime).toBeDefined()
      expect(runtimes.CloudflareRuntimeAdapter).toBeDefined()
      expect(runtimes.CloudflareProcessAdapter).toBeDefined()
    })
  })

  describe('Client subpath (@dotdo/claude/client)', () => {
    it('should export ClaudeClient from client subpath', async () => {
      const { ClaudeClient } = await import('./client/index.js')

      expect(ClaudeClient).toBeDefined()
      expect(typeof ClaudeClient).toBe('function')
    })

    it('should export createClaudeClient from client subpath', async () => {
      const { createClaudeClient } = await import('./client/index.js')

      expect(createClaudeClient).toBeDefined()
      expect(typeof createClaudeClient).toBe('function')
    })

    it('should export ClaudeSession from client subpath', async () => {
      const { ClaudeSession } = await import('./client/index.js')

      expect(ClaudeSession).toBeDefined()
      expect(typeof ClaudeSession).toBe('function')
    })
  })

  describe('Server subpath (@dotdo/claude/server)', () => {
    it('should export ClaudeCode from server subpath', async () => {
      const { ClaudeCode } = await import('./server/index.js')

      expect(ClaudeCode).toBeDefined()
      expect(typeof ClaudeCode).toBe('function')
    })

    it('should export server utilities from server subpath', async () => {
      const server = await import('./server/index.js')

      expect(server.getSandbox).toBeDefined()
      expect(server.createClaudeServer).toBeDefined()
      expect(server.NDJSONParser).toBeDefined()
    })
  })

  describe('RPC subpath (@dotdo/claude/rpc)', () => {
    it('should export RPC utilities from rpc subpath', async () => {
      const rpc = await import('./rpc/index.js')

      expect(rpc.RpcSession).toBeDefined()
      expect(rpc.createRpcSession).toBeDefined()
      expect(rpc.newWebSocketRpcSession).toBeDefined()
    })

    it('should export RPC server utilities from rpc subpath', async () => {
      const rpc = await import('./rpc/index.js')

      expect(rpc.ClaudeCodeRpcServer).toBeDefined()
      expect(rpc.createRpcHandler).toBeDefined()
      expect(rpc.createRpcServer).toBeDefined()
    })
  })
})

// ============================================================================
// Conditional Exports Tests (package.json exports field validation)
// ============================================================================

describe('Package Conditional Exports', () => {
  let pkg: PackageJson

  beforeEach(async () => {
    pkg = await getPackageJson()
  })

  describe('exports field structure', () => {
    it('should have exports field defined', () => {
      expect(pkg.exports).toBeDefined()
      expect(typeof pkg.exports).toBe('object')
    })

    it('should have main entry point (.)', () => {
      expect(pkg.exports['.']).toBeDefined()
    })

    it('should have client subpath export', () => {
      expect(pkg.exports['./client']).toBeDefined()
    })

    it('should have server subpath export', () => {
      expect(pkg.exports['./server']).toBeDefined()
    })

    it('should have rpc subpath export', () => {
      expect(pkg.exports['./rpc']).toBeDefined()
    })

    it('should have types subpath export', () => {
      expect(pkg.exports['./types']).toBeDefined()
    })

    it('should have runtimes subpath export', () => {
      expect(pkg.exports['./runtimes']).toBeDefined()
    })

    it('should have bun subpath export', () => {
      expect(pkg.exports['./bun']).toBeDefined()
    })

    it('should have cloudflare subpath export', () => {
      expect(pkg.exports['./cloudflare']).toBeDefined()
    })

    it('should have node subpath export', () => {
      expect(pkg.exports['./node']).toBeDefined()
    })
  })

  describe('types conditions', () => {
    it('should have types condition for main entry', () => {
      const main = pkg.exports['.']
      expect(main.types).toBeDefined()
      expect(main.types).toMatch(/\.d\.ts$/)
    })

    it('should have types condition for client subpath', () => {
      const client = pkg.exports['./client']
      expect(client.types).toBeDefined()
      expect(client.types).toMatch(/\.d\.ts$/)
    })

    it('should have types condition for server subpath', () => {
      const server = pkg.exports['./server']
      expect(server.types).toBeDefined()
      expect(server.types).toMatch(/\.d\.ts$/)
    })

    it('should have types condition for rpc subpath', () => {
      const rpc = pkg.exports['./rpc']
      expect(rpc.types).toBeDefined()
      expect(rpc.types).toMatch(/\.d\.ts$/)
    })

    it('should have types listed before other conditions (for TypeScript)', () => {
      // TypeScript requires types to be first for proper resolution
      const main = pkg.exports['.']
      const keys = Object.keys(main)
      expect(keys[0]).toBe('types')
    })
  })

  describe('import conditions (ESM)', () => {
    it('should have import condition for main entry', () => {
      const main = pkg.exports['.']
      expect(main.import).toBeDefined()
      expect(main.import).toMatch(/\.(mjs|js)$/)
    })

    it('should have import condition for client subpath', () => {
      const client = pkg.exports['./client']
      expect(client.import).toBeDefined()
      expect(client.import).toMatch(/\.(mjs|js)$/)
    })

    it('should have import condition for server subpath', () => {
      const server = pkg.exports['./server']
      expect(server.import).toBeDefined()
      expect(server.import).toMatch(/\.(mjs|js)$/)
    })

    it('should have import condition for rpc subpath', () => {
      const rpc = pkg.exports['./rpc']
      expect(rpc.import).toBeDefined()
      expect(rpc.import).toMatch(/\.(mjs|js)$/)
    })
  })

  describe('require conditions (CommonJS)', () => {
    it('should have require condition for main entry', () => {
      const main = pkg.exports['.']
      expect(main.require).toBeDefined()
      expect(main.require).toMatch(/\.(cjs|js)$/)
    })

    it('should have require condition for client subpath', () => {
      const client = pkg.exports['./client']
      expect(client.require).toBeDefined()
      expect(client.require).toMatch(/\.(cjs|js)$/)
    })

    it('should have require condition for server subpath', () => {
      const server = pkg.exports['./server']
      expect(server.require).toBeDefined()
      expect(server.require).toMatch(/\.(cjs|js)$/)
    })

    it('should have require condition for rpc subpath', () => {
      const rpc = pkg.exports['./rpc']
      expect(rpc.require).toBeDefined()
      expect(rpc.require).toMatch(/\.(cjs|js)$/)
    })
  })

  describe('runtime subpath exports (short paths)', () => {
    it('should have ./bun subpath export', () => {
      expect(pkg.exports['./bun']).toBeDefined()
    })

    it('should have ./node subpath export', () => {
      expect(pkg.exports['./node']).toBeDefined()
    })

    it('should have ./cloudflare subpath export', () => {
      expect(pkg.exports['./cloudflare']).toBeDefined()
    })

    it('should have types for bun runtime export', () => {
      const bunExport = pkg.exports['./bun']
      expect(bunExport.types).toBeDefined()
      expect(bunExport.types).toMatch(/bun.*\.d\.ts$/)
    })

    it('should have types for node runtime export', () => {
      const nodeExport = pkg.exports['./node']
      expect(nodeExport.types).toBeDefined()
      expect(nodeExport.types).toMatch(/node.*\.d\.ts$/)
    })

    it('should have types for cloudflare runtime export', () => {
      const cfExport = pkg.exports['./cloudflare']
      expect(cfExport.types).toBeDefined()
      expect(cfExport.types).toMatch(/cloudflare.*\.d\.ts$/)
    })
  })

  describe('condition priority', () => {
    it('should have types before import/require for main entry', () => {
      const main = pkg.exports['.']
      const keys = Object.keys(main)
      const typesIndex = keys.indexOf('types')
      const importIndex = keys.indexOf('import')
      const requireIndex = keys.indexOf('require')

      expect(typesIndex).toBeLessThan(importIndex)
      expect(typesIndex).toBeLessThan(requireIndex)
    })

    it('should have import before require (ESM preference)', () => {
      const main = pkg.exports['.']
      const keys = Object.keys(main)
      const importIndex = keys.indexOf('import')
      const requireIndex = keys.indexOf('require')

      expect(importIndex).toBeLessThan(requireIndex)
    })
  })

  describe('dist path validation', () => {
    it('should point to dist directory for main entry', () => {
      const main = pkg.exports['.']
      expect(main.types).toMatch(/^\.\/dist\//)
      expect(main.import).toMatch(/^\.\/dist\//)
      expect(main.require).toMatch(/^\.\/dist\//)
    })

    it('should point to dist/client for client subpath', () => {
      const client = pkg.exports['./client']
      expect(client.types).toMatch(/^\.\/dist\/client\//)
      expect(client.import).toMatch(/^\.\/dist\/client\//)
      expect(client.require).toMatch(/^\.\/dist\/client\//)
    })

    it('should point to dist/server for server subpath', () => {
      const server = pkg.exports['./server']
      expect(server.types).toMatch(/^\.\/dist\/server\//)
      expect(server.import).toMatch(/^\.\/dist\/server\//)
      expect(server.require).toMatch(/^\.\/dist\/server\//)
    })

    it('should point to dist/rpc for rpc subpath', () => {
      const rpc = pkg.exports['./rpc']
      expect(rpc.types).toMatch(/^\.\/dist\/rpc\//)
      expect(rpc.import).toMatch(/^\.\/dist\/rpc\//)
      expect(rpc.require).toMatch(/^\.\/dist\/rpc\//)
    })

    it('should point to dist/runtimes for runtime subpaths', () => {
      const bun = pkg.exports['./bun']
      const node = pkg.exports['./node']
      const cf = pkg.exports['./cloudflare']

      expect(bun.types).toMatch(/^\.\/dist\/runtimes\//)
      expect(node.types).toMatch(/^\.\/dist\/runtimes\//)
      expect(cf.types).toMatch(/^\.\/dist\/runtimes\//)
    })
  })

  describe('runtime import conditions', () => {
    it('bun runtime subpath should have import condition', () => {
      const bunExport = pkg.exports['./bun']
      expect(bunExport.import).toBeDefined()
      expect(bunExport.import).toMatch(/bun/)
    })

    it('node runtime subpath should have import condition', () => {
      const nodeExport = pkg.exports['./node']
      expect(nodeExport.import).toBeDefined()
      expect(nodeExport.import).toMatch(/node/)
    })

    it('cloudflare runtime subpath should have import condition', () => {
      const cfExport = pkg.exports['./cloudflare']
      expect(cfExport.import).toBeDefined()
      expect(cfExport.import).toMatch(/cloudflare/)
    })
  })

  describe('runtimes aggregated subpath', () => {
    it('should have ./runtimes subpath for all runtime adapters', () => {
      expect(pkg.exports['./runtimes']).toBeDefined()
    })

    it('runtimes subpath should have proper conditions', () => {
      const runtimes = pkg.exports['./runtimes']
      expect(runtimes.types).toBeDefined()
      expect(runtimes.import).toBeDefined()
      expect(runtimes.require).toBeDefined()
    })
  })
})
