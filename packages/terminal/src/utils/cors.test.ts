import { describe, it, expect, vi } from 'vitest'
import {
  CorsPolicy,
  isOriginAllowed,
  parseOriginConfig,
  createSecureMessageHandler,
  type PostMessageOriginConfig,
} from './cors'

describe('CorsPolicy', () => {
  it('rejects wildcard in production mode', () => {
    const policy = new CorsPolicy(['https://app.example.com'], 'production')
    expect(policy.isAllowed('*')).toBe(false)
  })

  it('accepts configured origins', () => {
    const policy = new CorsPolicy(['https://app.example.com'])
    expect(policy.isAllowed('https://app.example.com')).toBe(true)
  })

  it('rejects unknown origins', () => {
    const policy = new CorsPolicy(['https://app.example.com'])
    expect(policy.isAllowed('https://evil.com')).toBe(false)
  })

  it('allows any origin in development mode', () => {
    const policy = new CorsPolicy([], 'development')
    expect(policy.isAllowed('https://localhost:3000')).toBe(true)
  })

  it('validates origin before processing', () => {
    const policy = new CorsPolicy(['https://trusted.com'])
    expect(policy.shouldProcessMessage('https://untrusted.com')).toBe(false)
    expect(policy.shouldProcessMessage('https://trusted.com')).toBe(true)
  })
})

describe('isOriginAllowed', () => {
  it('rejects empty origin', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://example.com'],
    }
    expect(isOriginAllowed('', config)).toBe(false)
  })

  it('rejects null origin by default', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://example.com'],
    }
    expect(isOriginAllowed('null', config)).toBe(false)
  })

  it('allows null origin when explicitly configured', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://example.com'],
      allowNullOrigin: true,
    }
    expect(isOriginAllowed('null', config)).toBe(true)
  })

  it('allows configured origins', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://app.example.com', 'https://other.example.com'],
    }
    expect(isOriginAllowed('https://app.example.com', config)).toBe(true)
    expect(isOriginAllowed('https://other.example.com', config)).toBe(true)
  })

  it('rejects unconfigured origins', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://app.example.com'],
    }
    expect(isOriginAllowed('https://evil.com', config)).toBe(false)
    expect(isOriginAllowed('https://app.example.com:8080', config)).toBe(false)
    expect(isOriginAllowed('http://app.example.com', config)).toBe(false)
  })

  it('allows any origin when allowAnyOrigin is true', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: [],
      allowAnyOrigin: true,
    }
    expect(isOriginAllowed('https://any.domain.com', config)).toBe(true)
  })
})

describe('parseOriginConfig', () => {
  it('parses single allowedOrigin parameter', () => {
    const config = parseOriginConfig('?allowedOrigin=https://example.com')
    expect(config.allowedOrigins).toEqual(['https://example.com'])
    expect(config.allowNullOrigin).toBe(false)
    expect(config.allowAnyOrigin).toBe(false)
  })

  it('parses multiple allowedOrigins parameter', () => {
    const config = parseOriginConfig(
      '?allowedOrigins=https://a.com,https://b.com,https://c.com'
    )
    expect(config.allowedOrigins).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ])
  })

  it('combines single and multiple origin parameters', () => {
    const config = parseOriginConfig(
      '?allowedOrigin=https://main.com&allowedOrigins=https://a.com,https://b.com'
    )
    expect(config.allowedOrigins).toEqual([
      'https://main.com',
      'https://a.com',
      'https://b.com',
    ])
  })

  it('parses allowNullOrigin parameter', () => {
    const config = parseOriginConfig('?allowNullOrigin=true')
    expect(config.allowNullOrigin).toBe(true)
  })

  it('defaults allowNullOrigin to false', () => {
    const config = parseOriginConfig('?allowedOrigin=https://example.com')
    expect(config.allowNullOrigin).toBe(false)
  })

  it('never allows allowAnyOrigin from URL params', () => {
    // This is intentional for security - allowAnyOrigin should never be
    // enabled from URL params as it would allow any malicious site
    const config = parseOriginConfig('?allowAnyOrigin=true')
    expect(config.allowAnyOrigin).toBe(false)
  })

  it('returns empty config for empty search string', () => {
    const config = parseOriginConfig('')
    expect(config.allowedOrigins).toEqual([])
    expect(config.allowNullOrigin).toBe(false)
    expect(config.allowAnyOrigin).toBe(false)
  })
})

describe('createSecureMessageHandler', () => {
  it('calls onMessage for allowed origins', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://trusted.com'],
    }
    const onMessage = vi.fn()
    const onRejected = vi.fn()

    const handler = createSecureMessageHandler(config, onMessage, onRejected)
    const event = { origin: 'https://trusted.com', data: { test: true } } as MessageEvent

    handler(event)

    expect(onMessage).toHaveBeenCalledWith(event)
    expect(onRejected).not.toHaveBeenCalled()
  })

  it('calls onRejected for disallowed origins', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://trusted.com'],
    }
    const onMessage = vi.fn()
    const onRejected = vi.fn()

    const handler = createSecureMessageHandler(config, onMessage, onRejected)
    const event = { origin: 'https://evil.com', data: { malicious: true } } as MessageEvent

    handler(event)

    expect(onMessage).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledWith('https://evil.com', { malicious: true })
  })

  it('works without onRejected callback', () => {
    const config: PostMessageOriginConfig = {
      allowedOrigins: ['https://trusted.com'],
    }
    const onMessage = vi.fn()

    const handler = createSecureMessageHandler(config, onMessage)
    const event = { origin: 'https://evil.com', data: {} } as MessageEvent

    // Should not throw
    expect(() => handler(event)).not.toThrow()
    expect(onMessage).not.toHaveBeenCalled()
  })
})
