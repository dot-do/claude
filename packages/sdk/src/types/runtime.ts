/**
 * Runtime Interface Types
 *
 * Generic runtime abstraction layer for executing code in different environments.
 * This provides a more generic interface than Sandbox, designed to work across
 * various execution environments (local processes, containers, cloud sandboxes, etc.)
 *
 * @example
 * ```typescript
 * import type { Runtime, RuntimeProcess, ExecResult } from '@dotdo/claude'
 *
 * // Implement a custom runtime
 * class LocalRuntime implements Runtime {
 *   async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
 *     // Execute command locally
 *   }
 *
 *   async startProcess(command: string, options?: ProcessOptions): Promise<RuntimeProcess> {
 *     // Start a long-running process
 *   }
 *
 *   async readFile(path: string): Promise<string> {
 *     // Read file from filesystem
 *   }
 *
 *   async writeFile(path: string, content: string | Uint8Array): Promise<void> {
 *     // Write file to filesystem
 *   }
 * }
 * ```
 */

/**
 * Type guard to check if a value is a valid ExecResult
 *
 * Validates that a value conforms to the ExecResult interface:
 * - Must be a non-null object (not an array)
 * - Must have an exitCode property that is a number
 * - If stdout is present, it must be a string (undefined allowed, null rejected)
 * - If stderr is present, it must be a string (undefined allowed, null rejected)
 *
 * @param value - The unknown value to check
 * @returns True if value is a valid ExecResult object
 *
 * @example Basic usage
 * ```typescript
 * const unknown: unknown = await fetchResult()
 * if (isExecResult(unknown)) {
 *   console.log('Exit code:', unknown.exitCode)
 *   console.log('Output:', unknown.stdout)
 * }
 * ```
 *
 * @example Error handling with type narrowing
 * ```typescript
 * function handleResult(data: unknown): void {
 *   if (!isExecResult(data)) {
 *     throw new TypeError('Invalid exec result format')
 *   }
 *   // data is now safely typed as ExecResult
 *   if (data.exitCode !== 0) {
 *     console.error('Command failed:', data.stderr)
 *   }
 * }
 * ```
 *
 * @example Validating API responses
 * ```typescript
 * async function executeRemoteCommand(cmd: string): Promise<ExecResult> {
 *   const response = await fetch('/api/exec', {
 *     method: 'POST',
 *     body: JSON.stringify({ command: cmd })
 *   })
 *   const data = await response.json()
 *
 *   if (!isExecResult(data)) {
 *     throw new Error('Invalid response from execution API')
 *   }
 *
 *   return data
 * }
 * ```
 */
