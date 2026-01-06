import { describe, it, expect } from 'vitest'
import {
  isAssistantMessage,
  isUserMessage,
  isResultMessage,
  isTextBlock,
  isToolUseBlock,
  isTodoWriteInput,
  isExitPlanModeInput,
  isWriteToolInput,
  validateTodoWriteInput,
  validateExitPlanModeInput,
  validateWriteToolInput
} from './guards'
import type { SDKMessage, ContentBlock } from './messages'

describe('message type guards', () => {
  describe('isAssistantMessage', () => {
    it('returns true for valid assistant messages with all required fields', () => {
      const msg = {
        type: 'assistant',
        uuid: '123',
        session_id: 'session-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }]
        },
        parent_tool_use_id: null
      } as SDKMessage
      expect(isAssistantMessage(msg)).toBe(true)
    })

    it('returns false for other types', () => {
      const msg = { type: 'user', message: { role: 'user', content: [] } } as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })

    // Stricter validation tests
    it('returns false when message property is missing', () => {
      const msg = { type: 'assistant' } as unknown as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })

    it('returns false when message is empty object (no content)', () => {
      const msg = { type: 'assistant', message: {} } as unknown as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })

    it('returns false when content is a string instead of array', () => {
      const msg = {
        type: 'assistant',
        message: { role: 'assistant', content: 'string' }
      } as unknown as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })

    it('returns false when message.role is not assistant', () => {
      const msg = {
        type: 'assistant',
        message: { role: 'user', content: [] }
      } as unknown as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })

    it('returns false when session_id is missing', () => {
      const msg = {
        type: 'assistant',
        uuid: '123',
        message: { role: 'assistant', content: [] },
        parent_tool_use_id: null
      } as unknown as SDKMessage
      expect(isAssistantMessage(msg)).toBe(false)
    })
  })

  describe('isUserMessage', () => {
    it('returns true for valid user messages with array content', () => {
      const msg = {
        type: 'user',
        session_id: 'session-1',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }]
        },
        parent_tool_use_id: null
      } as SDKMessage
      expect(isUserMessage(msg)).toBe(true)
    })

    it('returns true for valid user messages with string content', () => {
      const msg = {
        type: 'user',
        session_id: 'session-1',
        message: {
          role: 'user',
          content: 'Hello, world!'
        },
        parent_tool_use_id: null
      } as SDKMessage
      expect(isUserMessage(msg)).toBe(true)
    })

    it('returns false for other types', () => {
      const msg = { type: 'assistant', message: { role: 'assistant', content: [] } } as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })

    // Stricter validation tests
    it('returns false when message property is missing', () => {
      const msg = { type: 'user' } as unknown as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })

    it('returns false when message is empty object (no content)', () => {
      const msg = { type: 'user', message: {} } as unknown as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })

    it('returns false when message.role is not user', () => {
      const msg = {
        type: 'user',
        message: { role: 'assistant', content: [] }
      } as unknown as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })

    it('returns false when session_id is missing', () => {
      const msg = {
        type: 'user',
        message: { role: 'user', content: [] },
        parent_tool_use_id: null
      } as unknown as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })

    it('returns false when content is a number instead of string or array', () => {
      const msg = {
        type: 'user',
        session_id: 'session-1',
        message: { role: 'user', content: 123 }
      } as unknown as SDKMessage
      expect(isUserMessage(msg)).toBe(false)
    })
  })

  describe('isResultMessage', () => {
    it('returns true for valid result messages with all required fields', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        uuid: '123',
        session_id: 'session-1',
        duration_ms: 100,
        duration_api_ms: 50,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      } as SDKMessage
      expect(isResultMessage(msg)).toBe(true)
    })

    it('returns false for other types', () => {
      const msg = { type: 'assistant', message: { role: 'assistant', content: [] } } as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })

    // Stricter validation tests
    it('returns false when subtype is missing', () => {
      const msg = { type: 'result' } as unknown as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })

    it('returns false when subtype is invalid', () => {
      const msg = {
        type: 'result',
        subtype: 'invalid_subtype'
      } as unknown as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })

    it('returns false when session_id is missing', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        uuid: '123'
      } as unknown as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })

    it('returns false when usage is missing', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        uuid: '123',
        session_id: 'session-1'
      } as unknown as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })

    it('returns false when usage is not an object', () => {
      const msg = {
        type: 'result',
        subtype: 'success',
        session_id: 'session-1',
        usage: 'not-an-object'
      } as unknown as SDKMessage
      expect(isResultMessage(msg)).toBe(false)
    })
  })

  describe('isTextBlock', () => {
    it('returns true for valid text blocks with text property', () => {
      const block = { type: 'text', text: 'hello' } as ContentBlock
      expect(isTextBlock(block)).toBe(true)
    })

    it('returns false for other types', () => {
      const block = { type: 'tool_use', id: '1', name: 'test', input: {} } as ContentBlock
      expect(isTextBlock(block)).toBe(false)
    })

    // Stricter validation tests
    it('returns false when text property is missing', () => {
      const block = { type: 'text' } as unknown as ContentBlock
      expect(isTextBlock(block)).toBe(false)
    })

    it('returns false when text is not a string', () => {
      const block = { type: 'text', text: 123 } as unknown as ContentBlock
      expect(isTextBlock(block)).toBe(false)
    })

    it('returns false when text is null', () => {
      const block = { type: 'text', text: null } as unknown as ContentBlock
      expect(isTextBlock(block)).toBe(false)
    })

    it('returns false when text is undefined', () => {
      const block = { type: 'text', text: undefined } as unknown as ContentBlock
      expect(isTextBlock(block)).toBe(false)
    })
  })

  describe('isToolUseBlock', () => {
    it('returns true for valid tool_use blocks with all required fields', () => {
      const block = { type: 'tool_use', id: '1', name: 'test', input: {} } as ContentBlock
      expect(isToolUseBlock(block)).toBe(true)
    })

    it('returns false for other types', () => {
      const block = { type: 'text', text: 'hello' } as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })

    // Stricter validation tests
    it('returns false when id is missing', () => {
      const block = { type: 'tool_use', name: 'test', input: {} } as unknown as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })

    it('returns false when name is missing', () => {
      const block = { type: 'tool_use', id: '1', input: {} } as unknown as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })

    it('returns false when input is missing', () => {
      const block = { type: 'tool_use', id: '1', name: 'test' } as unknown as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })

    it('returns false when id is not a string', () => {
      const block = { type: 'tool_use', id: 123, name: 'test', input: {} } as unknown as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })

    it('returns false when name is not a string', () => {
      const block = { type: 'tool_use', id: '1', name: 123, input: {} } as unknown as ContentBlock
      expect(isToolUseBlock(block)).toBe(false)
    })
  })
})

