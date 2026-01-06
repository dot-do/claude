import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKSystemMessage,
  SDKResultMessage,
  SDKPartialMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ResultSubtype
} from './messages.js'

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Valid result subtypes for SDKResultMessage validation.
 */
const VALID_RESULT_SUBTYPES: readonly ResultSubtype[] = [
  'success',
  'error_max_turns',
  'error_during_execution',
  'error_max_budget_usd',
  'error_max_structured_output_retries'
] as const

/**
 * Checks if a value is a non-null object.
 * @param value - The value to check
 * @returns True if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Checks if an object has a specific property with a string value.
 * @param obj - The object to check
 * @param key - The property key to check for
 * @returns True if the property exists and is a string
 */
function hasStringProperty(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string'
}

/**
 * Checks if an object has required fields with expected types.
 * @param obj - The object to validate
 * @param fields - Map of field names to expected types or validator functions
 * @returns True if all required fields exist with correct types
 */
function hasRequiredFields(
  obj: Record<string, unknown>,
  fields: Record<string, 'string' | 'object' | 'array' | ((val: unknown) => boolean)>
): boolean {
  for (const [key, validator] of Object.entries(fields)) {
    const value = obj[key]
    if (typeof validator === 'function') {
      if (!validator(value)) return false
    } else if (validator === 'string') {
      if (typeof value !== 'string') return false
    } else if (validator === 'object') {
      if (!isObject(value)) return false
    } else if (validator === 'array') {
      if (!Array.isArray(value)) return false
    }
  }
  return true
}

// ============================================================================
// Message Type Guards
// ============================================================================

/**
 * Type guard for assistant messages.
 *
 * Validates that the message:
 * - Has type 'assistant'
 * - Contains a message object with role 'assistant' and content array
 * - Has required session_id field
 *
 * @param msg - The SDK message to check
 * @returns True if msg is a valid SDKAssistantMessage
 *
 * @example
 * ```typescript
 * if (isAssistantMessage(msg)) {
 *   // msg.message.content is now typed as Array<TextBlock | ToolUseBlock>
 *   console.log(msg.message.content);
 * }
 * ```
 */
export function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  if (msg.type !== 'assistant') return false

  const record = msg as unknown as Record<string, unknown>

  // Check session_id exists
  if (!hasStringProperty(record, 'session_id')) return false

  // Check message object exists
  const message = record['message']
  if (!isObject(message)) return false

  // Check message.role is 'assistant'
  if (message['role'] !== 'assistant') return false

  // Check message.content is an array
  if (!Array.isArray(message['content'])) return false

  return true
}

/**
 * Type guard for user messages.
 *
 * Validates that the message:
 * - Has type 'user'
 * - Contains a message object with role 'user' and content (string or array)
 * - Has required session_id field
 *
 * @param msg - The SDK message to check
 * @returns True if msg is a valid SDKUserMessage
 *
 * @example
 * ```typescript
 * if (isUserMessage(msg)) {
 *   // msg.message.content is now typed as string | Array<...>
 *   console.log(msg.message.content);
 * }
 * ```
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  if (msg.type !== 'user') return false

  const record = msg as unknown as Record<string, unknown>

  // Check session_id exists
  if (!hasStringProperty(record, 'session_id')) return false

  // Check message object exists
  const message = record['message']
  if (!isObject(message)) return false

  // Check message.role is 'user'
  if (message['role'] !== 'user') return false

  // Check message.content is a string or array (user messages support both)
  const content = message['content']
  if (typeof content !== 'string' && !Array.isArray(content)) return false

  return true
}

/**
 * Type guard for result messages.
 *
 * Validates that the message:
 * - Has type 'result'
 * - Has a valid subtype (success, error_max_turns, etc.)
 * - Has required session_id and usage fields
 *
 * @param msg - The SDK message to check
 * @returns True if msg is a valid SDKResultMessage
 *
 * @example
 * ```typescript
 * if (isResultMessage(msg)) {
 *   // msg.usage is now typed with input_tokens, output_tokens, etc.
 *   console.log(msg.usage.input_tokens);
 * }
 * ```
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  if (msg.type !== 'result') return false

  const record = msg as unknown as Record<string, unknown>

  // Check subtype is valid
  const subtype = record['subtype']
  if (typeof subtype !== 'string' || !VALID_RESULT_SUBTYPES.includes(subtype as ResultSubtype)) {
    return false
  }

  // Check session_id exists
  if (!hasStringProperty(record, 'session_id')) return false

  // Check usage object exists
  const usage = record['usage']
  if (!isObject(usage)) return false

  return true
}

/**
 * Type guard for system messages (init, compact_boundary).
 *
 * Validates that the message:
 * - Has type 'system'
 * - Has a valid subtype ('init' or 'compact_boundary')
 * - Has required session_id field
 *
 * @param msg - The SDK message to check
 * @returns True if msg is a valid SDKSystemMessage
 *
 * @example
 * ```typescript
 * if (isSystemMessage(msg)) {
 *   // msg.subtype is now typed as 'init' | 'compact_boundary'
 *   console.log(msg.subtype);
 * }
 * ```
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  if (msg.type !== 'system') return false

  const record = msg as unknown as Record<string, unknown>

  // Check subtype is valid ('init' or 'compact_boundary')
  const subtype = record['subtype']
  if (subtype !== 'init' && subtype !== 'compact_boundary') return false

  // Check session_id exists
  if (!hasStringProperty(record, 'session_id')) return false

  return true
}

/**
 * Type guard for partial/streaming messages.
 *
 * Validates that the message:
 * - Has type 'stream_event'
 * - Has required session_id field
 *
 * @param msg - The SDK message to check
 * @returns True if msg is a valid SDKPartialMessage
 *
 * @example
 * ```typescript
 * if (isPartialMessage(msg)) {
 *   // msg.event contains raw Anthropic stream event
 *   console.log(msg.event);
 * }
 * ```
 */
