/**
 * @dotdo/claude SDK
 *
 * SDK for Claude Code - provides typed client, Cloudflare Durable Object,
 * and capnweb RPC integration for building Claude Code-powered applications.
 *
 * ## Subpath Exports
 *
 * This package supports multiple subpath exports for tree-shaking and
 * runtime-specific imports:
 *
 * | Subpath | Description |
 * |---------|-------------|
 * | `@dotdo/claude` | Main entry - all exports |
 * | `@dotdo/claude/client` | Client-side SDK |
 * | `@dotdo/claude/server` | Server-side SDK (Cloudflare Workers) |
 * | `@dotdo/claude/rpc` | RPC utilities (capnweb) |
 * | `@dotdo/claude/types` | TypeScript types only |
 * | `@dotdo/claude/runtimes` | All runtime adapters |
 * | `@dotdo/claude/bun` | Bun runtime |
 * | `@dotdo/claude/cloudflare` | Cloudflare runtime |
 * | `@dotdo/claude/node` | Node.js runtime |
 *
 * @example Browser/Client usage
 * ```ts
 * import { ClaudeClient, createClaudeClient } from '@dotdo/claude'
 *
 * const claude = createClaudeClient({
 *   url: 'wss://claude.example.com/rpc',
 *   callbacks: {
 *     onTodoUpdate: (update) => console.log('Todos:', update.todos),
 *     onPlanUpdate: (update) => console.log('Plan:', update.plan),
 *   }
 * })
 *
 * const session = await claude.createSession({ cwd: '/workspace' })
 *
 * // Interactive input (Baseline #1)
 * await claude.sendMessage(session.id, 'Build a todo app')
 * await claude.sendMessage(session.id, 'Use TypeScript please')
 * ```
 *
 * @example Cloudflare Worker/Durable Object usage
 * ```ts
 * import { ClaudeCode } from '@dotdo/claude/server'
 *
 * export { ClaudeCode }
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const id = env.CLAUDE_CODE.idFromName('default')
 *     const stub = env.CLAUDE_CODE.get(id)
 *     return stub.fetch(request)
 *   }
 * }
 * ```
 *
 * @example RPC usage with capnweb
 * ```ts
 * import { newWebSocketRpcSession, type IClaudeCodeRpc } from '@dotdo/claude/rpc'
 *
 * const session = newWebSocketRpcSession<IClaudeCodeRpc>('wss://claude.example.com/rpc')
 * const stub = await session.connect()
 *
 * const claudeSession = await stub.createSession({ cwd: '/workspace' })
 * await stub.sendMessage(claudeSession.id, 'Hello!')
 * ```
 *
 * @example Runtime-specific imports
 * ```ts
 * // Import only what you need for your runtime
 * import { BunRuntime } from '@dotdo/claude/bun'
 * import { NodeRuntime } from '@dotdo/claude/node'
 * import { CloudflareRuntimeAdapter } from '@dotdo/claude/cloudflare'
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Re-export types
// ============================================================================
export * from './types/index.js'

// ============================================================================
// Re-export client
// ============================================================================
export { ClaudeClient, ClaudeClientError, createClaudeClient, ClaudeSession, ReconnectionPolicy } from './client/index.js'
export type {
  CreateSessionOptions,
  SendMessageOptions,
  ListFilesOptions,
  SearchOptions,
  ClaudeSessionOptions,
  ClaudeSessionStatus,
  ReconnectionOptions,
} from './client/index.js'

// ============================================================================
// Re-export server helpers (for Cloudflare Workers)
// ============================================================================
export {
  ClaudeCode,
  getSandbox,
  createClaudeServer,
  proxyToClaude,
  cloneRepository,
  NDJSONParser,
  ProcessManager,
  buildCliArgs,
  extractTodoUpdates,
  extractPlanUpdates,
  extractToolUses,
  extractResult,
  extractSessionId,
  isComplete,
  hasError,
} from './server/index.js'
export type {
  ClaudeServer,
  // Generic Runtime types (from runtime.ts)
  Runtime,
  RuntimeProcess,
  ExecResult,
  ExecOptions,
  ProcessOptions,
  // Cloudflare types (preferred naming)
  CloudflareRuntime,
  CloudflareProcess,
  CloudflareNamespace,
  // Deprecated Sandbox types (backward compat)
  Sandbox,
  SandboxProcess,
  SandboxNamespace,
} from './server/index.js'
export { isExecResult } from './server/index.js'

// ============================================================================
// Re-export RPC helpers
// ============================================================================
export {
  RpcTarget,
  RpcSession,
  createRpcSession,
  newWebSocketRpcSession,
  ClaudeCodeRpcServer,
  createRpcHandler,
  createRpcServer,
  RpcError,
  RpcTimeoutError,
  ErrorCodes,
} from './rpc/index.js'
export type {
  RpcStub,
  RpcPromise,
  RpcSessionOptions,
  RpcSessionState,
  ClaudeSandboxRpc,
  IClaudeCodeRpc,
  IClaudeCodeRpcWithCallbacks,
  IStreamCallbacks,
  SessionInfo,
  QueryResult,
  ErrorCode,
} from './rpc/index.js'

// ============================================================================
// Re-export event emitter
// ============================================================================
export { TypedEventEmitter, EventKeys, sessionEvent, getGlobalEmitter, resetGlobalEmitter } from './events/emitter.js'

// ============================================================================
// Re-export terminal proxy
// ============================================================================
export { TerminalProxy, createTerminalProxy, ConnectionState } from './terminal/websocket-proxy.js'
export type { XtermInput, XtermOutput, TerminalProxyOptions, ConnectionStateCallback } from './terminal/websocket-proxy.js'

// ============================================================================
// Re-export authentication middleware
// ============================================================================
export {
  AuthMiddleware,
  createAuthMiddleware,
  ApiKeyAuthenticator,
  JwtAuthenticator,
  RateLimiter,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
} from './middleware/index.js'
export type {
  JwtAlgorithm,
  JwtConfig,
  RateLimitConfig,
  RateLimitStorage,
  ApiKeyValidator,
  ApiKeyValidationResult,
  JwtValidationResult,
  AuthConfig,
  AuthResult,
  RateLimitResult,
  NextFunction,
} from './middleware/index.js'

// ============================================================================
// Re-export file operations
// ============================================================================
export { readFile, writeFile, listFiles } from './utils/file-ops.js'

// ============================================================================
// Re-export runtime adapters
// ============================================================================
export {
  createCloudflareRuntime,
  CloudflareRuntimeAdapter,
  CloudflareProcessAdapter,
} from './runtimes/index.js'
