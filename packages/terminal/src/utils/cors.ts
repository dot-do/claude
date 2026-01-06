/**
 * CORS policy for postMessage communication.
 */
export class CorsPolicy {
  constructor(
    private allowedOrigins: string[] = [],
    private mode: 'production' | 'development' = 'production'
  ) {}

  /**
   * Check if an origin is allowed.
   */
  isAllowed(origin: string): boolean {
    // Never allow wildcard in production
    if (origin === '*' && this.mode === 'production') {
      return false
    }

    // In development, allow any origin
    if (this.mode === 'development') {
      return true
    }

    return this.allowedOrigins.includes(origin)
  }

  /**
   * Check if a message from this origin should be processed.
   */
  shouldProcessMessage(origin: string): boolean {
    return this.isAllowed(origin)
  }

  /**
   * Get the target origin for postMessage.
   * Returns specific origin or throws if not configured.
   */
  getTargetOrigin(defaultOrigin?: string): string {
    if (this.allowedOrigins.length > 0) {
      return this.allowedOrigins[0]
    }
    if (defaultOrigin) {
      return defaultOrigin
    }
    if (this.mode === 'development') {
      return '*'
    }
    throw new Error('No target origin configured')
  }
}

/**
 * Configuration options for PostMessage origin validation
 */
export interface PostMessageOriginConfig {
  /** List of allowed origins */
  allowedOrigins: string[]
  /** Whether to allow 'null' origin (sandboxed iframes) */
  allowNullOrigin?: boolean
  /** Whether to allow any origin (development mode only!) */
  allowAnyOrigin?: boolean
}

/**
 * Validates a postMessage event origin against configured allowed origins.
 *
 * Security: This function prevents malicious sites from injecting commands
 * via postMessage by strictly validating the event.origin.
 *
 * @param origin - The event.origin from the MessageEvent
 * @param config - Configuration for allowed origins
 * @returns true if the origin is allowed, false otherwise
 */
export function isOriginAllowed(
  origin: string,
  config: PostMessageOriginConfig
): boolean {
  // Empty origin is never allowed (could be file:// or about:blank)
  if (!origin || origin === '') {
    return false
  }

  // Handle 'null' origin (sandboxed iframes)
  if (origin === 'null') {
    return config.allowNullOrigin === true
  }

  // Development mode bypass (should never be used in production!)
  if (config.allowAnyOrigin === true) {
    return true
  }

  // Check against allowed origins list
  return config.allowedOrigins.includes(origin)
}

/**
 * Parse origin configuration from URL parameters.
 *
 * Supports:
 * - ?allowedOrigin=https://example.com (single origin)
 * - ?allowedOrigins=https://a.com,https://b.com (multiple origins)
 * - ?allowNullOrigin=true (enable null origin for sandboxed iframes)
 *
 * @param search - The URL search string (window.location.search)
 * @returns PostMessageOriginConfig
 */
export function parseOriginConfig(search: string): PostMessageOriginConfig {
  const params = new URLSearchParams(search)

  // Parse allowed origins
  const allowedOrigins: string[] = []

  // Single origin param
  const singleOrigin = params.get('allowedOrigin')
  if (singleOrigin) {
    allowedOrigins.push(singleOrigin)
  }

  // Multiple origins param (comma-separated)
  const multipleOrigins = params.get('allowedOrigins')
  if (multipleOrigins) {
    allowedOrigins.push(...multipleOrigins.split(',').map((o) => o.trim()))
  }

  // Parse null origin flag
  const allowNullOrigin = params.get('allowNullOrigin') === 'true'

  return {
    allowedOrigins,
    allowNullOrigin,
    allowAnyOrigin: false, // Never enable from URL params for security
  }
}

/**
 * Create a postMessage handler with origin validation.
 *
 * @param config - Origin configuration
 * @param onMessage - Callback for valid messages
 * @param onRejected - Optional callback for rejected messages (logging/debugging)
 * @returns Event handler function for window.addEventListener('message', handler)
 */
export function createSecureMessageHandler(
  config: PostMessageOriginConfig,
  onMessage: (event: MessageEvent) => void,
  onRejected?: (origin: string, data: unknown) => void
): (event: MessageEvent) => void {
  return (event: MessageEvent) => {
    if (isOriginAllowed(event.origin, config)) {
      onMessage(event)
    } else {
      onRejected?.(event.origin, event.data)
    }
  }
}
