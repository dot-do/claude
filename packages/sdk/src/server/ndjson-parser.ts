/**
 * @dotdo/claude - NDJSON Stream Parser
 *
 * Parses Claude Code CLI `--output-format stream-json` output (NDJSON)
 */

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
} from '../types/messages.js'
import {
  isAssistantMessage,
  isToolUseBlock,
  validateTodoWriteInput,
  validateExitPlanModeInput,
  validateWriteToolInput
} from '../types/guards.js'
import type { TodoItem, TodoUpdate, PlanUpdate } from '../types/events.js'

/**
 * NDJSON Parser with buffer for incomplete lines
 *
 * Handles streaming NDJSON (newline-delimited JSON) from Claude CLI output.
 * Each complete line is parsed as a separate JSON object.
 *
 * @example
 * ```typescript
 * const parser = new NDJSONParser()
 *
 * // Process chunks as they arrive
 * for (const chunk of chunks) {
 *   const messages = parser.parse(chunk)
 *   for (const msg of messages) {
 *     console.log(msg.type)
 *   }
 * }
 *
 * // Flush any remaining content at end
 * const remaining = parser.flush()
 * ```
 */
export class NDJSONParser {
  private buffer: string = ''
  private lineNumber: number = 0

  /**
   * Parse a chunk of NDJSON data
   * Returns array of parsed messages
   */
  parse(chunk: string): SDKMessage[] {
    this.buffer += chunk
    const messages: SDKMessage[] = []

    // Split on newlines
    const lines = this.buffer.split('\n')

    // Keep the last potentially incomplete line in buffer
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      this.lineNumber++
      const trimmed = line.trim()

      // Skip empty lines
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed)
        const validated = this.validate(parsed)

        if (validated) {
          messages.push(validated)
        }
      } catch {
        // Don't log every parse error - could be partial line or garbage
        // Just silently skip invalid JSON and continue
      }
    }

    return messages
  }

  /**
   * Valid result subtypes for SDKResultMessage validation.
   */
  private static readonly VALID_RESULT_SUBTYPES = [
    'success',
    'error_max_turns',
    'error_during_execution',
    'error_max_budget_usd',
    'error_max_structured_output_retries'
  ] as const

  /**
   * Validate and type a parsed message
   * Returns null if validation fails but logs warning
   *
   * IMPORTANT: Schema validation happens BEFORE casting to ensure type safety
   */
  private validate(data: unknown): SDKMessage | null {
    if (!data || typeof data !== 'object') {
      return null
    }

    const obj = data as Record<string, unknown>

    // Must have a type field
    if (!('type' in obj) || typeof obj.type !== 'string') {
      console.warn('Message missing type field:', obj)
      return null
    }

    // Validate schema based on message type BEFORE casting
    switch (obj.type) {
      case 'assistant':
        return this.validateAssistantMessage(obj)
      case 'user':
        return this.validateUserMessage(obj)
      case 'system':
        return this.validateSystemMessage(obj)
      case 'result':
        return this.validateResultMessage(obj)
      case 'stream_event':
        return this.validateStreamEventMessage(obj)
      default:
        console.warn(`Unknown message type: ${obj.type}`)
        return null // Unknown types are invalid - don't return unvalidated data
    }
  }

  /**
   * Validate assistant message schema before casting
   */
  private validateAssistantMessage(obj: Record<string, unknown>): SDKMessage | null {
    // Check session_id exists
    if (typeof obj.session_id !== 'string') {
      console.warn('Assistant message missing session_id:', obj)
      return null
    }

    // Check message object exists
    const message = obj.message
    if (!message || typeof message !== 'object') {
      console.warn('Assistant message missing message object:', obj)
      return null
    }

    const msgObj = message as Record<string, unknown>

    // Check message.role is 'assistant'
    if (msgObj.role !== 'assistant') {
      console.warn('Assistant message has wrong role:', obj)
      return null
    }

    // Check message.content is an array
    if (!Array.isArray(msgObj.content)) {
      console.warn('Assistant message content is not an array:', obj)
      return null
    }

    return obj as unknown as SDKMessage
  }

  /**
   * Validate user message schema before casting
   */
  private validateUserMessage(obj: Record<string, unknown>): SDKMessage | null {
    // Check session_id exists
    if (typeof obj.session_id !== 'string') {
      console.warn('User message missing session_id:', obj)
      return null
    }

    // Check message object exists
    const message = obj.message
    if (!message || typeof message !== 'object') {
      console.warn('User message missing message object:', obj)
      return null
    }

    const msgObj = message as Record<string, unknown>

    // Check message.role is 'user'
    if (msgObj.role !== 'user') {
      console.warn('User message has wrong role:', obj)
      return null
    }

    // Check message.content is a string or array
    const content = msgObj.content
    if (typeof content !== 'string' && !Array.isArray(content)) {
      console.warn('User message content is not a string or array:', obj)
      return null
    }

    return obj as unknown as SDKMessage
  }

  /**
   * Validate system message schema before casting
   */
  private validateSystemMessage(obj: Record<string, unknown>): SDKMessage | null {
    // Check session_id exists
    if (typeof obj.session_id !== 'string') {
      console.warn('System message missing session_id:', obj)
      return null
    }

    // Check subtype is valid ('init' or 'compact_boundary')
    const subtype = obj.subtype
    if (subtype !== 'init' && subtype !== 'compact_boundary') {
      console.warn('System message has invalid subtype:', obj)
      return null
    }

    return obj as unknown as SDKMessage
  }

  /**
   * Validate result message schema before casting
   */
  private validateResultMessage(obj: Record<string, unknown>): SDKMessage | null {
    // Check session_id exists
    if (typeof obj.session_id !== 'string') {
      console.warn('Result message missing session_id:', obj)
      return null
    }

    // Check subtype is valid
    const subtype = obj.subtype
    if (typeof subtype !== 'string' || !NDJSONParser.VALID_RESULT_SUBTYPES.includes(subtype as typeof NDJSONParser.VALID_RESULT_SUBTYPES[number])) {
      console.warn('Result message has invalid subtype:', obj)
      return null
    }

    // Check usage object exists
    const usage = obj.usage
    if (!usage || typeof usage !== 'object') {
      console.warn('Result message missing usage object:', obj)
      return null
    }

    return obj as unknown as SDKMessage
  }

  /**
   * Validate stream_event message schema before casting
   */
  private validateStreamEventMessage(obj: Record<string, unknown>): SDKMessage | null {
    // Check session_id exists
    if (typeof obj.session_id !== 'string') {
      console.warn('Stream event message missing session_id:', obj)
      return null
    }

    return obj as unknown as SDKMessage
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = ''
    this.lineNumber = 0
  }

  /**
   * Flush any remaining buffer content
   * Call at end of stream to handle any trailing data
   */
  flush(): SDKMessage[] {
    if (!this.buffer.trim()) {
      return []
    }

    const remaining = this.buffer
    this.buffer = ''

    try {
      const parsed = JSON.parse(remaining)
      const validated = this.validate(parsed)
      return validated ? [validated] : []
    } catch {
      console.warn('Failed to parse remaining buffer:', remaining)
      return []
    }
  }

  /**
   * Get current line number (for debugging)
   */
  getLineNumber(): number {
    return this.lineNumber
  }
}

