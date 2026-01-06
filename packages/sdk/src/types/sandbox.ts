/**
 * Sandbox Interface Types
 *
 * Single source of truth for Sandbox-related interfaces.
 * All modules should import from this file.
 */

/**
 * Process returned by startProcess
 */
export interface SandboxProcess {
  id: string
  waitForPort(port: number, options?: { timeout?: number }): Promise<void>
}

/**
 * Sandbox interface (matches @cloudflare/sandbox)
 *
 * This is the canonical interface for sandbox operations.
 * Used by ClaudeCode, ProcessManager, and TerminalProxy.
 */
export interface Sandbox {
  /**
   * Execute a command and wait for it to complete
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
   */
  startProcess(
    command: string,
    options?: { env?: Record<string, string> }
  ): Promise<SandboxProcess>

  /**
   * Write content to a file
   */
  writeFile(path: string, content: string | Uint8Array): Promise<void>

  /**
   * Read content from a file
   */
  readFile(path: string): Promise<string>

  /**
   * Stream logs from a running process (optional)
   */
  streamProcessLogs?(processId: string): Promise<ReadableStream<Uint8Array>>

  /**
   * Set environment variables (optional)
   */
  setEnvVars?(vars: Record<string, string>): Promise<void>
}

/**
 * Sandbox namespace for accessing sandbox instances
 *
 * This is a minimal interface that the getSandbox function expects.
 * The full DurableObjectNamespace has more methods, but we only need get().
 *
 * Note: DurableObjectId is provided by @cloudflare/workers-types
 */
export interface SandboxNamespace {
  get(id: string | DurableObjectId): Sandbox
}
