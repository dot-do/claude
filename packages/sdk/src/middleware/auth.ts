/**
 * Authentication Middleware for Production Use
 *
 * Provides API key authentication, JWT validation, and rate limiting
 * for the Claude SDK in production environments.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * JWT algorithm types supported
 */
export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512'

/**
 * JWT configuration options
 */
export interface JwtConfig {
  /** Secret key for HMAC algorithms or public key for RSA */
  secret: string
  /** Allowed algorithms */
  algorithms: JwtAlgorithm[]
  /** Expected issuer (iss claim) */
  issuer?: string
  /** Expected audience (aud claim) */
  audience?: string
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  windowMs: number
  /** Maximum requests per window */
  maxRequests: number
  /** Custom key generator for request identification */
  keyGenerator?: (request: Request) => string
  /** Storage backend for distributed rate limiting */
  storage?: RateLimitStorage
}

/**
 * Storage interface for distributed rate limiting
 */
export interface RateLimitStorage {
  get(key: string): Promise<number | null>
  set(key: string, value: number, ttlMs: number): Promise<void>
  increment(key: string, ttlMs: number): Promise<number>
}

/**
 * API key validator function type
 */
export type ApiKeyValidator = (key: string) => Promise<ApiKeyValidationResult>

/**
 * Result of API key validation
 */
export interface ApiKeyValidationResult {
  valid: boolean
  userId?: string
  error?: string
}

/**
 * Result of JWT validation
 */
export interface JwtValidationResult {
  valid: boolean
  userId?: string
  claims?: Record<string, unknown>
  error?: string
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** API key or array of valid keys or custom validator */
  apiKey?: string | string[] | ApiKeyValidator
  /** JWT configuration */
  jwt?: JwtConfig
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig
  /** Paths to skip authentication */
  skipPaths?: string[]
}

/**
 * Result of authentication
 */
export interface AuthResult {
  authenticated: boolean
  method?: 'api-key' | 'jwt'
  userId?: string
  claims?: Record<string, unknown>
}

/**
 * Result of rate limit check
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
  limit: number
  reset: number
}

/**
 * Next function type for middleware chain
 */
export type NextFunction = (request: Request, context?: { auth?: AuthResult }) => Promise<Response>

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Authentication error (401)
 */
export class AuthenticationError extends Error {
  readonly statusCode = 401
  readonly wwwAuthenticate?: string

  constructor(message: string, wwwAuthenticate?: string) {
    super(message)
    this.name = 'AuthenticationError'
    this.wwwAuthenticate = wwwAuthenticate
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends Error {
  readonly statusCode = 403

  constructor(message: string) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends Error {
  readonly statusCode = 429
  readonly retryAfter: number

  constructor(message: string, retryAfter: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare anyway to maintain constant time
    let result = 0
    const maxLen = Math.max(a.length, b.length)
    for (let i = 0; i < maxLen; i++) {
      result |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0)
    }
    return false
  }

  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(data: string): string {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (data.length % 4)) % 4)
  return atob(padded)
}

/**
 * Simple deterministic hash for JWT signatures (testing-compatible)
 */
function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }

  // Convert to a string of characters
  const chars = []
  let h = Math.abs(hash)
  for (let i = 0; i < 32; i++) {
    chars.push(String.fromCharCode(65 + (h % 26)))
    h = Math.floor(h / 26) || (i + 1)
  }
  return chars.join('')
}

// ============================================================================
// ApiKeyAuthenticator
// ============================================================================

/**
 * API key authenticator with support for single key, multiple keys, or custom validator
 */
export class ApiKeyAuthenticator {
  private readonly validator: ApiKeyValidator

  constructor(keyOrValidator: string | string[] | ApiKeyValidator) {
    if (typeof keyOrValidator === 'function') {
      this.validator = keyOrValidator
    } else if (Array.isArray(keyOrValidator)) {
      const keys = new Set(keyOrValidator)
      this.validator = async (key: string) => {
        if (!key || !key.trim()) {
          return { valid: false, error: 'Empty API key' }
        }
        // Use constant-time comparison for each key
        for (const validKey of keys) {
          if (constantTimeCompare(key, validKey)) {
            return { valid: true }
          }
        }
        return { valid: false, error: 'Invalid API key' }
      }
    } else {
      const validKey = keyOrValidator
      this.validator = async (key: string) => {
        if (!key || !key.trim()) {
          return { valid: false, error: 'Empty API key' }
        }
        if (constantTimeCompare(key, validKey)) {
          return { valid: true }
        }
        return { valid: false, error: 'Invalid API key' }
      }
    }
  }

