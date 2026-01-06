import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  AuthMiddleware,
  createAuthMiddleware,
  ApiKeyAuthenticator,
  JwtAuthenticator,
  RateLimiter,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  type AuthConfig,
  type AuthResult,
  type RateLimitConfig,
} from './auth'

describe('AuthMiddleware', () => {
  describe('createAuthMiddleware', () => {
    it('creates middleware with default config', () => {
      const middleware = createAuthMiddleware({ apiKey: 'test-api-key' })
      expect(middleware).toBeInstanceOf(AuthMiddleware)
    })

    it('creates middleware with custom config', () => {
      const config: AuthConfig = {
        apiKey: 'test-api-key',
        jwt: {
          secret: 'jwt-secret',
          algorithms: ['HS256'],
        },
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100,
        },
      }
      const middleware = createAuthMiddleware(config)
      expect(middleware).toBeInstanceOf(AuthMiddleware)
    })

    it('throws if no authentication method configured', () => {
      expect(() => createAuthMiddleware({} as AuthConfig)).toThrow('At least one authentication method must be configured')
    })
  })

  describe('authenticate', () => {
    let middleware: AuthMiddleware

    beforeEach(() => {
      middleware = createAuthMiddleware({ apiKey: 'valid-api-key' })
    })

    it('authenticates valid API key from Authorization header', async () => {
      const request = new Request('https://example.com/api', {
        headers: { Authorization: 'Bearer valid-api-key' },
      })

      const result = await middleware.authenticate(request)
      expect(result.authenticated).toBe(true)
      expect(result.method).toBe('api-key')
    })

    it('authenticates valid API key from X-API-Key header', async () => {
      const request = new Request('https://example.com/api', {
        headers: { 'X-API-Key': 'valid-api-key' },
      })

      const result = await middleware.authenticate(request)
      expect(result.authenticated).toBe(true)
      expect(result.method).toBe('api-key')
    })

    it('rejects invalid API key', async () => {
      const request = new Request('https://example.com/api', {
        headers: { Authorization: 'Bearer invalid-key' },
      })

      await expect(middleware.authenticate(request)).rejects.toThrow(AuthenticationError)
    })

    it('rejects request without credentials', async () => {
      const request = new Request('https://example.com/api')

      await expect(middleware.authenticate(request)).rejects.toThrow(AuthenticationError)
      await expect(middleware.authenticate(request)).rejects.toThrow('Missing authentication credentials')
    })
  })

  describe('handleRequest', () => {
    let middleware: AuthMiddleware

    beforeEach(() => {
      middleware = createAuthMiddleware({ apiKey: 'valid-api-key' })
    })

    it('returns next() result for authenticated requests', async () => {
      const request = new Request('https://example.com/api', {
        headers: { Authorization: 'Bearer valid-api-key' },
      })
      const expectedResponse = new Response('Success', { status: 200 })
      const next = vi.fn().mockResolvedValue(expectedResponse)

      const response = await middleware.handleRequest(request, next)

      expect(next).toHaveBeenCalled()
      expect(response).toBe(expectedResponse)
    })

    it('returns 401 for unauthenticated requests', async () => {
      const request = new Request('https://example.com/api')
      const next = vi.fn()

      const response = await middleware.handleRequest(request, next)

      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.error).toBe('Unauthorized')
    })

    it('returns 401 for invalid credentials', async () => {
      const request = new Request('https://example.com/api', {
        headers: { Authorization: 'Bearer wrong-key' },
      })
      const next = vi.fn()

      const response = await middleware.handleRequest(request, next)

      expect(next).not.toHaveBeenCalled()
      expect(response.status).toBe(401)
    })

    it('attaches auth result to request context', async () => {
      const request = new Request('https://example.com/api', {
        headers: { Authorization: 'Bearer valid-api-key' },
      })
      let receivedContext: AuthResult | undefined
      const next = vi.fn().mockImplementation((_req, ctx) => {
        receivedContext = ctx?.auth
        return new Response('OK')
      })

      await middleware.handleRequest(request, next)

      expect(receivedContext).toBeDefined()
      expect(receivedContext?.authenticated).toBe(true)
    })
  })
})