export function isPartialMessage(msg: SDKMessage): msg is SDKPartialMessage {
  if (msg.type !== 'stream_event') return false

  const record = msg as unknown as Record<string, unknown>

  // Check session_id exists
  if (!hasStringProperty(record, 'session_id')) return false

  return true
}

// ============================================================================
// Content Block Type Guards
// ============================================================================

/**
 * Type guard for text content blocks.
 *
 * Validates that the block:
 * - Has type 'text'
 * - Has a text property that is a string
 *
 * @param block - The content block to check
 * @returns True if block is a valid TextBlock
 *
 * @example
 * ```typescript
 * if (isTextBlock(block)) {
 *   // block.text is now typed as string
 *   console.log(block.text);
 * }
 * ```
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  if (block.type !== 'text') return false

  const record = block as unknown as Record<string, unknown>

  // Check text property exists and is a string
  if (typeof record['text'] !== 'string') return false

  return true
}

/**
 * Type guard for tool use content blocks.
 *
 * Validates that the block:
 * - Has type 'tool_use'
 * - Has required id (string), name (string), and input properties
 *
 * @param block - The content block to check
 * @returns True if block is a valid ToolUseBlock
 *
 * @example
 * ```typescript
 * if (isToolUseBlock(block)) {
 *   // block.id, block.name, and block.input are now typed
 *   console.log(block.name, block.input);
 * }
 * ```
 */
export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  if (block.type !== 'tool_use') return false

  const record = block as unknown as Record<string, unknown>

  // Check id is a string
  if (typeof record['id'] !== 'string') return false

  // Check name is a string
  if (typeof record['name'] !== 'string') return false

  // Check input exists (can be any value, including undefined but property must exist)
  if (!('input' in record)) return false

  return true
}

/**
 * Type guard for tool result content blocks.
 *
 * Validates that the block:
 * - Has type 'tool_result'
 * - Has required tool_use_id (string) property
 *
 * @param block - The content block to check
 * @returns True if block is a valid ToolResultBlock
 *
 * @example
 * ```typescript
 * if (isToolResultBlock(block)) {
 *   // block.tool_use_id and block.content are now typed
 *   console.log(block.tool_use_id, block.content);
 * }
 * ```
 */
export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  if (block.type !== 'tool_result') return false

  const record = block as unknown as Record<string, unknown>

  // Check tool_use_id is a string
  if (typeof record['tool_use_id'] !== 'string') return false

  return true
}

// ============================================================================
// Tool Input Types
// ============================================================================

/**
 * Valid todo statuses
 */
const VALID_TODO_STATUSES = ['pending', 'in_progress', 'completed'] as const

/**
 * TodoWrite tool input structure
 */
export interface TodoWriteInput {
  todos: Array<{
    content: string
    status: 'pending' | 'in_progress' | 'completed'
    activeForm: string
  }>
}

/**
 * ExitPlanMode tool input structure
 */
export interface ExitPlanModeInput {
  plan?: string
}

/**
 * Write tool input structure
 */
export interface WriteToolInput {
  file_path?: string
  content?: string
}

// ============================================================================
// Tool Input Type Guards
// ============================================================================

