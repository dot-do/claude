/**
 * @dotdo/claude SDK Types
 *
 * Core type definitions for Claude Code SDK
 */

// Re-export all message types
export * from './messages.js'

// Re-export all event types
export * from './events.js'

// Re-export all option types
export * from './options.js'

// Re-export all type guards
export * from './guards.js'

// Re-export sandbox types
export * from './sandbox.js'

// ============================================================================
// Legacy Types (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use SessionStatus from options.ts instead
 */
export type LegacySessionStatus = 'pending' | 'active' | 'completed' | 'failed'

/**
 * @deprecated Use ClaudeSession from options.ts instead
 */
export interface Session {
  id: string
  userId: string
  repo?: string
  task?: string
  status: LegacySessionStatus
  createdAt: string
  updatedAt: string
}

/**
 * Message role enum
 */
export type MessageRole = 'user' | 'assistant' | 'system'

/**
 * Code block type
 */
export interface CodeBlock {
  type: 'code'
  language: string
  code: string
}

/**
 * @deprecated Use ContentBlock from messages.ts instead
 */
export type LegacyContentBlock =
  | import('./messages.js').TextBlock
  | CodeBlock
  | import('./messages.js').ToolUseBlock
  | import('./messages.js').ToolResultBlock

/**
 * Message in a session conversation
 */
export interface Message {
  id: string
  sessionId: string
  role: MessageRole
  content: LegacyContentBlock[]
  createdAt: string
}

/**
 * File tree node
 */
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: string
  children?: FileNode[]
}

/**
 * File content response
 */
export interface FileContent {
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
  size: number
}

/**
 * Diff hunk
 */
export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

/**
 * File diff
 */
export interface FileDiff {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  hunks: DiffHunk[]
}

/**
 * Session diff response
 */
export interface SessionDiff {
  sessionId: string
  files: FileDiff[]
  stats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

/**
 * Search result
 */
export interface SearchResult {
  path: string
  line: number
  column: number
  match: string
  context: {
    before: string[]
    after: string[]
  }
}

/**
 * Event types for SSE streaming
 */
export type EventType =
  | 'session.created'
  | 'session.updated'
  | 'session.completed'
  | 'message.created'
  | 'message.delta'
  | 'message.completed'
  | 'file.changed'
  | 'terminal.output'
  | 'error'

/**
 * SSE Event
 */
export interface StreamEvent<T = unknown> {
  id: string
  type: EventType
  data: T
  timestamp: string
}

/**
 * Claude configuration
 */
export interface ClaudeConfig {
  apiKey?: string
  oauthToken?: string
  baseUrl?: string
  timeout?: number
}

/**
 * Server configuration for sandbox
 */
export interface ServerConfig extends ClaudeConfig {
  directory: string
  port?: number
}

/**
 * API error response
 */
export interface ApiError {
  error: string
  message?: string
  errorId?: string
  details?: unknown
}