describe('ApiKeyAuthenticator', () => {
  describe('validate', () => {
    it('validates exact API key match', async () => {
      const authenticator = new ApiKeyAuthenticator('sk-ant-test-key')
      const result = await authenticator.validate('sk-ant-test-key')
      expect(result.valid).toBe(true)
    })

    it('validates against array of valid keys', async () => {
      const authenticator = new ApiKeyAuthenticator(['key-1', 'key-2', 'key-3'])

      expect((await authenticator.validate('key-1')).valid).toBe(true)
      expect((await authenticator.validate('key-2')).valid).toBe(true)
      expect((await authenticator.validate('key-3')).valid).toBe(true)
      expect((await authenticator.validate('key-4')).valid).toBe(false)
    })

    it('validates with custom validator function', async () => {
      const customValidator = vi.fn().mockResolvedValue({ valid: true, userId: 'user-123' })
      const authenticator = new ApiKeyAuthenticator(customValidator)

      const result = await authenticator.validate('any-key')

      expect(customValidator).toHaveBeenCalledWith('any-key')
      expect(result.valid).toBe(true)
      expect(result.userId).toBe('user-123')
    })

    it('rejects invalid key', async () => {
      const authenticator = new ApiKeyAuthenticator('valid-key')
      const result = await authenticator.validate('invalid-key')
      expect(result.valid).toBe(false)
    })

    it('rejects empty key', async () => {
      const authenticator = new ApiKeyAuthenticator('valid-key')
      const result = await authenticator.validate('')
      expect(result.valid).toBe(false)
    })

    it('rejects whitespace-only key', async () => {
      const authenticator = new ApiKeyAuthenticator('valid-key')
      const result = await authenticator.validate('   ')
      expect(result.valid).toBe(false)
    })

    it('uses constant-time comparison to prevent timing attacks', async () => {
      const authenticator = new ApiKeyAuthenticator('sk-ant-secret-key-12345')

      // Both should take similar time regardless of where mismatch occurs
      const start1 = performance.now()
      await authenticator.validate('xx-xxx-xxxxxx-xxx-xxxxx') // Early mismatch
      const time1 = performance.now() - start1

      const start2 = performance.now()
      await authenticator.validate('sk-ant-secret-key-1234x') // Late mismatch
      const time2 = performance.now() - start2

      // Times should be within reasonable margin (allowing for variance)
      // This is a basic check - timing attacks are hard to test in unit tests
      expect(Math.abs(time1 - time2)).toBeLessThan(10) // Within 10ms
    })
  })
})

