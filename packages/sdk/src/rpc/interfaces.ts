/**
 * @dotdo/claude - RPC Interface Definitions
 *
 * Type definitions for capnweb RPC server and client
 */

import type { RpcTarget } from 'capnweb'
import type {
  SDKMessage,
  SDKResultMessage,
  ModelInfo,
  McpServerStatus,
} from '../types/messages.js'
import type { TodoUpdate, PlanUpdate } from '../types/events.js'
import type { ClaudeCodeOptions, ClaudeSession, PermissionMode } from '../types/options.js'

/**
 * RPC interface definition for ClaudeCode Durable Object
 *
 * This interface matches the Claude Agent SDK API surface
 */
export interface IClaudeCodeRpc {
  // Session management
  createSession(options?: ClaudeCodeOptions): Promise<ClaudeSession>
  getSession(sessionId: string): Promise<ClaudeSession | null>
  resumeSession(sessionId: string): Promise<ClaudeSession>
  listSessions(): Promise<ClaudeSession[]>
  destroySession(sessionId: string): Promise<void>

  // Messaging (Baseline #1 - interactive input)
  sendMessage(sessionId: string, message: string): Promise<void>

  // Control
  interrupt(sessionId: string): Promise<void>
  setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void>

  // Info
  supportedModels(): Promise<ModelInfo[]>
  mcpServerStatus(sessionId: string): Promise<McpServerStatus[]>
}

/**
 * Streaming callback interface (for bidirectional RPC)
 *
 * Cap'n Web supports passing functions by reference,
 * enabling server-to-client callbacks
 */
export interface IStreamCallbacks extends RpcTarget {
  /**
   * Called for each message from Claude
   */
  onMessage(message: SDKMessage): void

  /**
   * Called when todo list is updated
   */
  onTodoUpdate(update: TodoUpdate): void

  /**
   * Called when plan is updated
   */
  onPlanUpdate(update: PlanUpdate): void

  /**
   * Called on error
   */
  onError(error: { code: string; message: string }): void

  /**
   * Called when query completes
   */
  onComplete(result: SDKResultMessage): void
}

/**
 * Extended RPC interface with callback support
 */
export interface IClaudeCodeRpcWithCallbacks extends IClaudeCodeRpc {
  /**
   * Send message with streaming callbacks
   */
  sendMessageWithCallbacks(
    sessionId: string,
    message: string,
    callbacks: IStreamCallbacks
  ): Promise<void>

  /**
   * One-shot query with callbacks
   */
  queryWithCallbacks(
    prompt: string,
    options: Partial<ClaudeCodeOptions>,
    callbacks: IStreamCallbacks
  ): Promise<string>
}

/**
 * Session info for listing
 */
export interface SessionInfo {
  id: string
  status: string
  createdAt: string
  lastActivityAt: string
  turnCount: number
  totalCostUsd: number
}

/**
 * Query result
 */
export interface QueryResult {
  sessionId: string
  result: string
  usage: {
    inputTokens: number
    outputTokens: number
  }
  costUsd: number
  durationMs: number
}

/**
 * Error codes
 */
export const ErrorCodes = {
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_TIMEOUT: 'SESSION_TIMEOUT',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  PROCESS_ERROR: 'PROCESS_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  INVALID_INPUT: 'INVALID_INPUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * RPC Error class
 */
export class RpcError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: unknown
  ) {
    super(message)
    this.name = 'RpcError'
  }
}
