/**
 * @dotdo/claude SDK Types Tests
 *
 * TDD RED phase - Tests for type definitions
 */

import { describe, it, expect, expectTypeOf } from 'vitest'
import type {
  Session,
  SessionStatus,
  Message,
  MessageRole,
  ContentBlock,
  TextBlock,
  CodeBlock,
  ToolUseBlock,
  ToolResultBlock,
  FileNode,
  FileContent,
  FileDiff,
  SessionDiff,
  SearchResult,
  StreamEvent,
  EventType,
  ClaudeConfig,
  ServerConfig,
  ApiError,
} from './index.js'

describe('SDK Types', () => {
  describe('Session', () => {
    it('should have required fields', () => {
      const session: Session = {
        id: 'test-id',
        userId: 'user-123',
        status: 'pending',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }

      expect(session.id).toBe('test-id')
      expect(session.userId).toBe('user-123')
      expect(session.status).toBe('pending')
    })

    it('should allow optional repo and task', () => {
      const session: Session = {
        id: 'test-id',
        userId: 'user-123',
        repo: 'owner/repo',
        task: 'Fix the bug',
        status: 'active',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }

      expect(session.repo).toBe('owner/repo')
      expect(session.task).toBe('Fix the bug')
    })

    it('should enforce SessionStatus enum values', () => {
      const statuses: SessionStatus[] = ['pending', 'active', 'completed', 'failed']
      expect(statuses).toHaveLength(4)
    })
  })

  describe('Message', () => {
    it('should have required fields', () => {
      const message: Message = {
        id: 'msg-123',
        sessionId: 'session-456',
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        createdAt: '2025-01-01T00:00:00Z',
      }

      expect(message.id).toBe('msg-123')
      expect(message.role).toBe('user')
      expect(message.content).toHaveLength(1)
    })

    it('should enforce MessageRole enum values', () => {
      const roles: MessageRole[] = ['user', 'assistant', 'system']
      expect(roles).toHaveLength(3)
    })
  })

  describe('ContentBlock', () => {
    it('should support TextBlock', () => {
      const block: TextBlock = {
        type: 'text',
        text: 'Hello world',
      }
      expect(block.type).toBe('text')
    })

    it('should support CodeBlock', () => {
      const block: CodeBlock = {
        type: 'code',
        language: 'typescript',
        code: 'const x = 1',
      }
      expect(block.type).toBe('code')
      expect(block.language).toBe('typescript')
    })

    it('should support ToolUseBlock', () => {
      const block: ToolUseBlock = {
        type: 'tool_use',
        id: 'tool-123',
        name: 'read_file',
        input: { path: '/test.ts' },
      }
      expect(block.type).toBe('tool_use')
      expect(block.name).toBe('read_file')
    })

    it('should support ToolResultBlock', () => {
      const block: ToolResultBlock = {
        type: 'tool_result',
        tool_use_id: 'tool-123',
        content: 'File contents here',
        is_error: false,
      }
      expect(block.type).toBe('tool_result')
    })

    it('should allow ContentBlock union type', () => {
      const blocks: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'code', language: 'js', code: 'x' },
        { type: 'tool_use', id: '1', name: 'test', input: {} },
        { type: 'tool_result', tool_use_id: '1', content: 'ok' },
      ]
      expect(blocks).toHaveLength(4)
    })
  })

  describe('FileNode', () => {
    it('should represent a file', () => {
      const file: FileNode = {
        name: 'index.ts',
        path: '/src/index.ts',
        type: 'file',
        size: 1024,
        modifiedAt: '2025-01-01T00:00:00Z',
      }
      expect(file.type).toBe('file')
    })

    it('should represent a directory with children', () => {
      const dir: FileNode = {
        name: 'src',
        path: '/src',
        type: 'directory',
        children: [
          { name: 'index.ts', path: '/src/index.ts', type: 'file' },
        ],
      }
      expect(dir.type).toBe('directory')
      expect(dir.children).toHaveLength(1)
    })
  })

  describe('FileDiff', () => {
    it('should represent a modified file', () => {
      const diff: FileDiff = {
        path: '/src/index.ts',
        status: 'modified',
        hunks: [
          {
            oldStart: 1,
            oldLines: 5,
            newStart: 1,
            newLines: 7,
            content: '@@ -1,5 +1,7 @@\n ...',
          },
        ],
      }
      expect(diff.status).toBe('modified')
      expect(diff.hunks).toHaveLength(1)
    })

    it('should support all status types', () => {
      const statuses: FileDiff['status'][] = ['added', 'modified', 'deleted', 'renamed']
      expect(statuses).toHaveLength(4)
    })
  })

  describe('StreamEvent', () => {
    it('should have required fields', () => {
      const event: StreamEvent<{ message: string }> = {
        id: 'evt-123',
        type: 'message.delta',
        data: { message: 'Hello' },
        timestamp: '2025-01-01T00:00:00Z',
      }
      expect(event.type).toBe('message.delta')
      expect(event.data.message).toBe('Hello')
    })

    it('should support all event types', () => {
      const types: EventType[] = [
        'session.created',
        'session.updated',
        'session.completed',
        'message.created',
        'message.delta',
        'message.completed',
        'file.changed',
        'terminal.output',
        'error',
      ]
      expect(types).toHaveLength(9)
    })
  })

  describe('ClaudeConfig', () => {
    it('should allow all optional fields', () => {
      const config: ClaudeConfig = {}
      expect(config.apiKey).toBeUndefined()
    })

    it('should accept API key', () => {
      const config: ClaudeConfig = {
        apiKey: 'sk-ant-xxx',
        baseUrl: 'https://api.anthropic.com',
        timeout: 30000,
      }
      expect(config.apiKey).toBe('sk-ant-xxx')
    })
  })

  describe('ServerConfig', () => {
    it('should require directory', () => {
      const config: ServerConfig = {
        directory: '/home/user/project',
      }
      expect(config.directory).toBe('/home/user/project')
    })

    it('should extend ClaudeConfig', () => {
      const config: ServerConfig = {
        directory: '/home/user/project',
        apiKey: 'sk-ant-xxx',
        port: 7681,
      }
      expect(config.apiKey).toBe('sk-ant-xxx')
      expect(config.port).toBe(7681)
    })
  })

  describe('ApiError', () => {
    it('should have error message', () => {
      const error: ApiError = {
        error: 'Not found',
      }
      expect(error.error).toBe('Not found')
    })

    it('should support optional fields', () => {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid input',
        errorId: 'err-123',
        details: { field: 'email' },
      }
      expect(error.errorId).toBe('err-123')
    })
  })
})
