/**
 * Bun Runtime Implementation
 *
 * Implements the Runtime interface for Bun execution using
 * Bun.spawn for process execution.
 */

import type {
  Runtime,
  ExecResult,
  ExecOptions,
  ProcessOptions,
  RuntimeProcess,
} from '../types/runtime.js'

/**
 * Internal type for tracking spawned processes
 */
interface TrackedProcess {
  /** The underlying Bun process */
  proc: ReturnType<typeof Bun.spawn>
  /** The command that was executed */
  command: string
  /** Timestamp when the process was started */
  startedAt: number
  /** Teed stdout stream for multiple readers */
  stdoutTee: ReadableStream<Uint8Array>
}

/**
 * Bun runtime implementation using Bun.spawn
 *
 * Provides execution capabilities using Bun's native process spawning.
 * Tracks spawned processes for cleanup and orphan prevention.
 *
 * @example
 * ```typescript
 * const runtime = new BunRuntime()
 *
 * // Execute a command
 * const result = await runtime.exec('ls -la')
 * console.log(result.stdout)
 *
 * // Execute with timeout
 * const result2 = await runtime.exec('npm install', { timeout: 60000 })
 *
 * // Execute with custom environment
 * const result3 = await runtime.exec('echo $MY_VAR', {
 *   env: { MY_VAR: 'hello' }
 * })
 *
 * // Start a long-running process
 * const process = await runtime.startProcess('node server.js')
 * console.log('Active processes:', runtime.getActiveProcessCount())
 *
 * // Cleanup all processes when done
 * await runtime.killAll()
 * ```
 */
export class BunRuntime implements Runtime {
  /**
   * Registry of active spawned processes for tracking and cleanup
   * Maps process ID to tracked process info
   */
  private readonly processes = new Map<string, TrackedProcess>()
  /**
   * Execute a command and wait for it to complete
   *
   * Uses Bun.spawn under the hood with shell execution. Commands are executed
   * in a shell, so shell syntax (pipes, redirects, etc.) is supported.
   *
   * @param command - The command to execute (supports shell syntax)
   * @param options - Optional execution options
   * @returns Promise resolving to ExecResult with exitCode, stdout, and stderr
   *
   * @example
   * ```typescript
   * const result = await runtime.exec('echo "hello world"')
   * if (result.exitCode === 0) {
   *   console.log(result.stdout) // "hello world\n"
   * }
   * ```
   */
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    // Check if we're running in Bun
    if (typeof Bun === 'undefined') {
      throw new Error('BunRuntime requires Bun environment')
    }