export function isExecResult(value: unknown): value is ExecResult {
  if (value === null || value === undefined) {
    return false
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const obj = value as Record<string, unknown>

  // exitCode is required and must be a number
  if (typeof obj.exitCode !== 'number') {
    return false
  }

  // stdout is optional but must be string if present
  if (obj.stdout !== undefined && typeof obj.stdout !== 'string') {
    return false
  }

  // stderr is optional but must be string if present
  if (obj.stderr !== undefined && typeof obj.stderr !== 'string') {
    return false
  }

  return true
}

/**
 * Result of executing a command via exec()
 *
 * Contains the exit code and optionally captured stdout/stderr output.
 *
 * @example
 * ```typescript
 * const result: ExecResult = await runtime.exec('ls -la')
 * if (result.exitCode === 0) {
 *   console.log('Output:', result.stdout)
 * } else {
 *   console.error('Error:', result.stderr)
 * }
 * ```
 */
export interface ExecResult {
  /**
   * Exit code of the command (0 typically indicates success)
   */
  exitCode: number

  /**
   * Captured standard output (may be undefined if not captured)
   */
  stdout?: string

  /**
   * Captured standard error (may be undefined if not captured)
   */
  stderr?: string
}

/**
 * Options for executing a command
 */
export interface ExecOptions {
  /**
   * Timeout in milliseconds for the command
   */
  timeout?: number

  /**
   * Environment variables to set for the command
   */
  env?: Record<string, string>
}

/**
 * Options for starting a long-running process
 */
export interface ProcessOptions {
  /**
   * Environment variables to set for the process
   */
  env?: Record<string, string>
}

/**
 * Represents a running process in the runtime environment
 *
 * Provides access to process streams and lifecycle management.
 *
 * @example
 * ```typescript
 * const process: RuntimeProcess = await runtime.startProcess('node server.js')
 *
 * // Read stdout
 * const reader = process.stdout.getReader()
 * const { value, done } = await reader.read()
 *
 * // Wait for process to exit
 * const exitCode = await process.exited
 *
 * // Optionally kill the process
 * await process.kill?.()
 * ```
 */
export interface RuntimeProcess {
  /**
   * Unique identifier for the process
   */
  id: string

  /**
   * Readable stream for standard output
   */
  stdout: ReadableStream<Uint8Array>

  /**
   * Readable stream for standard error
   */
  stderr: ReadableStream<Uint8Array>

  /**
   * Promise that resolves with the exit code when the process completes
   */
  exited: Promise<number>

  /**
   * Kill the process (optional - may not be available in all runtimes)
   */
  kill?(): Promise<void>

  /**
   * Write data to the process's stdin (optional - may not be available in all runtimes)
   */
  write?(data: string | Uint8Array): Promise<void>

  /**
   * Send a signal to the process (optional - may not be available in all runtimes)
   *
   * Common signals:
   * - 'SIGINT': Interrupt signal (Ctrl+C) - allows graceful shutdown
   * - 'SIGTERM': Termination signal - request process to terminate
   * - 'SIGKILL': Kill signal - force immediate termination
   *
   * @param signal - The signal to send (e.g., 'SIGINT', 'SIGTERM', 'SIGKILL')
   * @returns Promise resolving when the signal has been sent
   *
   * @example
   * ```typescript
   * // Send interrupt signal to allow graceful shutdown
   * await process.signal?.('SIGINT')
   * ```
   */
  signal?(signal: string): Promise<void>
}

/**
 * Generic runtime interface for code execution
 *
 * This interface abstracts over different execution environments, providing
 * a consistent API for running commands, managing processes, and file operations.
 *
 * The interface is designed to be compatible with the Sandbox interface,
 * allowing implementations to be used interchangeably where appropriate.
 *
 * @example
 * ```typescript
 * async function runTask(runtime: Runtime) {
 *   // Execute a command and wait for completion
 *   const result = await runtime.exec('npm install', { timeout: 60000 })
 *
 *   if (result.exitCode !== 0) {
 *     throw new Error(`Install failed: ${result.stderr}`)
 *   }
 *
 *   // Start a long-running server
 *   const server = await runtime.startProcess('npm start')
 *
 *   // Read configuration
 *   const config = await runtime.readFile('config.json')
 *
 *   // Write output
 *   await runtime.writeFile('output.txt', 'Hello, World!')
 * }
 * ```
 */
export interface Runtime {
  /**
   * Execute a command and wait for it to complete
   *
   * @param command - The command to execute
   * @param options - Optional execution options (timeout, environment variables)
   * @returns Promise resolving to the execution result with exit code and output
   *
   * @example
   * ```typescript
   * const result = await runtime.exec('echo "Hello"')
   * console.log(result.stdout) // "Hello\n"
   * ```
   */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>

  /**
   * Start a long-running process
   *
   * Unlike exec(), this returns immediately with a process handle that
   * provides access to streams and lifecycle events.
   *
   * @param command - The command to start
   * @param options - Optional process options (environment variables)
   * @returns Promise resolving to a RuntimeProcess handle
   *
   * @example
   * ```typescript
   * const process = await runtime.startProcess('node server.js')
   * console.log('Started process:', process.id)
   *
   * // Wait for exit
   * const exitCode = await process.exited
   * ```
   */
  startProcess(command: string, options?: ProcessOptions): Promise<RuntimeProcess>

  /**
   * Read content from a file
   *
   * @param path - Path to the file to read
   * @returns Promise resolving to the file contents as a string
   *
   * @example
   * ```typescript
   * const content = await runtime.readFile('/app/package.json')
   * const pkg = JSON.parse(content)
   * ```
   */
  readFile(path: string): Promise<string>

  /**
   * Write content to a file
   *
   * @param path - Path to the file to write
   * @param content - Content to write (string or binary data)
   * @returns Promise resolving when the write is complete
   *
   * @example
   * ```typescript
   * await runtime.writeFile('/app/output.txt', 'Hello, World!')
   * await runtime.writeFile('/app/data.bin', new Uint8Array([1, 2, 3]))
   * ```
   */
  writeFile(path: string, content: string | Uint8Array): Promise<void>

  /**
   * Stream logs from a running process (optional)
   *
   * This method allows reading logs from a process that was started earlier,
   * identified by its process ID.
   *
   * @param processId - ID of the process to stream logs from
   * @returns Promise resolving to a readable stream of log data
   */
  streamProcessLogs?(processId: string): Promise<ReadableStream<Uint8Array>>

  /**
   * Kill a running process (optional)
   *
   * Terminates a process identified by its ID.
   *
   * @param processId - ID of the process to kill
   * @returns Promise resolving when the process has been killed
   */
  kill?(processId: string): Promise<void>
}
