/**
 * @dotdo/claude - NDJSON Stream Parser
 *
 * Parses Claude Code CLI `--output-format stream-json` output (NDJSON)
 */

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  isAssistantMessage,
  isToolUseBlock,
} from '../types/messages.js'
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
      } catch (error) {
        // Log but continue parsing other lines
        console.warn(`NDJSON parse error at line ${this.lineNumber}:`, error)
      }
    }

    return messages
  }

  /**
   * Validate and type a parsed message
   * Returns null if validation fails but logs warning
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

    // Basic type checking based on message type
    switch (obj.type) {
      case 'system':
      case 'assistant':
      case 'user':
      case 'result':
      case 'stream_event':
        return data as SDKMessage
      default:
        console.warn(`Unknown message type: ${obj.type}`)
        return data as SDKMessage // Return anyway, let consumers handle
    }
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
 * Finds TodoWrite tool uses and extracts todo items
 */
export function extractTodoUpdates(messages: SDKMessage[]): TodoUpdate[] {
  const updates: TodoUpdate[] = []

  for (const msg of messages) {
    if (msg.type !== 'assistant') continue

    const assistantMsg = msg as SDKAssistantMessage
    if (!assistantMsg.message?.content) continue

    for (const block of assistantMsg.message.content) {
      if (block.type === 'tool_use' && block.name === 'TodoWrite') {
        const input = block.input as { todos?: TodoItem[] }

        if (input.todos && Array.isArray(input.todos)) {
          updates.push({
            todos: input.todos,
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
 * Extract plan updates from ExitPlanMode tool use or plan file writes
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
          const input = block.input as { plan?: string }
          updates.push({
            plan: input.plan ?? '',
            timestamp: new Date().toISOString(),
            messageUuid: msg.uuid,
            sessionId: msg.session_id,
          })
        }

        // Also check for Write tool to .claude/plans/*.md files
        if (block.name === 'Write') {
          const input = block.input as { file_path?: string; content?: string }
          if (input.file_path?.includes('.claude/plans/') && input.file_path.endsWith('.md')) {
            updates.push({
              plan: input.content ?? '',
              planFile: input.file_path,
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