    // Create abort controller for timeout
    const abortController = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        abortController.abort()
      }, options.timeout)
    }

    try {
      // Merge custom env with process.env
      const env = options?.env
        ? { ...process.env, ...options.env }
        : process.env

      // Spawn the process with shell
      const proc = Bun.spawn(['sh', '-c', command], {
        env: env as Record<string, string>,
        stdout: 'pipe',
        stderr: 'pipe',
        signal: abortController.signal,
      })

      // Read stdout and stderr
      const [stdoutBuffer, stderrBuffer] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])

      // Wait for process to exit
      const exitCode = await proc.exited

      return {
        exitCode,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
      }
    } catch (error) {
      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          exitCode: 124, // Standard timeout exit code
          stdout: '',
          stderr: 'Command timed out',
        }
      }

      // Re-throw other errors
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  /**
   * Start a long-running process
   *
   * Unlike exec(), this method returns immediately with a process handle
   * that provides access to stdout/stderr streams and lifecycle events.
   * The process runs in the background until it completes or is killed.
   *
   * @param command - The command to start (supports shell syntax)
   * @param options - Optional process options (environment variables)
   * @returns Promise resolving to a RuntimeProcess handle
   *
   * @example
   * ```typescript
   * // Start a long-running server
   * const process = await runtime.startProcess('node server.js')
   * console.log('Started process:', process.id)
   *
   * // Read stdout stream
   * const reader = process.stdout.getReader()
   * const { value, done } = await reader.read()
   *
   * // Wait for process to complete
   * const exitCode = await process.exited
   *
   * // Or kill it early
   * await process.kill?.()
   * ```
   */
  async startProcess(
    command: string,
    options?: ProcessOptions
  ): Promise<RuntimeProcess> {
    // Check if we're running in Bun
    if (typeof Bun === 'undefined') {
      throw new Error('BunRuntime requires Bun environment')
    }

    // Merge custom env with process.env
    const env = options?.env
      ? { ...process.env, ...options.env }
      : process.env

    // Spawn the process with shell
    const proc = Bun.spawn(['sh', '-c', command], {
      env: env as Record<string, string>,
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const processId = String(proc.pid)

    // Tee the stdout stream so it can be read by multiple consumers
    // One branch goes to the RuntimeProcess, the other is stored for streamProcessLogs
    const [stdoutForProcess, stdoutForLogging] = proc.stdout.tee()

    // Track the process for cleanup
    this.processes.set(processId, {
      proc,
      command,
      startedAt: Date.now(),
      stdoutTee: stdoutForLogging,
    })

    // Remove from tracking when process exits
    proc.exited.then(() => {
      this.processes.delete(processId)
    }).catch(() => {
      // Process may have been killed, still remove from tracking
      this.processes.delete(processId)
    })

    // Create the RuntimeProcess handle
    const runtimeProcess: RuntimeProcess = {
      id: processId,
      stdout: stdoutForProcess,
      stderr: proc.stderr,
      exited: proc.exited,
      kill: async () => {
        proc.kill()
        this.processes.delete(processId)
      },
    }

    return runtimeProcess
  }

  /**
   * Read content from a file
   *
   * Uses Bun.file().text() to read the file as a string.
   *
   * @param filePath - Path to the file to read
   * @returns Promise resolving to the file contents as a string
   * @throws Error if the file does not exist or cannot be read
   *
   * @example
   * ```typescript
   * const content = await runtime.readFile('/app/config.json')
   * console.log(content)
   * ```
   */
  async readFile(filePath: string): Promise<string> {
    // Check if we're running in Bun
    if (typeof Bun === 'undefined') {
      throw new Error('BunRuntime requires Bun environment')
    }

    // Validate path
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('readFile: path must be a non-empty string')
    }

    const file = Bun.file(filePath)

    // Check if the file exists before attempting to read
    const exists = await file.exists()
    if (!exists) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
    }

    return file.text()
  }

  /**
   * Write content to a file
   *
   * Uses Bun.write() to write string or Uint8Array content to a file.
   * Creates parent directories if they do not exist.
   *
   * @param filePath - Path to the file to write
   * @param content - Content to write (string or binary data)
   * @returns Promise resolving when the write is complete
   *
   * @example
   * ```typescript
   * await runtime.writeFile('/app/output.txt', 'Hello, World!')
   * await runtime.writeFile('/app/data.bin', new Uint8Array([1, 2, 3]))
   * ```
   */
  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    // Check if we're running in Bun
    if (typeof Bun === 'undefined') {
      throw new Error('BunRuntime requires Bun environment')
    }

    // Validate path
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('writeFile: path must be a non-empty string')
    }

    // Ensure parent directories exist
    // Extract the directory path from the file path
    const lastSlash = filePath.lastIndexOf('/')
    if (lastSlash > 0) {
      const dirPath = filePath.substring(0, lastSlash)
      // Use mkdir -p via exec to create parent directories
      // This is a simple and reliable approach for nested paths
      await this.exec(`mkdir -p "${dirPath}"`)
    }

    await Bun.write(filePath, content)
  }

  /**
   * Get the count of active (running) processes
   *
   * Useful for monitoring and debugging process leaks.
   *
   * @returns The number of currently tracked active processes
   *
   * @example
   * ```typescript
   * const runtime = new BunRuntime()
   * await runtime.startProcess('sleep 10')
   * console.log(runtime.getActiveProcessCount()) // 1
   * ```
   */
  getActiveProcessCount(): number {
    return this.processes.size
  }

  /**
   * Get IDs of all active processes
   *
   * @returns Array of process IDs currently being tracked
   *
   * @example
   * ```typescript
   * const runtime = new BunRuntime()
   * const p1 = await runtime.startProcess('sleep 10')
   * const p2 = await runtime.startProcess('sleep 20')
   * console.log(runtime.getActiveProcessIds()) // ['12345', '12346']
   * ```
   */
  getActiveProcessIds(): string[] {
    return Array.from(this.processes.keys())
  }

  /**
   * Kill all active processes
   *
   * Terminates all tracked processes. Useful for cleanup when the runtime
   * is no longer needed or during shutdown.
   *
   * @returns Promise that resolves when all processes have been killed
   *
   * @example
   * ```typescript
   * const runtime = new BunRuntime()
   * await runtime.startProcess('node server1.js')
   * await runtime.startProcess('node server2.js')
   *
   * // Cleanup
   * await runtime.killAll()
   * console.log(runtime.getActiveProcessCount()) // 0
   * ```
   */
  async killAll(): Promise<void> {
    const killPromises: Promise<void>[] = []

    for (const [processId, tracked] of this.processes) {
      killPromises.push(
        Promise.resolve().then(() => {
          tracked.proc.kill()
          this.processes.delete(processId)
        })
      )
    }

    await Promise.all(killPromises)
  }

  /**
   * Kill a specific process by ID
   *
   * Terminates a process identified by its ID. This is an implementation
   * of the optional Runtime.kill() method.
   *
   * @param processId - ID of the process to kill
   * @param signal - Optional signal to send (default: 'SIGTERM')
   * @returns Promise resolving when the process has been killed
   * @throws Error if no process with the given ID is found
   *
   * @example
   * ```typescript
   * const runtime = new BunRuntime()
   * const process = await runtime.startProcess('node server.js')
   *
   * // Kill with default SIGTERM
   * await runtime.kill(process.id)
   *
   * // Force kill with SIGKILL
   * await runtime.kill(process.id, 'SIGKILL')
   *
   * // Interrupt with SIGINT
   * await runtime.kill(process.id, 'SIGINT')
   * ```
   */
  async kill(processId: string, signal: string = 'SIGTERM'): Promise<void> {
    const tracked = this.processes.get(processId)
    if (!tracked) {
      throw new Error(`No process found with ID: ${processId}`)
    }

    tracked.proc.kill(signal)
    this.processes.delete(processId)
  }

  /**
   * Stream logs from a running process
   *
   * Returns a ReadableStream that provides access to the stdout of a process
   * that was previously started with startProcess(). The stream is cloned from
   * the original stdout, allowing multiple consumers to read the logs independently.
   *
   * @param processId - ID of the process to stream logs from
   * @returns Promise resolving to a readable stream of stdout data
   * @throws Error if no process with the given ID is found
   *
   * @example
   * ```typescript
   * const runtime = new BunRuntime()
   * const process = await runtime.startProcess('node server.js')
   *
   * // Stream the logs
   * const logStream = await runtime.streamProcessLogs(process.id)
   * const reader = logStream.getReader()
   *
   * while (true) {
   *   const { value, done } = await reader.read()
   *   if (done) break
   *   console.log(new TextDecoder().decode(value))
   * }
   * ```
   */
  async streamProcessLogs(processId: string): Promise<ReadableStream<Uint8Array>> {
    const tracked = this.processes.get(processId)
    if (!tracked) {
      throw new Error(`No process found with ID: ${processId}`)
    }

    // Tee the stored stdout stream to allow multiple readers
    // Each call to streamProcessLogs creates a new tee, so multiple consumers can read independently
    const [stream1, stream2] = tracked.stdoutTee.tee()

    // Update the tracked process with one branch of the tee
    tracked.stdoutTee = stream2

    // Return the other branch to the caller
    return stream1
  }
}
