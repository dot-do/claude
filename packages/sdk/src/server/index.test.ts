/**
 * @dotdo/claude Server Tests
 *
 * TDD RED phase - Tests for server helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createClaudeServer,
  cloneRepository,
  proxyToClaude,
  getSandbox,
  type Sandbox,
} from './index.js'

// Mock Sandbox
function createMockSandbox(): Sandbox {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      waitForPort: vi.fn().mockResolvedValue(undefined),
    }),
    wsConnect: vi.fn().mockResolvedValue(new Response()),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
  }
}

describe('getSandbox', () => {
  it('should get sandbox instance by ID', () => {
    const mockSandbox = createMockSandbox()
    const namespace = {
      get: vi.fn().mockReturnValue(mockSandbox),
    }

    const sandbox = getSandbox(namespace, 'session-123')

    expect(namespace.get).toHaveBeenCalledWith('session-123')
    expect(sandbox).toBe(mockSandbox)
  })
})

describe('createClaudeServer', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should create server with default port', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    expect(server.port).toBe(7681)
    expect(server.sandbox).toBe(mockSandbox)
    expect(server.config.directory).toBe('/home/user/project')
  })

  it('should create server with custom port', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
      port: 8080,
    })

    expect(server.port).toBe(8080)
  })

  it('should configure Claude Code settings in sandbox', async () => {
    await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    // Should create .claude directory
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'mkdir -p /home/claude/.claude',
      expect.any(Object)
    )

    // Should write settings.json
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining('settings.json'),
      expect.any(Object)
    )

    // Should write .claude.json state
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining('.claude.json'),
      expect.any(Object)
    )

    // Should fix ownership
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'chown -R claude:claude /home/claude',
      expect.any(Object)
    )
  })

  describe('server.start', () => {
    it('should start PTY server process', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        'cd /pty-server && node sandbox-pty-server.js',
        expect.objectContaining({
          env: expect.objectContaining({
            WORKSPACE: '/home/user/project',
            PTY_PORT: '7681',
          }),
        })
      )
    })

    it('should pass API key in environment', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
        apiKey: 'sk-ant-xxx',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({
            ANTHROPIC_API_KEY: 'sk-ant-xxx',
          }),
        })
      )
    })

    it('should pass OAuth token in environment', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
        oauthToken: 'oauth-token',
      })

      await server.start()

      expect(mockSandbox.startProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
          }),
        })
      )
    })

    it('should wait for port to be ready', async () => {
      const waitForPort = vi.fn().mockResolvedValue(undefined)
      mockSandbox.startProcess = vi.fn().mockResolvedValue({ waitForPort })

      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.start()

      expect(waitForPort).toHaveBeenCalledWith(7681, { timeout: 30000 })
    })
  })

  describe('server.stop', () => {
    it('should kill PTY server process', async () => {
      const server = await createClaudeServer(mockSandbox, {
        directory: '/home/user/project',
      })

      await server.stop()

      expect(mockSandbox.exec).toHaveBeenCalledWith(
        'pkill -f sandbox-pty-server || true',
        { timeout: 5000 }
      )
    })
  })
})

describe('cloneRepository', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should clone repository to default directory', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' }) // repo doesn't exist
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' }) // clone succeeds

    const dir = await cloneRepository(mockSandbox, 'owner/repo')

    expect(dir).toBe('/repo')
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'git clone --depth 1 https://github.com/owner/repo.git /repo',
      { timeout: 60000 }
    )
  })

  it('should clone to custom target directory', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0, stdout: '' })

    const dir = await cloneRepository(mockSandbox, 'owner/repo', '/custom/path')

    expect(dir).toBe('/custom/path')
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      'git clone --depth 1 https://github.com/owner/repo.git /custom/path',
      expect.any(Object)
    )
  })

  it('should skip clone if repo already exists', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'exists' })

    const dir = await cloneRepository(mockSandbox, 'owner/repo')

    expect(dir).toBe('/repo')
    // Should only call exec once (to check existence)
    expect(mockSandbox.exec).toHaveBeenCalledTimes(1)
  })

  it('should throw on invalid repo format', async () => {
    await expect(cloneRepository(mockSandbox, 'invalid')).rejects.toThrow(
      'Invalid repository format'
    )
    await expect(cloneRepository(mockSandbox, 'invalid/repo/path')).rejects.toThrow(
      'Invalid repository format'
    )
    await expect(cloneRepository(mockSandbox, '../traversal')).rejects.toThrow(
      'Invalid repository format'
    )
  })

  it('should throw on clone failure', async () => {
    mockSandbox.exec = vi.fn()
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 128, stderr: 'Repository not found' })

    await expect(cloneRepository(mockSandbox, 'owner/repo')).rejects.toThrow(
      'Failed to clone repository: Repository not found'
    )
  })
})

describe('proxyToClaude', () => {
  let mockSandbox: Sandbox

  beforeEach(() => {
    mockSandbox = createMockSandbox()
  })

  it('should proxy WebSocket upgrade request', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    const request = new Request('https://test.com/ws', {
      headers: { Upgrade: 'websocket' },
    })

    await proxyToClaude(server, request)

    expect(mockSandbox.wsConnect).toHaveBeenCalledWith(request, 7681)
  })

  it('should return 501 for HTTP requests (not implemented)', async () => {
    const server = await createClaudeServer(mockSandbox, {
      directory: '/home/user/project',
    })

    const request = new Request('https://test.com/api/sessions')
    const response = await proxyToClaude(server, request)

    expect(response.status).toBe(501)
    const body = await response.json()
    expect(body.error).toBe('HTTP proxy not implemented')
  })
})