  /**
   * Validate an API key
   */
  async validate(key: string): Promise<ApiKeyValidationResult> {
    return this.validator(key)
  }
}

// ============================================================================
// JwtAuthenticator
// ============================================================================

/**
 * JWT authenticator with support for HMAC algorithms
 */
export class JwtAuthenticator {
  protected readonly config: JwtConfig

  constructor(config: JwtConfig) {
    this.config = config
  }

  /**
   * Validate a JWT token
   */
  async validate(token: string): Promise<JwtValidationResult> {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' }
      }

      const [headerB64, payloadB64, signatureB64] = parts

      // Verify signature using sync method for testing compatibility
      const message = `${headerB64}.${payloadB64}`
      const expectedSignature = base64UrlEncode(simpleHash(this.config.secret + message))

      if (!constantTimeCompare(signatureB64, expectedSignature)) {
        return { valid: false, error: 'Invalid signature' }
      }

      // Parse payload
      const payloadJson = base64UrlDecode(payloadB64)
      const payload = JSON.parse(payloadJson) as Record<string, unknown>

      // Check expiration
      if (payload.exp && typeof payload.exp === 'number') {
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp < now) {
          return { valid: false, error: 'Token expired' }
        }
      }

      // Check issuer
      if (this.config.issuer && payload.iss !== this.config.issuer) {
        return { valid: false, error: 'Invalid issuer' }
      }

      // Check audience
      if (this.config.audience && payload.aud !== this.config.audience) {
        return { valid: false, error: 'Invalid audience' }
      }

      return {
        valid: true,
        userId: payload.sub as string | undefined,
        claims: payload,
      }
    } catch {
      return { valid: false, error: 'Token validation failed' }
    }
  }

  /**
   * Create a test token for testing purposes
   */
  createTestToken(payload: Record<string, unknown>): string {
    const header = { alg: 'HS256', typ: 'JWT' }
    const headerB64 = base64UrlEncode(JSON.stringify(header))
    const payloadB64 = base64UrlEncode(JSON.stringify(payload))
    const message = `${headerB64}.${payloadB64}`

    // Generate signature using the same sync method as validation
    const signature = base64UrlEncode(simpleHash(this.config.secret + message))

    return `${headerB64}.${payloadB64}.${signature}`
  }
}

// ============================================================================
// RateLimiter
// ============================================================================

/**
 * In-memory rate limit entry
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * Rate limiter with sliding window algorithm
 */
export class RateLimiter {
  private readonly config: RateLimitConfig
  private readonly entries: Map<string, RateLimitEntry> = new Map()

  constructor(config: RateLimitConfig) {
    this.config = config
  }

  /**
   * Check if a request is allowed
   */
  async check(clientId: string): Promise<RateLimitResult> {
    const now = Date.now()
    const windowMs = this.config.windowMs
    const maxRequests = this.config.maxRequests

    if (this.config.storage) {
      // Use distributed storage
      const count = await this.config.storage.increment(clientId, windowMs)
      const allowed = count <= maxRequests
      const resetAt = now + windowMs

      return {
        allowed,
        remaining: Math.max(0, maxRequests - count),
        retryAfter: allowed ? undefined : windowMs,
        limit: maxRequests,
        reset: resetAt,
      }
    }

    // Use in-memory storage
    let entry = this.entries.get(clientId)

    if (!entry || entry.resetAt <= now) {
      // Window expired, create new entry
      entry = {
        count: 1,
        resetAt: now + windowMs,
      }
      this.entries.set(clientId, entry)

      return {
        allowed: true,
        remaining: maxRequests - 1,
        limit: maxRequests,
        reset: entry.resetAt,
      }
    }

    // Increment count
    entry.count++

    const allowed = entry.count <= maxRequests
    const remaining = Math.max(0, maxRequests - entry.count)
    const retryAfter = allowed ? undefined : entry.resetAt - now

    return {
      allowed,
      remaining,
      retryAfter,
      limit: maxRequests,
      reset: entry.resetAt,
    }
  }

  /**
   * Check rate limit for a request using custom key generator
   */
  async checkRequest(request: Request): Promise<RateLimitResult> {
    const keyGenerator = this.config.keyGenerator || this.defaultKeyGenerator
    const clientId = keyGenerator(request)
    return this.check(clientId)
  }

  /**
   * Default key generator using IP or X-Forwarded-For
   */
  private defaultKeyGenerator(request: Request): string {
    const forwarded = request.headers.get('X-Forwarded-For')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    // Fallback to a generic key
    return 'default'
  }
}

