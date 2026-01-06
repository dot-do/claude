import { describe, it, expect } from 'vitest'
import { validateApiKey, redactApiKey } from './api-key'

describe('validateApiKey', () => {
  it('rejects empty string', () => {
    expect(() => validateApiKey('')).toThrow('API key required')
  })

  it('rejects undefined', () => {
    expect(() => validateApiKey(undefined)).toThrow('API key required')
  })

  it('rejects whitespace-only', () => {
    expect(() => validateApiKey('   ')).toThrow('API key required')
  })

  it('accepts valid sk-ant- prefixed key', () => {
    expect(() => validateApiKey('sk-ant-api03-xxxxxxxxxxxx')).not.toThrow()
  })

  it('trims whitespace from valid key', () => {
    const result = validateApiKey('  sk-ant-api03-xxxx  ')
    expect(result).toBe('sk-ant-api03-xxxx')
  })

  it('returns the validated key', () => {
    const result = validateApiKey('sk-ant-api03-test123')
    expect(result).toBe('sk-ant-api03-test123')
  })
})

describe('redactApiKey', () => {
  it('redacts most of the key', () => {
    const result = redactApiKey('sk-ant-api03-secretkey123')
    expect(result).not.toContain('secretkey123')
  })

  it('preserves prefix for identification', () => {
    const result = redactApiKey('sk-ant-api03-secretkey123')
    expect(result).toContain('sk-ant-')
  })

  it('handles short keys', () => {
    const result = redactApiKey('short')
    expect(result).toBe('***')
  })
})
