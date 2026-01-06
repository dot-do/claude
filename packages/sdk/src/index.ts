/**
 * @dotdo/claude SDK
 *
 * SDK for Claude Code - provides typed client, Cloudflare Durable Object,
 * and capnweb RPC integration for building Claude Code-powered applications.
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
 * @packageDocumentation
 */

// ============================================================================
// Re-export types
// ============================================================================
export * from './types/index.js'

// ============================================================================
// Re-export client
// ============================================================================
export { ClaudeClient, ClaudeClientError, createClaudeClient } from './client/index.js'
export type { CreateSessionOptions, SendMessageOptions, ListFilesOptions, SearchOptions } from './client/index.js'

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
export type { ClaudeServer, Sandbox, SandboxNamespace } from './server/index.js'

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
export { TerminalProxy, createTerminalProxy } from './terminal/websocket-proxy.js'
export type { XtermInput, XtermOutput, TerminalProxyOptions } from './terminal/websocket-proxy.js'