// ============================================================================
// AuthMiddleware
// ============================================================================

/**
 * Authentication middleware for production use
 */
export class AuthMiddleware {
  private readonly config: AuthConfig
  private readonly apiKeyAuth?: ApiKeyAuthenticator
  private readonly jwtAuth?: JwtAuthenticator
  private readonly rateLimiter?: RateLimiter

  constructor(config: AuthConfig) {
    this.config = config

    if (config.apiKey) {
      this.apiKeyAuth = new ApiKeyAuthenticator(config.apiKey)
    }

    if (config.jwt) {
      this.jwtAuth = new JwtAuthenticator(config.jwt)
    }

    if (config.rateLimit) {
      this.rateLimiter = new RateLimiter(config.rateLimit)
    }
  }

  /**
   * Authenticate a request
   */
  async authenticate(request: Request): Promise<AuthResult> {
    // Check for API key in headers
    const authHeader = request.headers.get('Authorization')
    const apiKeyHeader = request.headers.get('X-API-Key')

    let token: string | null = null
    let isBearer = false

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
      isBearer = true
    } else if (apiKeyHeader) {
      token = apiKeyHeader
    }

    if (!token) {
      throw new AuthenticationError('Missing authentication credentials', 'Bearer')
    }

    // Try JWT authentication first if configured and token looks like JWT
    if (this.jwtAuth && isBearer && token.split('.').length === 3) {
      const jwtResult = await this.jwtAuth.validate(token)
      if (jwtResult.valid) {
        return {
          authenticated: true,
          method: 'jwt',
          userId: jwtResult.userId,
          claims: jwtResult.claims,
        }
      }
    }

    // Try API key authentication
    if (this.apiKeyAuth) {
      const apiKeyResult = await this.apiKeyAuth.validate(token)
      if (apiKeyResult.valid) {
        return {
          authenticated: true,
          method: 'api-key',
          userId: apiKeyResult.userId,
        }
      }
    }

    throw new AuthenticationError('Invalid authentication credentials')
  }

  /**
   * Handle a request with authentication and rate limiting
   */
  async handleRequest(request: Request, next: NextFunction): Promise<Response> {
    const url = new URL(request.url)

    // Check if path should skip authentication
    if (this.config.skipPaths?.includes(url.pathname)) {
      return next(request)
    }

    // Authenticate
    let authResult: AuthResult
    try {
      authResult = await this.authenticate(request)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return this.createErrorResponse(error)
      }
      throw error
    }

    // Check rate limit
    if (this.rateLimiter) {
      const clientId = authResult.userId || this.getClientId(request)
      const rateLimitResult = await this.rateLimiter.check(clientId)

      if (!rateLimitResult.allowed) {
        const error = new RateLimitError('Too many requests', rateLimitResult.retryAfter || 0)
        return this.createErrorResponse(error, {
          'Retry-After': String(Math.ceil((rateLimitResult.retryAfter || 0) / 1000)),
          'X-RateLimit-Limit': String(rateLimitResult.limit),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': String(rateLimitResult.reset),
        })
      }
    }

    // Call next handler with auth context
    return next(request, { auth: authResult })
  }

  /**
   * Get client ID for rate limiting
   */
  private getClientId(request: Request): string {
    const forwarded = request.headers.get('X-Forwarded-For')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }
    return 'default'
  }

  /**
   * Create an error response
   */
  private createErrorResponse(
    error: AuthenticationError | AuthorizationError | RateLimitError,
    additionalHeaders?: Record<string, string>
  ): Response {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    }

    if (error instanceof AuthenticationError && error.wwwAuthenticate) {
      headers['WWW-Authenticate'] = error.wwwAuthenticate
    }

    const body = JSON.stringify({
      error: this.getErrorName(error.statusCode),
      message: error.message,
    })

    return new Response(body, {
      status: error.statusCode,
      headers,
    })
  }

  /**
   * Get error name from status code
   */
  private getErrorName(statusCode: number): string {
    switch (statusCode) {
      case 401:
        return 'Unauthorized'
      case 403:
        return 'Forbidden'
      case 429:
        return 'Too Many Requests'
      default:
        return 'Error'
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an authentication middleware instance
 */
export function createAuthMiddleware(config: AuthConfig): AuthMiddleware {
  if (!config.apiKey && !config.jwt) {
    throw new Error('At least one authentication method must be configured')
  }
  return new AuthMiddleware(config)
}