// ============================================================================
// Tool Input Type Guards
// ============================================================================

describe('tool input type guards', () => {
  describe('isTodoWriteInput', () => {
    it('returns true for valid TodoWrite input with todos array', () => {
      const input = {
        todos: [
          { content: 'Task 1', status: 'pending', activeForm: 'Doing task 1' },
          { content: 'Task 2', status: 'in_progress', activeForm: 'Doing task 2' },
          { content: 'Task 3', status: 'completed', activeForm: 'Doing task 3' }
        ]
      }
      expect(isTodoWriteInput(input)).toBe(true)
    })

    it('returns true for empty todos array', () => {
      const input = { todos: [] }
      expect(isTodoWriteInput(input)).toBe(true)
    })

    it('returns false when input is null', () => {
      expect(isTodoWriteInput(null)).toBe(false)
    })

    it('returns false when input is undefined', () => {
      expect(isTodoWriteInput(undefined)).toBe(false)
    })

    it('returns false when input is not an object', () => {
      expect(isTodoWriteInput('string')).toBe(false)
      expect(isTodoWriteInput(123)).toBe(false)
    })

    it('returns false when todos is missing', () => {
      const input = {}
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todos is not an array', () => {
      const input = { todos: 'not an array' }
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todo item is missing content', () => {
      const input = {
        todos: [{ status: 'pending', activeForm: 'Doing' }]
      }
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todo item is missing status', () => {
      const input = {
        todos: [{ content: 'Task', activeForm: 'Doing' }]
      }
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todo item is missing activeForm', () => {
      const input = {
        todos: [{ content: 'Task', status: 'pending' }]
      }
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todo item has invalid status', () => {
      const input = {
        todos: [{ content: 'Task', status: 'invalid', activeForm: 'Doing' }]
      }
      expect(isTodoWriteInput(input)).toBe(false)
    })

    it('returns false when todo item content is not a string', () => {
      const input = {
        todos: [{ content: 123, status: 'pending', activeForm: 'Doing' }]
      }
      expect(isTodoWriteInput(input)).toBe(false)
    })
  })

  describe('isExitPlanModeInput', () => {
    it('returns true for valid ExitPlanMode input with plan string', () => {
      const input = { plan: 'This is my plan' }
      expect(isExitPlanModeInput(input)).toBe(true)
    })

    it('returns true for empty plan string', () => {
      const input = { plan: '' }
      expect(isExitPlanModeInput(input)).toBe(true)
    })

    it('returns true for empty object (plan is optional)', () => {
      const input = {}
      expect(isExitPlanModeInput(input)).toBe(true)
    })

    it('returns true when plan is undefined', () => {
      const input = { plan: undefined }
      expect(isExitPlanModeInput(input)).toBe(true)
    })

    it('returns false when input is null', () => {
      expect(isExitPlanModeInput(null)).toBe(false)
    })

    it('returns false when input is undefined', () => {
      expect(isExitPlanModeInput(undefined)).toBe(false)
    })

    it('returns false when input is not an object', () => {
      expect(isExitPlanModeInput('string')).toBe(false)
      expect(isExitPlanModeInput(123)).toBe(false)
    })

    it('returns false when plan is not a string (number)', () => {
      const input = { plan: 123 }
      expect(isExitPlanModeInput(input)).toBe(false)
    })

    it('returns false when plan is an object', () => {
      const input = { plan: { text: 'plan' } }
      expect(isExitPlanModeInput(input)).toBe(false)
    })
  })

  describe('isWriteToolInput', () => {
    it('returns true for valid Write input with file_path and content', () => {
      const input = { file_path: '/path/to/file.txt', content: 'file content' }
      expect(isWriteToolInput(input)).toBe(true)
    })

    it('returns true with only file_path', () => {
      const input = { file_path: '/path/to/file.txt' }
      expect(isWriteToolInput(input)).toBe(true)
    })

    it('returns true with only content', () => {
      const input = { content: 'some content' }
      expect(isWriteToolInput(input)).toBe(true)
    })

    it('returns true for empty object (both are optional)', () => {
      const input = {}
      expect(isWriteToolInput(input)).toBe(true)
    })

    it('returns false when input is null', () => {
      expect(isWriteToolInput(null)).toBe(false)
    })

    it('returns false when input is undefined', () => {
      expect(isWriteToolInput(undefined)).toBe(false)
    })

    it('returns false when input is not an object', () => {
      expect(isWriteToolInput('string')).toBe(false)
      expect(isWriteToolInput(123)).toBe(false)
    })

    it('returns false when file_path is not a string', () => {
      const input = { file_path: 123, content: 'content' }
      expect(isWriteToolInput(input)).toBe(false)
    })

    it('returns false when content is not a string', () => {
      const input = { file_path: '/path/to/file', content: 123 }
      expect(isWriteToolInput(input)).toBe(false)
    })

    it('returns false when file_path is an array', () => {
      const input = { file_path: ['/path/to/file'], content: 'content' }
      expect(isWriteToolInput(input)).toBe(false)
    })
  })
})

