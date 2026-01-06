/**
 * Runtime Adapters
 *
 * This module exports runtime adapters that wrap platform-specific implementations
 * and expose them through the generic Runtime interface.
 *
 * ## Subpath Exports
 *
 * For tree-shaking, you can import runtime adapters directly:
 *
 * | Subpath | Description |
 * |---------|-------------|
 * | `@dotdo/claude/runtimes` | All runtime adapters |
 * | `@dotdo/claude/bun` | Bun runtime only |
 * | `@dotdo/claude/cloudflare` | Cloudflare runtime only |
 * | `@dotdo/claude/node` | Node.js runtime only |
 *
 * @example Import all runtimes
 * ```typescript
 * import { createCloudflareRuntime } from '@dotdo/claude/runtimes'
 * ```
 *
 * @example Import specific runtime for tree-shaking
 * ```typescript
 * // Only imports Bun runtime code
 * import { BunRuntime } from '@dotdo/claude/bun'
 *
 * // Only imports Node runtime code
 * import { NodeRuntime } from '@dotdo/claude/node'
 *
 * // Only imports Cloudflare adapter code
 * import { CloudflareRuntimeAdapter } from '@dotdo/claude/cloudflare'
 * ```
 *
 * @module @dotdo/claude/runtimes
 */

// Cloudflare Runtime Adapter
export {
  createCloudflareRuntime,
  CloudflareRuntimeAdapter,
  CloudflareProcessAdapter,
} from './cloudflare.js'
