/**
 * @dotdo/claude - Configuration Types
 *
 * Session configuration types for ClaudeCode
 */

// ============================================================================
// Permission Modes
// ============================================================================

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

// ============================================================================
// MCP Server Configuration
// ============================================================================

export interface McpServerStdioConfig {
  type?: 'stdio'
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpServerSseConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
}

export interface McpServerHttpConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = McpServerStdioConfig | McpServerSseConfig | McpServerHttpConfig

// ============================================================================
// System Prompt Configuration
// ============================================================================

export interface SystemPromptPreset {
  type: 'preset'
  preset: 'claude_code'
  append?: string
}

export type SystemPromptConfig = string | SystemPromptPreset

// ============================================================================
// Tools Configuration
// ============================================================================

export interface ToolsPreset {
  type: 'preset'
  preset: 'claude_code'
}

export type ToolsConfig = string[] | ToolsPreset

// ============================================================================
// ClaudeCode Options
// ============================================================================

export interface ClaudeCodeOptions {
  // API configuration
  apiKey?: string
  model?: string
  fallbackModel?: string

  // Session options
  cwd?: string
  env?: Record<string, string>

  // Behavior configuration
  systemPrompt?: SystemPromptConfig
  tools?: ToolsConfig
  allowedTools?: string[]
  disallowedTools?: string[]

  // Permissions
  permissionMode?: PermissionMode
  allowDangerouslySkipPermissions?: boolean

  // Limits
  maxTurns?: number
  maxBudgetUsd?: number
  maxThinkingTokens?: number

  // MCP servers
  mcpServers?: Record<string, McpServerConfig>

  // Sandbox configuration
  sleepAfter?: number
  keepAlive?: boolean

  // Streaming options
  includePartialMessages?: boolean

  // Session management
  resume?: string
  continue?: boolean
  forkSession?: boolean
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session status
 */
export type SessionStatus = 'active' | 'completed' | 'error' | 'interrupted'

/**
 * Claude session state
 */
export interface ClaudeSession {
  id: string
  status: SessionStatus
  createdAt: string
  lastActivityAt: string

  // Configuration
  cwd: string
  model?: string
  systemPrompt?: SystemPromptConfig
  tools?: ToolsConfig
  permissionMode: PermissionMode
  maxTurns?: number

  // MCP servers
  mcpServers?: Array<{
    name: string
    config: McpServerConfig
    status?: 'connected' | 'failed' | 'needs-auth' | 'pending'
  }>

  // Runtime state
  turnCount: number
  totalCostUsd: number
  usage: {
    inputTokens: number
    outputTokens: number
  }

  // CLI session ID (for --resume)
  cliSessionId?: string

  // Environment (not serialized to storage)
  env?: Record<string, string>
}

// ============================================================================
// Client Options
// ============================================================================

export interface ClaudeClientOptions {
  /** RPC endpoint URL */
  url: string
  /** Use WebSocket (default) or HTTP batch mode */
  transport?: 'websocket' | 'http'
  /** Connection timeout in ms */
  timeout?: number
  /** Auto reconnect on disconnect (WebSocket only) */
  autoReconnect?: boolean
  /** Max reconnect attempts */
  maxReconnectAttempts?: number
  /** Callbacks for streaming events */
  callbacks?: StreamCallbackHandlers
}

/**
 * Callback handlers for streaming events
 */
export interface StreamCallbackHandlers {
  onMessage?: (message: import('./messages.js').SDKMessage) => void
  onTodoUpdate?: (update: import('./events.js').TodoUpdate) => void
  onPlanUpdate?: (update: import('./events.js').PlanUpdate) => void
  onToolUse?: (event: import('./events.js').ToolUseEvent) => void
  onError?: (error: { code: string; message: string }) => void
  onComplete?: (result: import('./messages.js').SDKResultMessage) => void
}

// ============================================================================
// Server Environment
// ============================================================================

/**
 * Cloudflare Workers environment bindings for ClaudeCode DO
 */
export interface ClaudeCodeEnv {
  /** Sandbox Durable Object namespace */
  Sandbox: DurableObjectNamespace
  /** Anthropic API key */
  ANTHROPIC_API_KEY?: string
  /** Optional KV namespace for session storage */
  SESSION_STORAGE?: KVNamespace
  /** Optional R2 bucket for message buffer */
  MESSAGE_BUFFER?: R2Bucket
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate ClaudeCode options (basic validation)
 */
export function validateOptions(options: unknown): ClaudeCodeOptions {
  if (!options || typeof options !== 'object') {
    throw new Error('Options must be an object')
  }
  return options as ClaudeCodeOptions
}

/**
 * Safe parse ClaudeCode options (returns undefined on failure)
 */
export function safeValidateOptions(options: unknown): ClaudeCodeOptions | undefined {
  try {
    return validateOptions(options)
  } catch {
    return undefined
  }
}
