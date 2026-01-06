/**
 * Module and interface validation utilities
 *
 * These replace unsafe 'as unknown as' type assertions with proper runtime validation.
 * Use these functions to validate dynamically imported modules and interface implementations.
 */

// Import canonical Sandbox types
import type { SandboxNamespace } from '../types/sandbox.js'

// Re-export for convenience
export type { SandboxNamespace }

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * RPC session interface returned by capnweb
 */
interface RpcSession {
  connect(): Promise<void>
  disconnect(): void
  getStub<T>(): T
}

/**
 * Expected interface for the capnweb module
 */
export interface CapnwebModule {
  newHttpBatchRpcSession(url: string): RpcSession
  newWebSocketRpcSession(url: string): RpcSession
}

/**
 * RPC stub with callback support
 */
export interface RpcStubWithCallbacks {
  sendMessageWithCallbacks(
    sessionId: string,
    message: string,
    callbacks: unknown
  ): Promise<void>
}

// Note: DurableObjectId and DurableObjectStub are provided by @cloudflare/workers-types

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Checks if a value is a non-null object.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Checks if an object has a property that is a function.
 */
function hasFunction(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'function'
}

// ============================================================================
// Capnweb Module Validation
// ============================================================================

/**
 * Type guard for capnweb module.
 *
 * Validates that the imported module has the required RPC session factory functions.
 *
 * @param value - The value to check (typically from dynamic import)
 * @returns True if value is a valid CapnwebModule
 *
 * @example
 * ```typescript
 * const capnweb = await import('capnweb')
 * if (isCapnwebModule(capnweb)) {
 *   const session = capnweb.newWebSocketRpcSession(url)
 * }
 * ```
 */
export function isCapnwebModule(value: unknown): value is CapnwebModule {
  if (!isObject(value)) return false

  return (
    hasFunction(value, 'newHttpBatchRpcSession') &&
    hasFunction(value, 'newWebSocketRpcSession')
  )
}

/**
 * Validates and returns a capnweb module, throwing if invalid.
 *
 * @param value - The value to validate
 * @returns The validated CapnwebModule
 * @throws Error if the module doesn't have required functions
 *
 * @example
 * ```typescript
 * const capnweb = validateCapnwebModule(await import('capnweb'))
 * const session = capnweb.newWebSocketRpcSession(url)
 * ```
 */
export function validateCapnwebModule(value: unknown): CapnwebModule {
  if (!isCapnwebModule(value)) {
    throw new Error(
      'Invalid capnweb module: missing required functions (newHttpBatchRpcSession, newWebSocketRpcSession)'
    )
  }
  return value
}

// ============================================================================
// RPC Stub Validation
// ============================================================================

/**
 * Type guard for RPC stub with callback support.
 *
 * Validates that the stub has the sendMessageWithCallbacks method.
 *
 * @param value - The RPC stub to check
 * @returns True if stub supports callbacks
 *
 * @example
 * ```typescript
 * const stub = session.getStub<IClaudeCodeRpc>()
 * if (isRpcStubWithCallbacks(stub)) {
 *   await stub.sendMessageWithCallbacks(sessionId, message, callbacks)
 * }
 * ```
 */
export function isRpcStubWithCallbacks(value: unknown): value is RpcStubWithCallbacks {
  if (!isObject(value)) return false

  return hasFunction(value, 'sendMessageWithCallbacks')
}

/**
 * Validates and returns an RPC stub with callbacks, throwing if unsupported.
 *
 * @param value - The RPC stub to validate
 * @returns The validated stub with callback support
 * @throws Error if the stub doesn't support callbacks
 *
 * @example
 * ```typescript
 * const extendedStub = validateRpcStubWithCallbacks(stub)
 * await extendedStub.sendMessageWithCallbacks(sessionId, message, callbacks)
 * ```
 */
export function validateRpcStubWithCallbacks(value: unknown): RpcStubWithCallbacks {
  if (!isRpcStubWithCallbacks(value)) {
    throw new Error(
      'RPC stub does not support callbacks: sendMessageWithCallbacks method not found'
    )
  }
  return value
}

// ============================================================================
// Sandbox Namespace Validation
// ============================================================================

/**
 * Type guard for Sandbox namespace.
 *
 * Validates that the namespace has the required get method.
 *
 * @param value - The value to check
 * @returns True if value is a valid SandboxNamespace
 *
 * @example
 * ```typescript
 * if (isSandboxNamespace(env.Sandbox)) {
 *   const sandbox = getSandbox(env.Sandbox, id)
 * }
 * ```
 */
export function isSandboxNamespace(value: unknown): value is SandboxNamespace {
  if (!isObject(value)) return false

  return hasFunction(value, 'get')
}

/**
 * Validates and returns a sandbox namespace, throwing if invalid.
 *
 * @param value - The value to validate
 * @returns The validated SandboxNamespace
 * @throws Error if the namespace doesn't have the get method
 *
 * @example
 * ```typescript
 * const namespace = validateSandboxNamespace(env.Sandbox)
 * const sandbox = getSandbox(namespace, id)
 * ```
 */
export function validateSandboxNamespace(value: unknown): SandboxNamespace {
  if (!isSandboxNamespace(value)) {
    throw new Error(
      'Invalid sandbox namespace: missing required method (get)'
    )
  }
  return value
}
