/**
 * CloudflareRuntime Adapter
 *
 * This module provides an adapter that wraps a CloudflareRuntime (from @cloudflare/sandbox)
 * and exposes it as a generic Runtime interface. This enables code to be written against
 * the generic Runtime interface while using Cloudflare's sandbox implementation underneath.
 *
 * @example
 * ```typescript
 * import { createCloudflareRuntime } from '@dotdo/claude'
 * import type { CloudflareRuntime } from '@dotdo/claude'
 *
 * // Wrap a CloudflareRuntime as a generic Runtime
 * async function useRuntime(cfRuntime: CloudflareRuntime) {
 *   const runtime = createCloudflareRuntime(cfRuntime)
 *
 *   // Use the generic Runtime interface
 *   const result = await runtime.exec('npm install')
 *   const process = await runtime.startProcess('npm start')
 * }
 * ```
 *
 * TDD Issue: claude-0k3.2
 */

import type { CloudflareRuntime, CloudflareProcess } from '../types/sandbox.js'
import type {
  Runtime,
  RuntimeProcess,
  ExecResult,
  ExecOptions,
  ProcessOptions,
} from '../types/runtime.js'

/**
 * Adapts a CloudflareProcess to the RuntimeProcess interface
 *
 * CloudflareProcess provides Cloudflare-specific features like waitForPort(),
 * but doesn't expose streams directly. This adapter creates empty placeholder
 * streams (the actual stream implementation would need to come from the
 * CloudflareRuntime's streamProcessLogs method in a real implementation).
 *
 * @example
 * ```typescript
 * // Access CloudflareProcess-specific features through the adapter
 * const process = await runtime.startProcess('node server.js')
 * if (process instanceof CloudflareProcessAdapter) {
 *   await process.waitForPort(3000, { timeout: 30000 })
 * }
 * ```
 */
export class CloudflareProcessAdapter implements RuntimeProcess {
  readonly id: string
  readonly stdout: ReadableStream<Uint8Array>
  readonly stderr: ReadableStream<Uint8Array>
  readonly exited: Promise<number>

  /**
   * Reference to the underlying CloudflareProcess for advanced operations
   */
  readonly cloudflareProcess: CloudflareProcess

  constructor(cfProcess: CloudflareProcess) {
    this.cloudflareProcess = cfProcess
    this.id = cfProcess.id

    // Create placeholder streams
    // In a real implementation, these would be connected to the actual process streams
    // The CloudflareRuntime.streamProcessLogs can be used to get log streams
    this.stdout = new ReadableStream<Uint8Array>({
      start(controller) {
        // Immediately close - real implementation would connect to actual stdout
        controller.close()
      },
    })

    this.stderr = new ReadableStream<Uint8Array>({
      start(controller) {
        // Immediately close - real implementation would connect to actual stderr
        controller.close()
      },
    })

    // Create a promise that never resolves by default
    // In a real implementation, this would resolve when the process exits
    this.exited = new Promise<number>(() => {
      // Never resolves - real implementation would track process lifecycle
    })
  }

  /**
   * Access the Cloudflare-specific waitForPort method
   *
   * This is a convenience accessor for code that knows it's working with
   * a CloudflareProcess underneath.
   */
  waitForPort(port: number, options?: { timeout?: number }): Promise<void> {
    return this.cloudflareProcess.waitForPort(port, options)
  }
}

/**
 * CloudflareRuntimeAdapter class
 *
 * Wraps a CloudflareRuntime and implements the generic Runtime interface.
 * This allows code to be written against the Runtime interface while
 * using the Cloudflare sandbox implementation.
 *
 * @example
 * ```typescript
 * import { CloudflareRuntimeAdapter } from '@dotdo/claude'
 *
 * const adapter = new CloudflareRuntimeAdapter(cloudflareRuntime)
 *
 * // Use as Runtime
 * const result = await adapter.exec('ls -la')
 *
 * // Access underlying CloudflareRuntime for Cloudflare-specific features
 * const cfRuntime = adapter.cloudflareRuntime
 * ```
 */
export class CloudflareRuntimeAdapter implements Runtime {
  /**
   * Reference to the underlying CloudflareRuntime
   */
  readonly cloudflareRuntime: CloudflareRuntime

  /**
   * Optional method to stream process logs (only if CloudflareRuntime supports it)
   */
  streamProcessLogs?: (processId: string) => Promise<ReadableStream<Uint8Array>>

  constructor(cfRuntime: CloudflareRuntime) {
    this.cloudflareRuntime = cfRuntime

    // Conditionally add streamProcessLogs if the underlying runtime supports it
    if (cfRuntime.streamProcessLogs) {
      this.streamProcessLogs = (processId: string) =>
        cfRuntime.streamProcessLogs!(processId)
    }
  }

  /**
   * Execute a command and wait for it to complete
   *
   * Delegates directly to CloudflareRuntime.exec as the interfaces are compatible.
   */
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    return this.cloudflareRuntime.exec(command, options)
  }

  /**
   * Start a long-running process
   *
   * Creates a CloudflareProcess and wraps it in a RuntimeProcess adapter.
   */
  async startProcess(
    command: string,
    options?: ProcessOptions
  ): Promise<RuntimeProcess> {
    const cfProcess = await this.cloudflareRuntime.startProcess(command, options)
    return new CloudflareProcessAdapter(cfProcess)
  }

  /**
   * Read content from a file
   *
   * Delegates directly to CloudflareRuntime.readFile.
   */
  async readFile(path: string): Promise<string> {
    return this.cloudflareRuntime.readFile(path)
  }

  /**
   * Write content to a file
   *
   * Delegates directly to CloudflareRuntime.writeFile.
   */
  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    return this.cloudflareRuntime.writeFile(path, content)
  }
}

/**
 * Factory function to create a Runtime from a CloudflareRuntime
 *
 * This is the preferred way to create a Runtime adapter as it provides
 * a cleaner API and hides the adapter class implementation details.
 *
 * @param cfRuntime - The CloudflareRuntime to wrap
 * @returns A Runtime interface backed by the CloudflareRuntime
 *
 * @example
 * ```typescript
 * import { createCloudflareRuntime } from '@dotdo/claude'
 *
 * const runtime = createCloudflareRuntime(sandbox)
 *
 * // Now use the generic Runtime interface
 * const result = await runtime.exec('echo hello')
 * console.log(result.stdout) // "hello\n"
 * ```
 */
export function createCloudflareRuntime(cfRuntime: CloudflareRuntime): Runtime {
  return new CloudflareRuntimeAdapter(cfRuntime)
}