/**
 * Extract todo updates from a stream of messages
 *
 * Finds TodoWrite tool uses and extracts todo items.
 * Uses validateTodoWriteInput to ensure type safety.
 */
export function extractTodoUpdates(messages: SDKMessage[]): TodoUpdate[] {
  const updates: TodoUpdate[] = []

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue

    const assistantMsg = msg as SDKAssistantMessage
    if (!assistantMsg.message?.content) continue

    for (const block of assistantMsg.message.content) {
      if (block.type === 'tool_use' && block.name === 'TodoWrite') {
        const validated = validateTodoWriteInput(block.input)

        if (validated) {
          updates.push({
            todos: validated.todos as TodoItem[],
            timestamp: new Date().toISOString(),
            messageUuid: msg.uuid,
            sessionId: msg.session_id,
          })
        }
      }
    }
  }

  return updates
}

/**
 * Extract plan updates from ExitPlanMode tool use or plan file writes.
 * Uses validateExitPlanModeInput and validateWriteToolInput to ensure type safety.
 */
export function extractPlanUpdates(messages: SDKMessage[]): PlanUpdate[] {
  const updates: PlanUpdate[] = []

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue

    const assistantMsg = msg as SDKAssistantMessage
    if (!assistantMsg.message?.content) continue

    for (const block of assistantMsg.message.content) {
      if (block.type === 'tool_use') {
        // Check for ExitPlanMode tool
        if (block.name === 'ExitPlanMode') {
          const validated = validateExitPlanModeInput(block.input)
          if (validated) {
            updates.push({
              plan: validated.plan ?? '',
              timestamp: new Date().toISOString(),
              messageUuid: msg.uuid,
              sessionId: msg.session_id,
            })
          }
        }

        // Also check for Write tool to .claude/plans/*.md files
        if (block.name === 'Write') {
          const validated = validateWriteToolInput(block.input)
          if (validated && validated.file_path?.includes('.claude/plans/') && validated.file_path.endsWith('.md')) {
            updates.push({
              plan: validated.content ?? '',
              planFile: validated.file_path,
              timestamp: new Date().toISOString(),
              messageUuid: msg.uuid,
              sessionId: msg.session_id,
            })
          }
        }
      }
    }
  }

  return updates
}

/**
 * Extract tool use events from messages
 */
export function extractToolUses(
  messages: SDKMessage[]
): Array<{ id: string; name: string; input: unknown; sessionId: string }> {
  const toolUses: Array<{ id: string; name: string; input: unknown; sessionId: string }> = []

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue

    const assistantMsg = msg as SDKAssistantMessage
    if (!assistantMsg.message?.content) continue

    for (const block of assistantMsg.message.content) {
      if (block.type === 'tool_use') {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input,
          sessionId: msg.session_id,
        })
      }
    }
  }

  return toolUses
}

/**
 * Extract result from messages
 */
export function extractResult(messages: SDKMessage[]): SDKResultMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'result') {
      return messages[i] as SDKResultMessage
    }
  }
  return null
}

/**
 * Extract session ID from init message
 */
export function extractSessionId(messages: SDKMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
      return msg.session_id
    }
  }
  return null
}

/**
 * Check if messages indicate completion
 */
export function isComplete(messages: SDKMessage[]): boolean {
  return messages.some((m) => m.type === 'result')
}

/**
 * Check if messages indicate error
 */
export function hasError(messages: SDKMessage[]): boolean {
  const result = extractResult(messages)
  return result?.is_error ?? false
}