// ============================================================================
// Tool Input Validators (with typed returns)
// ============================================================================

describe('tool input validators', () => {
  describe('validateTodoWriteInput', () => {
    it('returns typed TodoWriteInput for valid input', () => {
      const input = {
        todos: [
          { content: 'Task 1', status: 'pending', activeForm: 'Doing task 1' }
        ]
      }
      const result = validateTodoWriteInput(input)
      expect(result).not.toBeNull()
      expect(result?.todos).toHaveLength(1)
      expect(result?.todos[0].content).toBe('Task 1')
      expect(result?.todos[0].status).toBe('pending')
    })

    it('returns null for invalid input', () => {
      const input = { todos: 'not an array' }
      expect(validateTodoWriteInput(input)).toBeNull()
    })

    it('returns null for null input', () => {
      expect(validateTodoWriteInput(null)).toBeNull()
    })
  })

  describe('validateExitPlanModeInput', () => {
    it('returns typed ExitPlanModeInput for valid input with plan', () => {
      const input = { plan: 'My plan' }
      const result = validateExitPlanModeInput(input)
      expect(result).not.toBeNull()
      expect(result?.plan).toBe('My plan')
    })

    it('returns typed ExitPlanModeInput for empty object', () => {
      const input = {}
      const result = validateExitPlanModeInput(input)
      expect(result).not.toBeNull()
      expect(result?.plan).toBeUndefined()
    })

    it('returns null for invalid input', () => {
      const input = { plan: 123 }
      expect(validateExitPlanModeInput(input)).toBeNull()
    })

    it('returns null for null input', () => {
      expect(validateExitPlanModeInput(null)).toBeNull()
    })
  })

  describe('validateWriteToolInput', () => {
    it('returns typed WriteToolInput for valid input', () => {
      const input = { file_path: '/path/to/file', content: 'content' }
      const result = validateWriteToolInput(input)
      expect(result).not.toBeNull()
      expect(result?.file_path).toBe('/path/to/file')
      expect(result?.content).toBe('content')
    })

    it('returns typed WriteToolInput for partial input', () => {
      const input = { file_path: '/path/to/file' }
      const result = validateWriteToolInput(input)
      expect(result).not.toBeNull()
      expect(result?.file_path).toBe('/path/to/file')
      expect(result?.content).toBeUndefined()
    })

    it('returns null for invalid input', () => {
      const input = { file_path: 123 }
      expect(validateWriteToolInput(input)).toBeNull()
    })

    it('returns null for null input', () => {
      expect(validateWriteToolInput(null)).toBeNull()
    })
  })
})
