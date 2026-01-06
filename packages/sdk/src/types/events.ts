/**
 * @dotdo/claude - Event Types
 *
 * Types for real-time event streaming (todo updates, plan updates, etc.)
 */

// ============================================================================
// Todo Events
// ============================================================================

/**
 * Todo item status
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed'

/**
 * Single todo item (matches TodoWrite tool input)
 */
export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm: string
}

/**
 * Todo update event - emitted when TodoWrite tool is used
 */
export interface TodoUpdate {
  todos: TodoItem[]
  timestamp: string
  messageUuid?: string
  sessionId?: string
}

// ============================================================================
// Plan Events
// ============================================================================

/**
 * Plan update event - emitted when ExitPlanMode tool is used or plan file changes
 */
export interface PlanUpdate {
  plan: string
  planFile?: string
  timestamp: string
  messageUuid?: string
  sessionId?: string
}

// ============================================================================
// Tool Events
// ============================================================================

/**
 * Tool use event - emitted when any tool is called
 */
export interface ToolUseEvent {
  id: string
  name: string
  input: unknown
  timestamp: string
  sessionId?: string
}

/**
 * Tool result event - emitted when tool execution completes
 */
export interface ToolResultEvent {
  tool_use_id: string
  content: unknown
  is_error: boolean
  timestamp: string
  sessionId?: string
}

// ============================================================================
// Output Events
// ============================================================================

/**
 * Output event types
 */
export type OutputType = 'text' | 'tool_use' | 'tool_result' | 'status' | 'error'

/**
 * Generic output event
 */
export interface OutputEvent {
  type: OutputType
  content: unknown
  timestamp: string
  sessionId?: string
}

// ============================================================================
// Session Events
// ============================================================================

/**
 * Session created event
 */
export interface SessionCreatedEvent {
  sessionId: string
  timestamp: string
}

/**
 * Session status changed event
 */
export interface SessionStatusEvent {
  sessionId: string
  status: 'active' | 'completed' | 'error' | 'interrupted'
  timestamp: string
}

/**
 * Session destroyed event
 */
export interface SessionDestroyedEvent {
  sessionId: string
  timestamp: string
}

// ============================================================================
// Event Union Types
// ============================================================================

/**
 * All session-related events
 */
export type SessionEvent =
  | SessionCreatedEvent
  | SessionStatusEvent
  | SessionDestroyedEvent

/**
 * All tool-related events
 */
export type ToolEvent = ToolUseEvent | ToolResultEvent

/**
 * Callback function types for event subscriptions
 */
export type TodoUpdateCallback = (update: TodoUpdate) => void
export type PlanUpdateCallback = (update: PlanUpdate) => void
export type OutputCallback = (event: OutputEvent) => void
export type ToolUseCallback = (event: ToolUseEvent) => void
export type ToolResultCallback = (event: ToolResultEvent) => void