/**
 * Type guard for TodoWrite tool input.
 *
 * Validates that the input:
 * - Is a non-null object
 * - Has a 'todos' property that is an array
 * - Each todo has required fields: content (string), status (valid status), activeForm (string)
 *
 * @param input - The unknown input to validate
 * @returns True if input is a valid TodoWriteInput
 *
 * @example
 * ```typescript
 * if (isTodoWriteInput(block.input)) {
 *   // block.input.todos is now typed as TodoItem[]
 *   block.input.todos.forEach(todo => console.log(todo.content));
 * }
 * ```
 */
export function isTodoWriteInput(input: unknown): input is TodoWriteInput {
  if (!isObject(input)) return false

  // Check todos property exists and is an array
  const todos = input['todos']
  if (!Array.isArray(todos)) return false

  // Validate each todo item
  for (const todo of todos) {
    if (!isObject(todo)) return false

    // Check content is a string
    if (typeof todo['content'] !== 'string') return false

    // Check status is a valid status string
    const status = todo['status']
    if (typeof status !== 'string' || !VALID_TODO_STATUSES.includes(status as typeof VALID_TODO_STATUSES[number])) {
      return false
    }

    // Check activeForm is a string
    if (typeof todo['activeForm'] !== 'string') return false
  }

  return true
}

/**
 * Type guard for ExitPlanMode tool input.
 *
 * Validates that the input:
 * - Is a non-null object
 * - If 'plan' exists, it must be a string or undefined
 *
 * @param input - The unknown input to validate
 * @returns True if input is a valid ExitPlanModeInput
 *
 * @example
 * ```typescript
 * if (isExitPlanModeInput(block.input)) {
 *   // block.input.plan is now typed as string | undefined
 *   console.log(block.input.plan ?? 'No plan');
 * }
 * ```
 */
export function isExitPlanModeInput(input: unknown): input is ExitPlanModeInput {
  if (!isObject(input)) return false

  // plan is optional, but if present must be a string or undefined
  const plan = input['plan']
  if (plan !== undefined && typeof plan !== 'string') return false

  return true
}

/**
 * Type guard for Write tool input.
 *
 * Validates that the input:
 * - Is a non-null object
 * - If 'file_path' exists, it must be a string
 * - If 'content' exists, it must be a string
 *
 * @param input - The unknown input to validate
 * @returns True if input is a valid WriteToolInput
 *
 * @example
 * ```typescript
 * if (isWriteToolInput(block.input)) {
 *   // block.input.file_path and block.input.content are now typed
 *   console.log(block.input.file_path, block.input.content);
 * }
 * ```
 */
export function isWriteToolInput(input: unknown): input is WriteToolInput {
  if (!isObject(input)) return false

  // file_path is optional, but if present must be a string
  const filePath = input['file_path']
  if (filePath !== undefined && typeof filePath !== 'string') return false

  // content is optional, but if present must be a string
  const content = input['content']
  if (content !== undefined && typeof content !== 'string') return false

  return true
}

// ============================================================================
// Tool Input Validators (return typed value or null)
// ============================================================================

/**
 * Validate and return typed TodoWrite input.
 *
 * @param input - The unknown input to validate
 * @returns Typed TodoWriteInput or null if invalid
 *
 * @example
 * ```typescript
 * const validated = validateTodoWriteInput(block.input);
 * if (validated) {
 *   // Use typed validated.todos
 *   validated.todos.forEach(todo => console.log(todo.content));
 * }
 * ```
 */
export function validateTodoWriteInput(input: unknown): TodoWriteInput | null {
  if (isTodoWriteInput(input)) {
    return input
  }
  return null
}

/**
 * Validate and return typed ExitPlanMode input.
 *
 * @param input - The unknown input to validate
 * @returns Typed ExitPlanModeInput or null if invalid
 *
 * @example
 * ```typescript
 * const validated = validateExitPlanModeInput(block.input);
 * if (validated) {
 *   // Use typed validated.plan
 *   console.log(validated.plan ?? 'No plan provided');
 * }
 * ```
 */
export function validateExitPlanModeInput(input: unknown): ExitPlanModeInput | null {
  if (isExitPlanModeInput(input)) {
    return input
  }
  return null
}

/**
 * Validate and return typed Write tool input.
 *
 * @param input - The unknown input to validate
 * @returns Typed WriteToolInput or null if invalid
 *
 * @example
 * ```typescript
 * const validated = validateWriteToolInput(block.input);
 * if (validated) {
 *   // Use typed validated.file_path and validated.content
 *   console.log(validated.file_path, validated.content);
 * }
 * ```
 */
export function validateWriteToolInput(input: unknown): WriteToolInput | null {
  if (isWriteToolInput(input)) {
    return input
  }
  return null
}
