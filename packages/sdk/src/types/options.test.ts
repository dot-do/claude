import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { validateOptions, type ValidationMode } from './options'

describe('validateOptions', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('rejects non-object input', () => {
    expect(() => validateOptions(null)).toThrow('Options must be an object')
    expect(() => validateOptions('string')).toThrow('Options must be an object')
    expect(() => validateOptions(123)).toThrow('Options must be an object')
  })

  it('accepts empty object with defaults', () => {
    const result = validateOptions({})
    expect(result).toBeDefined()
  })

  it('accepts valid model', () => {
    const result = validateOptions({ model: 'claude-sonnet-4-20250514' })
    expect(result.model).toBe('claude-sonnet-4-20250514')
  })

  it('validates permissionMode if provided', () => {
    const result = validateOptions({ permissionMode: 'acceptEdits' })
    expect(result.permissionMode).toBe('acceptEdits')
  })

  it('validates cwd is string if provided', () => {
    const result = validateOptions({ cwd: '/tmp/test' })
    expect(result.cwd).toBe('/tmp/test')
  })

  it('validates maxTurns is positive if provided', () => {
    expect(() => validateOptions({ maxTurns: -1 })).toThrow()
    expect(() => validateOptions({ maxTurns: 0 })).toThrow()
    const result = validateOptions({ maxTurns: 10 })
    expect(result.maxTurns).toBe(10)
  })

  // ============================================================================
  // NEW TDD TESTS - Unknown Fields Validation
  // ============================================================================

  describe('unknown field validation', () => {
    it('throws on unknown field in strict mode', () => {
      expect(() =>
        validateOptions({ evil: 'malicious' }, { mode: 'strict' })
      ).toThrow("Unknown option: 'evil'. Valid options are:")
    })

    it('warns on unknown field in permissive mode (default)', () => {
      const result = validateOptions({ evil: 'malicious' })
      expect(result).toBeDefined()
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown option: 'evil'")
      )
    })

    it('silently ignores unknown fields in silent mode', () => {
      const result = validateOptions({ unknown: 'value' }, { mode: 'silent' })
      expect(result).toBeDefined()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('reports multiple unknown fields', () => {
      expect(() =>
        validateOptions({ foo: 1, bar: 2, baz: 3 }, { mode: 'strict' })
      ).toThrow(/foo.*bar.*baz|bar.*foo.*baz|baz.*bar.*foo/)
    })
  })

  // ============================================================================
  // NEW TDD TESTS - Path Traversal Prevention
  // ============================================================================

  describe('cwd path validation', () => {
    it('rejects path traversal with ../', () => {
      expect(() => validateOptions({ cwd: '/tmp/../etc/passwd' })).toThrow(
        'cwd contains path traversal'
      )
    })

    it('rejects path traversal with ..\\', () => {
      expect(() => validateOptions({ cwd: 'C:\\Users\\..\\Admin' })).toThrow(
        'cwd contains path traversal'
      )
    })

    it('rejects path starting with ..', () => {
      expect(() => validateOptions({ cwd: '../../../etc' })).toThrow(
        'cwd contains path traversal'
      )
    })

    it('accepts valid absolute paths', () => {
      const result = validateOptions({ cwd: '/home/user/project' })
      expect(result.cwd).toBe('/home/user/project')
    })

    it('accepts paths with dots in directory names', () => {
      const result = validateOptions({ cwd: '/home/user/.config/app' })
      expect(result.cwd).toBe('/home/user/.config/app')
    })
  })

  // ============================================================================
  // NEW TDD TESTS - Model Validation
  // ============================================================================

  describe('model validation', () => {
    it('rejects model with invalid characters', () => {
      expect(() => validateOptions({ model: 'model; rm -rf /' })).toThrow(
        'model contains invalid characters'
      )
    })

    it('rejects model with shell metacharacters', () => {
      expect(() => validateOptions({ model: 'model`whoami`' })).toThrow(
        'model contains invalid characters'
      )
    })

    it('rejects model with newlines', () => {
      expect(() => validateOptions({ model: 'model\nmalicious' })).toThrow(
        'model contains invalid characters'
      )
    })

    it('accepts valid model identifiers', () => {
      const validModels = [
        'claude-sonnet-4-20250514',
        'claude-opus-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'my-custom-model',
      ]
      for (const model of validModels) {
        const result = validateOptions({ model })
        expect(result.model).toBe(model)
      }
    })
  })

  // ============================================================================
  // NEW TDD TESTS - All Known Fields
  // ============================================================================

  describe('all known valid fields', () => {
    it('accepts all known ClaudeCodeOptions fields', () => {
      const fullOptions = {
        // API configuration
        apiKey: 'sk-ant-test',
        model: 'claude-sonnet-4-20250514',
        fallbackModel: 'claude-3-5-sonnet-20241022',

        // Session options
        cwd: '/home/user/project',
        env: { NODE_ENV: 'test' },

        // Behavior configuration
        systemPrompt: 'You are a helpful assistant',
        tools: ['read', 'write'],
        allowedTools: ['Bash', 'Read'],
        disallowedTools: ['Write'],

        // Permissions
        permissionMode: 'acceptEdits' as const,
        allowDangerouslySkipPermissions: false,

        // Limits
        maxTurns: 10,
        maxBudgetUsd: 5.0,
        maxThinkingTokens: 1000,

        // MCP servers
        mcpServers: {
          test: { command: 'node', args: ['server.js'] },
        },

        // Sandbox configuration
        sleepAfter: 60000,
        keepAlive: true,

        // Streaming options
        includePartialMessages: true,

        // Session management
        resume: 'session-id',
        continue: true,
        forkSession: false,
      }

      const result = validateOptions(fullOptions, { mode: 'strict' })
      expect(result).toEqual(fullOptions)
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })
})
