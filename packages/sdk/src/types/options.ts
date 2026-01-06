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
 * Session error details
 */
export interface SessionError {
  /** Error message */
  message: string
  /** Error code for programmatic handling */
  code?: string
  /** When the error occurred */
  timestamp: string
  /** Stack trace (only in development) */
  stack?: string
}

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

  // Error details (populated when status is 'error')
  error?: SessionError
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
 * Validation mode for unknown fields:
 * - 'strict': Throw an error on unknown fields
 * - 'warn': Log a warning but allow (default)
 * - 'silent': Silently ignore unknown fields
 */
export type ValidationMode = 'strict' | 'warn' | 'silent'

/**
 * Validation options
 */
export interface ValidationOptions {
  /** How to handle unknown fields (default: 'warn') */
  mode?: ValidationMode
}

/**
 * All known fields in ClaudeCodeOptions
 */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  // API configuration
  'apiKey',
  'model',
  'fallbackModel',

  // Session options
  'cwd',
  'env',

  // Behavior configuration
  'systemPrompt',
  'tools',
  'allowedTools',
  'disallowedTools',

  // Permissions
  'permissionMode',
  'allowDangerouslySkipPermissions',

  // Limits
  'maxTurns',
  'maxBudgetUsd',
  'maxThinkingTokens',

  // MCP servers
  'mcpServers',

  // Sandbox configuration
  'sleepAfter',
  'keepAlive',

  // Streaming options
  'includePartialMessages',

  // Session management
  'resume',
  'continue',
  'forkSession',
])

/**
 * Pattern to detect path traversal attacks.
 * Matches: ../, ..\, or paths starting with ..
 */
const PATH_TRAVERSAL_PATTERN = /(?:^|[/\\])\.\.(?:[/\\]|$)|^\.\./

/**
 * Pattern for valid model identifiers.
 * Only alphanumeric, hyphens, underscores, and dots are allowed.
 */
const VALID_MODEL_PATTERN = /^[a-zA-Z0-9._-]+$/

/**
 * Validate ClaudeCodeOptions at runtime.
 * @param options - The options object to validate
 * @param validationOptions - How to handle validation (default: warn on unknown)
 * @throws Error if options are invalid
 * @returns The validated options (may add defaults)
 */
export function validateOptions(
  options: unknown,
  validationOptions: ValidationOptions = {}
): ClaudeCodeOptions {
  const { mode = 'warn' } = validationOptions

  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Options must be an object')
  }

  const opts = options as Record<string, unknown>

  // Check for unknown fields
  const unknownFields = Object.keys(opts).filter((key) => !KNOWN_FIELDS.has(key))
  if (unknownFields.length > 0) {
    const knownFieldsList = Array.from(KNOWN_FIELDS).sort().join(', ')
    const message =
      unknownFields.length === 1
        ? `Unknown option: '${unknownFields[0]}'. Valid options are: ${knownFieldsList}`
        : `Unknown options: '${unknownFields.join("', '")}'. Valid options are: ${knownFieldsList}`

    if (mode === 'strict') {
      throw new Error(message)
    } else if (mode === 'warn') {
      console.warn(message)
    }
    // 'silent' mode: do nothing
  }

  // Validate maxTurns if provided
  if (opts.maxTurns !== undefined) {
    if (typeof opts.maxTurns !== 'number' || opts.maxTurns <= 0) {
      throw new Error('maxTurns must be a positive number')
    }
  }

  // Validate maxBudgetUsd if provided
  if (opts.maxBudgetUsd !== undefined) {
    if (typeof opts.maxBudgetUsd !== 'number' || opts.maxBudgetUsd <= 0) {
      throw new Error('maxBudgetUsd must be a positive number')
    }
  }

  // Validate cwd if provided
  if (opts.cwd !== undefined) {
    if (typeof opts.cwd !== 'string') {
      throw new Error('cwd must be a string')
    }
    // Check for path traversal attacks
    if (PATH_TRAVERSAL_PATTERN.test(opts.cwd)) {
      throw new Error(
        "cwd contains path traversal ('..') which is not allowed for security reasons"
      )
    }
  }

  // Validate model if provided
  if (opts.model !== undefined) {
    if (typeof opts.model !== 'string') {
      throw new Error('model must be a string')
    }
    // Check for invalid characters (shell injection prevention)
    if (!VALID_MODEL_PATTERN.test(opts.model)) {
      throw new Error(
        'model contains invalid characters. Only alphanumeric characters, hyphens, underscores, and dots are allowed.'
      )
    }
  }

  // Validate fallbackModel if provided (same rules as model)
  if (opts.fallbackModel !== undefined) {
    if (typeof opts.fallbackModel !== 'string') {
      throw new Error('fallbackModel must be a string')
    }
    if (!VALID_MODEL_PATTERN.test(opts.fallbackModel)) {
      throw new Error(
        'fallbackModel contains invalid characters. Only alphanumeric characters, hyphens, underscores, and dots are allowed.'
      )
    }
  }

  // Validate permissionMode if provided
  const validModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan']
  if (opts.permissionMode !== undefined && !validModes.includes(opts.permissionMode as string)) {
    throw new Error(`permissionMode must be one of: ${validModes.join(', ')}`)
  }

  return opts as ClaudeCodeOptions
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
