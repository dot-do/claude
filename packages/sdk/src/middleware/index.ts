/**
 * @dotdo/claude Middleware
 *
 * Authentication and authorization middleware for production use
 */

// Re-export all auth middleware components
export {
  // Main middleware
  AuthMiddleware,
  createAuthMiddleware,

  // Authenticators
  ApiKeyAuthenticator,
  JwtAuthenticator,

  // Rate limiting
  RateLimiter,

  // Error classes
  AuthenticationError,
  AuthorizationError,
  RateLimitError,

  // Types
  type JwtAlgorithm,
  type JwtConfig,
  type RateLimitConfig,
  type RateLimitStorage,
  type ApiKeyValidator,
  type ApiKeyValidationResult,
  type JwtValidationResult,
  type AuthConfig,
  type AuthResult,
  type RateLimitResult,
  type NextFunction,
} from './auth.js'