describe('JwtAuthenticator', () => {
  const JWT_SECRET = 'test-jwt-secret-key-for-testing'

  describe('validate', () => {
    let authenticator: JwtAuthenticator

    beforeEach(() => {
      authenticator = new JwtAuthenticator({
        secret: JWT_SECRET,
        algorithms: ['HS256'],
      })
    })

    it('validates a valid JWT token', async () => {
      // Create a simple test token (header.payload.signature)
      const token = authenticator.createTestToken({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 })

      const result = await authenticator.validate(token)
      expect(result.valid).toBe(true)
      expect(result.userId).toBe('user-123')
    })

    it('rejects expired token', async () => {
      const token = authenticator.createTestToken({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) - 3600 })

      const result = await authenticator.validate(token)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('rejects malformed token', async () => {
      const result = await authenticator.validate('not.a.valid.jwt')
      expect(result.valid).toBe(false)
    })

    it('rejects token with invalid signature', async () => {
      const token = authenticator.createTestToken({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 })
      const tamperedToken = token.slice(0, -5) + 'xxxxx' // Tamper with signature

      const result = await authenticator.validate(tamperedToken)
      expect(result.valid).toBe(false)
    })

    it('extracts custom claims from token', async () => {
      const token = authenticator.createTestToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'admin',
        permissions: ['read', 'write'],
      })

      const result = await authenticator.validate(token)
      expect(result.valid).toBe(true)
      expect(result.claims?.role).toBe('admin')
      expect(result.claims?.permissions).toEqual(['read', 'write'])
    })

    it('validates issuer when configured', async () => {
      const authWithIssuer = new JwtAuthenticator({
        secret: JWT_SECRET,
        algorithms: ['HS256'],
        issuer: 'https://auth.example.com',
      })

      const validToken = authWithIssuer.createTestToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://auth.example.com',
      })
      const invalidToken = authWithIssuer.createTestToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: 'https://wrong-issuer.com',
      })

      expect((await authWithIssuer.validate(validToken)).valid).toBe(true)
      expect((await authWithIssuer.validate(invalidToken)).valid).toBe(false)
    })

    it('validates audience when configured', async () => {
      const authWithAudience = new JwtAuthenticator({
        secret: JWT_SECRET,
        algorithms: ['HS256'],
        audience: 'claude-sdk',
      })

      const validToken = authWithAudience.createTestToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'claude-sdk',
      })
      const invalidToken = authWithAudience.createTestToken({
        sub: 'user-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'wrong-audience',
      })

      expect((await authWithAudience.validate(validToken)).valid).toBe(true)
      expect((await authWithAudience.validate(invalidToken)).valid).toBe(false)
    })
  })
})

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('check', () => {
    it('allows requests within limit', async () => {
      rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 10 })

      for (let i = 0; i < 10; i++) {
        const result = await rateLimiter.check('client-1')
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(9 - i)
      }
    })

    it('blocks requests exceeding limit', async () => {
      rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 3 })

      await rateLimiter.check('client-1')
      await rateLimiter.check('client-1')
      await rateLimiter.check('client-1')

      const result = await rateLimiter.check('client-1')
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('tracks different clients separately', async () => {
      rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 })

      await rateLimiter.check('client-1')
      await rateLimiter.check('client-1')

      const result1 = await rateLimiter.check('client-1')
      const result2 = await rateLimiter.check('client-2')

      expect(result1.allowed).toBe(false)
      expect(result2.allowed).toBe(true)
    })

    it('resets after window expires', async () => {
      rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 })

      await rateLimiter.check('client-1')
      await rateLimiter.check('client-1')

      const blockedResult = await rateLimiter.check('client-1')
      expect(blockedResult.allowed).toBe(false)

      // Advance time past window
      vi.advanceTimersByTime(60001)

      const allowedResult = await rateLimiter.check('client-1')
      expect(allowedResult.allowed).toBe(true)
      expect(allowedResult.remaining).toBe(1)
    })

    it('provides accurate retry-after time', async () => {
      rateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 1 })

      await rateLimiter.check('client-1')

      vi.advanceTimersByTime(30000) // Advance 30 seconds

      const result = await rateLimiter.check('client-1')
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeLessThanOrEqual(30000)
      expect(result.retryAfter).toBeGreaterThan(0)
    })
  })

  describe('with custom key generator', () => {
    it('uses custom key for rate limiting', async () => {
      const keyGenerator = vi.fn().mockReturnValue('custom-key')
      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        keyGenerator,
      })

      const request = new Request('https://example.com/api', {
        headers: { 'X-User-ID': 'user-123' },
      })

      await rateLimiter.checkRequest(request)

      expect(keyGenerator).toHaveBeenCalledWith(request)
    })
  })

  describe('with storage backend', () => {
    it('uses custom storage for distributed rate limiting', async () => {
      const storage = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        increment: vi.fn().mockResolvedValue(1),
      }

      rateLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        storage,
      })

      await rateLimiter.check('client-1')

      expect(storage.increment).toHaveBeenCalled()
    })
  })
})

