/**
 * @dotdo/claude Client Tests
 *
 * TDD RED phase - Tests for ClaudeClient
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeClient, ClaudeClientError } from './index.js'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('ClaudeClient', () => {
  let client: ClaudeClient

  beforeEach(() => {
    mockFetch.mockReset()
    client = new ClaudeClient({ baseUrl: 'https://api.test.com' })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create client with default config', () => {
      const defaultClient = new ClaudeClient()
      expect(defaultClient).toBeInstanceOf(ClaudeClient)
    })

    it('should accept API key in config', () => {
      const authClient = new ClaudeClient({
        apiKey: 'sk-ant-xxx',
        baseUrl: 'https://api.test.com',
      })
      expect(authClient).toBeInstanceOf(ClaudeClient)
    })

    it('should accept OAuth token in config', () => {
      const oauthClient = new ClaudeClient({
        oauthToken: 'oauth-token',
        baseUrl: 'https://api.test.com',
      })
      expect(oauthClient).toBeInstanceOf(ClaudeClient)
    })
  })

  describe('Sessions API', () => {
    describe('listSessions', () => {
      it('should fetch sessions list', async () => {
        const mockSessions = {
          sessions: [
            { id: 'session-1', userId: 'user-1', status: 'active', createdAt: '', updatedAt: '' },
          ],
          count: 1,
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSessions),
        })

        const result = await client.listSessions()

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          })
        )
        expect(result.sessions).toHaveLength(1)
        expect(result.count).toBe(1)
      })

      it('should throw ClaudeClientError on API error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        })

        await expect(client.listSessions()).rejects.toThrow(ClaudeClientError)
      })
    })

    describe('getSession', () => {
      it('should fetch session by ID', async () => {
        const mockSession = {
          id: 'session-123',
          userId: 'user-1',
          status: 'active',
          createdAt: '',
          updatedAt: '',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSession),
        })

        const result = await client.getSession('session-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions/session-123',
          expect.any(Object)
        )
        expect(result.id).toBe('session-123')
      })
    })

    describe('createSession', () => {
      it('should create session without options', async () => {
        const mockResponse = { sessionId: 'new-session', status: 'pending' }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })

        const result = await client.createSession()

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({}),
          })
        )
        expect(result.sessionId).toBe('new-session')
      })

      it('should create session with repo and task', async () => {
        const mockResponse = { sessionId: 'new-session', status: 'pending' }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })

        await client.createSession({ repo: 'owner/repo', task: 'Fix bug' })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions',
          expect.objectContaining({
            body: JSON.stringify({ repo: 'owner/repo', task: 'Fix bug' }),
          })
        )
      })
    })

    describe('deleteSession', () => {
      it('should delete session', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        })

        const result = await client.deleteSession('session-123')

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions/session-123',
          expect.objectContaining({ method: 'DELETE' })
        )
        expect(result.success).toBe(true)
      })
    })
  })

  describe('Messages API', () => {
    describe('listMessages', () => {
      it('should fetch messages for session', async () => {
        const mockMessages = {
          messages: [
            { id: 'msg-1', sessionId: 'session-1', role: 'user', content: [], createdAt: '' },
          ],
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMessages),
        })

        const result = await client.listMessages('session-1')

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions/session-1/messages',
          expect.any(Object)
        )
        expect(result.messages).toHaveLength(1)
      })
    })

    describe('sendMessage', () => {
      it('should send message to session', async () => {
        const mockMessage = {
          id: 'msg-1',
          sessionId: 'session-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          createdAt: '',
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockMessage),
        })

        const result = await client.sendMessage('session-1', { content: 'Hello' })

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.com/api/sessions/session-1/messages',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ content: 'Hello' }),
          })
        )
        expect(result.role).toBe('assistant')
      })
    })

    describe('streamMessages', () => {
      it('should stream messages as async iterator', async () => {
        // Create a mock readable stream
        const mockEvents = [
          'data: {"type":"message.delta","data":{"text":"Hello"}}\n\n',
          'data: {"type":"message.delta","data":{"text":" world"}}\n\n',
          'data: [DONE]\n\n',
        ]

        const encoder = new TextEncoder()
        let eventIndex = 0

        const mockReader = {
          read: vi.fn().mockImplementation(() => {
            if (eventIndex < mockEvents.length) {
              const value = encoder.encode(mockEvents[eventIndex++])
              return Promise.resolve({ done: false, value })
            }
            return Promise.resolve({ done: true, value: undefined })
          }),
        }

        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: { getReader: () => mockReader },
        })

        const events: unknown[] = []
        for await (const event of client.streamMessages('session-1', 'Hello')) {
          events.push(event)
        }

        expect(events).toHaveLength(2)
        expect(events[0]).toEqual({ type: 'message.delta', data: { text: 'Hello' } })
      })
    })
  })

  describe('Files API', () => {
    describe('listFiles', () => {
      it('should list files in directory', async () => {
        const mockFiles = {
          files: [
            { name: 'index.ts', path: '/src/index.ts', type: 'file' },
          ],
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockFiles),
        })

        const result = await client.listFiles('session-1', { path: '/src' })

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/sessions/session-1/files?path=%2Fsrc'),
          expect.any(Object)
        )
        expect(result.files).toHaveLength(1)
      })
    })

    describe('readFile', () => {
      it('should read file content', async () => {
        const mockContent = {
          path: '/src/index.ts',
          content: 'export const x = 1',
          encoding: 'utf-8',
          size: 18,
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockContent),
        })

        const result = await client.readFile('session-1', '/src/index.ts')

        expect(result.content).toBe('export const x = 1')
      })
    })
  })

  describe('Diff API', () => {
    describe('getDiff', () => {
      it('should get session diff', async () => {
        const mockDiff = {
          sessionId: 'session-1',
          files: [
            { path: '/src/index.ts', status: 'modified', hunks: [] },
          ],
          stats: { filesChanged: 1, insertions: 5, deletions: 2 },
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockDiff),
        })

        const result = await client.getDiff('session-1')

        expect(result.files).toHaveLength(1)
        expect(result.stats.filesChanged).toBe(1)
      })
    })
  })

  describe('Search API', () => {
    describe('search', () => {
      it('should search in session workspace', async () => {
        const mockResults = {
          results: [
            { path: '/src/index.ts', line: 10, column: 5, match: 'export', context: { before: [], after: [] } },
          ],
        }
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResults),
        })

        const result = await client.search('session-1', { query: 'export' })

        expect(result.results).toHaveLength(1)
        expect(result.results[0].match).toBe('export')
      })
    })
  })

  describe('Error Handling', () => {
    it('should include status in ClaudeClientError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not found', errorId: 'err-123' }),
      })

      try {
        await client.getSession('invalid')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ClaudeClientError)
        expect((error as ClaudeClientError).status).toBe(404)
        expect((error as ClaudeClientError).errorId).toBe('err-123')
      }
    })

    it('should handle timeout', async () => {
      const slowClient = new ClaudeClient({ baseUrl: 'https://api.test.com', timeout: 100 })
      mockFetch.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      )

      await expect(slowClient.listSessions()).rejects.toThrow()
    })
  })
})

describe('ClaudeClientError', () => {
  it('should create error with message and status', () => {
    const error = new ClaudeClientError('Not found', 404)
    expect(error.message).toBe('Not found')
    expect(error.status).toBe(404)
    expect(error.name).toBe('ClaudeClientError')
  })

  it('should include errorId when provided', () => {
    const error = new ClaudeClientError('Server error', 500, 'err-abc123')
    expect(error.errorId).toBe('err-abc123')
  })
})
