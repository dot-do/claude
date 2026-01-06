import { describe, it, expect } from 'vitest'
import { isValidSessionId, isValidRepoPath, validateMessageContent } from './validation'

describe('isValidSessionId', () => {
  it('accepts valid UUID', () => {
    expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('rejects non-UUID strings', () => {
    expect(isValidSessionId('not-a-uuid')).toBe(false)
  })

  it('rejects path traversal attempts', () => {
    expect(isValidSessionId('../../../etc/passwd')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSessionId('')).toBe(false)
  })
})

describe('isValidRepoPath', () => {
  it('accepts valid owner/repo format', () => {
    expect(isValidRepoPath('anthropics/claude-code')).toBe(true)
  })

  it('accepts repos with dots and hyphens', () => {
    expect(isValidRepoPath('owner/my-repo.js')).toBe(true)
  })

  it('rejects path traversal', () => {
    expect(isValidRepoPath('../../../etc/passwd')).toBe(false)
  })

  it('rejects null bytes', () => {
    expect(isValidRepoPath('owner/repo\x00evil')).toBe(false)
  })

  it('rejects paths without slash', () => {
    expect(isValidRepoPath('justrepo')).toBe(false)
  })
})

describe('validateMessageContent', () => {
  it('accepts normal messages', () => {
    expect(() => validateMessageContent('Hello Claude')).not.toThrow()
  })

  it('returns the message', () => {
    const result = validateMessageContent('test')
    expect(result).toBe('test')
  })

  it('enforces max length', () => {
    const longMessage = 'a'.repeat(1_000_001)
    expect(() => validateMessageContent(longMessage)).toThrow('too long')
  })

  it('accepts message at max length', () => {
    const maxMessage = 'a'.repeat(1_000_000)
    expect(() => validateMessageContent(maxMessage)).not.toThrow()
  })
})