describe('Error classes', () => {
  describe('AuthenticationError', () => {
    it('creates error with correct properties', () => {
      const error = new AuthenticationError('Invalid token')
      expect(error.message).toBe('Invalid token')
      expect(error.name).toBe('AuthenticationError')
      expect(error.statusCode).toBe(401)
    })

    it('includes WWW-Authenticate header hint', () => {
      const error = new AuthenticationError('Missing credentials', 'Bearer')
      expect(error.wwwAuthenticate).toBe('Bearer')
    })
  })

  describe('AuthorizationError', () => {
    it('creates error with 403 status', () => {
      const error = new AuthorizationError('Insufficient permissions')
      expect(error.message).toBe('Insufficient permissions')
      expect(error.name).toBe('AuthorizationError')
      expect(error.statusCode).toBe(403)
    })
  })

  describe('RateLimitError', () => {
    it('creates error with retry-after info', () => {
      const error = new RateLimitError('Too many requests', 30000)
      expect(error.message).toBe('Too many requests')
      expect(error.name).toBe('RateLimitError')
      expect(error.statusCode).toBe(429)
      expect(error.retryAfter).toBe(30000)
    })
  })
})

describe('Middleware integration', () => {
  it('combines API key auth with rate limiting', async () => {
    const middleware = createAuthMiddleware({
      apiKey: 'valid-key',
      rateLimit: {
        windowMs: 60000,
        maxRequests: 5,
      },
    })

    const request = new Request('https://example.com/api', {
      headers: { Authorization: 'Bearer valid-key' },
    })
    const next = vi.fn().mockResolvedValue(new Response('OK'))

    // Should succeed for first 5 requests
    for (let i = 0; i < 5; i++) {
      const response = await middleware.handleRequest(request, next)
      expect(response.status).toBe(200)
    }

    // 6th request should be rate limited
    const response = await middleware.handleRequest(request, next)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBeDefined()
  })

  it('skips rate limiting for unauthenticated requests', async () => {
    const middleware = createAuthMiddleware({
      apiKey: 'valid-key',
      rateLimit: {
        windowMs: 60000,
        maxRequests: 5,
      },
    })

    const request = new Request('https://example.com/api') // No auth header
    const next = vi.fn()

    const response = await middleware.handleRequest(request, next)

    // Should fail auth before hitting rate limit
    expect(response.status).toBe(401)
  })

  it('allows bypass for specific paths', async () => {
    const middleware = createAuthMiddleware({
      apiKey: 'valid-key',
      skipPaths: ['/health', '/metrics'],
    })

    const healthRequest = new Request('https://example.com/health')
    const next = vi.fn().mockResolvedValue(new Response('OK'))

    const response = await middleware.handleRequest(healthRequest, next)

    expect(next).toHaveBeenCalled()
    expect(response.status).toBe(200)
  })

  it('supports multiple authentication methods', async () => {
    const middleware = createAuthMiddleware({
      apiKey: 'api-key-123',
      jwt: {
        secret: 'jwt-secret',
        algorithms: ['HS256'],
      },
    })

    // Test API key auth
    const apiKeyRequest = new Request('https://example.com/api', {
      headers: { 'X-API-Key': 'api-key-123' },
    })
    const apiKeyResult = await middleware.authenticate(apiKeyRequest)
    expect(apiKeyResult.authenticated).toBe(true)
    expect(apiKeyResult.method).toBe('api-key')

    // Test JWT auth
    const jwtAuth = new JwtAuthenticator({ secret: 'jwt-secret', algorithms: ['HS256'] })
    const token = jwtAuth.createTestToken({ sub: 'user-123', exp: Math.floor(Date.now() / 1000) + 3600 })
    const jwtRequest = new Request('https://example.com/api', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const jwtResult = await middleware.authenticate(jwtRequest)
    expect(jwtResult.authenticated).toBe(true)
    expect(jwtResult.method).toBe('jwt')
  })
})
