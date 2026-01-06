/**
 * Cloudflare Runtime Interface Types
 *
 * Types for the Cloudflare Sandbox/Runtime API (@cloudflare/sandbox).
 * These types represent the Cloudflare-specific execution environment.
 *
 * Note: The "Sandbox" naming is deprecated. New code should use
 * CloudflareRuntime, CloudflareProcess, and CloudflareNamespace.
 *
 * For the generic runtime abstraction, see runtime.ts.
 */

// ============================================================================
// Primary Types (preferred naming)
// ============================================================================

/**
 * Process returned by CloudflareRuntime.startProcess
 *
 * Represents a running process in the Cloudflare runtime environment.
 * Provides Cloudflare-specific functionality like waitForPort.
 */
export interface CloudflareProcess {
  /**
   * Unique identifier for the process
   */
  id: string

  /**
   * Wait for the process to start listening on a specific port
   *
   * Useful for starting servers and ensuring they're ready before proceeding.
   *
   * @param port - The port number to wait for
   * @param options - Optional configuration (timeout in milliseconds)
   */
  waitForPort(port: number, options?: { timeout?: number }): Promise<void>
}

/**
 * CloudflareRuntime interface (matches @cloudflare/sandbox)
 *
 * This is the canonical interface for Cloudflare sandbox/runtime operations.
 * Used by ClaudeCode, ProcessManager, and TerminalProxy.
 *
 * @example
 * ```typescript
 * import type { CloudflareRuntime } from '@dotdo/claude'
 *
 * async function runInCloudflare(runtime: CloudflareRuntime) {
 *   const result = await runtime.exec('npm install')
 *   if (result.exitCode !== 0) {
 *     throw new Error(`Install failed: ${result.stderr}`)
 *   }
 *
 *   const process = await runtime.startProcess('npm start')
 *   await process.waitForPort(3000)
 * }
 * ```
 */
export interface CloudflareRuntime {
  /**
   * Execute a command and wait for it to complete
   *
   * @param command - The command to execute
   * @param options - Optional execution options
   * @returns Promise with exit code and captured output
   */
  exec(
    command: string,
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{
    exitCode: number
    stdout?: string
    stderr?: string
  }>

  /**
   * Start a long-running process
   *
   * @param command - The command to start
   * @param options - Optional process options
   * @returns Promise resolving to a CloudflareProcess handle
   */
  startProcess(
    command: string,
    options?: { env?: Record<string, string> }
  ): Promise<CloudflareProcess>

  /**
   * Write content to a file in the runtime environment
   *
   * @param path - Path to the file
   * @param content - Content to write
   */
  writeFile(path: string, content: string | Uint8Array): Promise<void>

  /**
   * Read content from a file in the runtime environment
   *
   * @param path - Path to the file
   * @returns Promise resolving to file contents
   */
  readFile(path: string): Promise<string>

  /**
   * Stream logs from a running process (optional)
   *
   * @param processId - ID of the process
   * @returns Promise resolving to a readable stream of log data
   */
  streamProcessLogs?(processId: string): Promise<ReadableStream<Uint8Array>>

  /**
   * Set environment variables in the runtime (optional)
   *
   * @param vars - Environment variables to set
   */
  setEnvVars?(vars: Record<string, string>): Promise<void>
}

/**
 * CloudflareNamespace for accessing runtime instances
 *
 * This is a minimal interface that the getRuntime function expects.
 * The full DurableObjectNamespace has more methods, but we only need get().
 *
 * Note: DurableObjectId is provided by @cloudflare/workers-types
 */
export interface CloudflareNamespace {
  get(id: string | DurableObjectId): CloudflareRuntime
}

// ============================================================================
// Deprecated Sandbox Types (backward compatibility)
// Migrate to CloudflareRuntime, CloudflareProcess, CloudflareNamespace
// ============================================================================

/**
 * @deprecated Use CloudflareProcess instead. This type will be removed in a future version.
 *
 * Migration: Replace `SandboxProcess` with `CloudflareProcess` in your code.
 * The interface is identical, only the name has changed.
 *
 * @example Migration Guide
 * ```typescript
 * // Before (deprecated):
 * import type { SandboxProcess } from '@dotdo/claude'
 *
 * function waitForServer(process: SandboxProcess): Promise<void> {
 *   return process.waitForPort(3000)
 * }
 *
 * // After (recommended):
 * import type { CloudflareProcess } from '@dotdo/claude'
 *
 * function waitForServer(process: CloudflareProcess): Promise<void> {
 *   return process.waitForPort(3000)
 * }
 * ```
 *
 * The types are equivalent - this is a simple find-and-replace migration.
 */
export type SandboxProcess = CloudflareProcess

/**
 * @deprecated Use CloudflareRuntime instead. This type will be removed in a future version.
 *
 * Migration: Replace `Sandbox` with `CloudflareRuntime` in your code.
 * The interface is identical, only the name has changed.
 *
 * @example Migration Guide
 * ```typescript
 * // Before (deprecated):
 * import type { Sandbox } from '@dotdo/claude'
 *
 * async function executeInSandbox(sandbox: Sandbox): Promise<void> {
 *   const result = await sandbox.exec('npm install')
 *   if (result.exitCode !== 0) {
 *     throw new Error('Install failed')
 *   }
 *   const process = await sandbox.startProcess('npm start')
 *   await process.waitForPort(3000)
 * }
 *
 * // After (recommended):
 * import type { CloudflareRuntime } from '@dotdo/claude'
 *
 * async function executeInRuntime(runtime: CloudflareRuntime): Promise<void> {
 *   const result = await runtime.exec('npm install')
 *   if (result.exitCode !== 0) {
 *     throw new Error('Install failed')
 *   }
 *   const process = await runtime.startProcess('npm start')
 *   await process.waitForPort(3000)
 * }
 * ```
 *
 * The types are equivalent - this is a simple find-and-replace migration.
 */
export type Sandbox = CloudflareRuntime

/**
 * @deprecated Use CloudflareNamespace instead. This type will be removed in a future version.
 *
 * Migration: Replace `SandboxNamespace` with `CloudflareNamespace` in your code.
 * The interface is identical, only the name has changed.
 *
 * @example Migration Guide
 * ```typescript
 * // Before (deprecated):
 * import type { SandboxNamespace, Sandbox } from '@dotdo/claude'
 *
 * interface Env {
 *   SANDBOX: SandboxNamespace
 * }
 *
 * function getSandbox(env: Env, id: string): Sandbox {
 *   return env.SANDBOX.get(id)
 * }
 *
 * // After (recommended):
 * import type { CloudflareNamespace, CloudflareRuntime } from '@dotdo/claude'
 *
 * interface Env {
 *   RUNTIME: CloudflareNamespace
 * }
 *
 * function getRuntime(env: Env, id: string): CloudflareRuntime {
 *   return env.RUNTIME.get(id)
 * }
 * ```
 *
 * The types are equivalent - this is a simple find-and-replace migration.
 */
export type SandboxNamespace = CloudflareNamespace

