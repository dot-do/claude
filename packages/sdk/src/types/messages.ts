/**
 * @dotdo/claude - CLI Streaming Message Types
 *
 * Types for Claude Code CLI `--output-format stream-json` NDJSON output
 */

// ============================================================================
// Content Blocks
// ============================================================================

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
  is_error?: boolean
}

export interface ImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock

// ============================================================================
// SDK Message Types (matching CLI stream-json output)
// ============================================================================

/**
 * Assistant message with text or tool use
 */
export interface SDKAssistantMessage {
  type: 'assistant'
  uuid: string
  session_id: string
  message: {
    role: 'assistant'
    content: Array<TextBlock | ToolUseBlock>
  }
  parent_tool_use_id: string | null
}

/**
 * User message (tool results or user input)
 */
export interface SDKUserMessage {
  type: 'user'
  uuid?: string
  session_id: string
  message: {
    role: 'user'
    content: string | Array<TextBlock | ToolResultBlock | ImageBlock>
  }
  parent_tool_use_id: string | null
}

/**
 * System init message - sent at start of session
 */
export interface SDKSystemInitMessage {
  type: 'system'
  subtype: 'init'
  uuid: string
  session_id: string
  apiKeySource?: string
  cwd: string
  tools: string[]
  mcp_servers?: Array<{ name: string; status: string }>
  model: string
  permissionMode: string
  slash_commands?: string[]
  output_style?: string
}

/**
 * System compact boundary message
 */
export interface SDKSystemCompactMessage {
  type: 'system'
  subtype: 'compact_boundary'
  uuid: string
  session_id: string
  compact_metadata: {
    trigger: 'manual' | 'auto'
    pre_tokens: number
  }
}

export type SDKSystemMessage = SDKSystemInitMessage | SDKSystemCompactMessage

/**
 * Model usage statistics
 */
export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
}

/**
 * Result message subtypes
 */
export type ResultSubtype =
  | 'success'
  | 'error_max_turns'
  | 'error_during_execution'
  | 'error_max_budget_usd'
  | 'error_max_structured_output_retries'

/**
 * Result message - sent at end of query
 */
export interface SDKResultMessage {
  type: 'result'
  subtype: ResultSubtype
  uuid: string
  session_id: string
  duration_ms: number
  duration_api_ms: number
  is_error: boolean
  num_turns: number
  total_cost_usd: number
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
  // Success-specific fields
  result?: string
  structured_output?: unknown
  // Error-specific fields
  errors?: string[]
  permission_denials?: Array<{
    tool_name: string
    tool_use_id: string
    tool_input: unknown
  }>
  modelUsage?: Record<string, ModelUsage>
}

/**
 * Partial/streaming message (when --include-partial-messages is used)
 */
export interface SDKPartialMessage {
  type: 'stream_event'
  event: unknown // Raw Anthropic stream event
  parent_tool_use_id: string | null
  uuid: string
  session_id: string
}

/**
 * Union of all SDK message types
 */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKSystemMessage
  | SDKResultMessage
  | SDKPartialMessage

/**
 * Alias for backward compatibility
 */
export type StreamMessage = SDKMessage

// ============================================================================
// Model Types
// ============================================================================

export interface ModelInfo {
  value: string
  displayName: string
  description: string
}

export interface McpServerStatus {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending'
  serverInfo?: {
    name: string
    version: string
  }
}

// ============================================================================
// Type Guards
// ============================================================================
// Note: Full-validation type guards are in guards.ts
// These are re-exported from guards.ts via index.ts
