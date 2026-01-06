/**
 * @dotdo/claude - Process Manager
 *
 * Manages Claude CLI processes with PTY/stdin streaming for interactive input
 * (Baseline #1 requirement)
 */

import { escapeShellArg } from '../utils/shell.js'
import type { Sandbox } from '../types/sandbox.js'

/**
 * Managed process state
 */
interface ManagedProcess {
  id: string
  sessionId: string
  inputPipe: string
  isAlive: boolean
  startedAt: Date
  lastActivityAt: Date
}

/**
 * Process Manager for PTY/stdin streaming
 *
 * Key Features:
 * - Keeps Claude CLI process alive for bidirectional I/O
 * - Uses named pipes for stdin when Sandbox doesn't expose direct stdin
 * - Handles process lifecycle and signals
 * - Supports interactive message sending (Baseline #1)
 *
 * @example
 * ```typescript
 * const manager = new ProcessManager(sandbox)
 *
 * // Spawn interactive Claude process
 * const { processId, inputPipe } = await manager.spawnInteractive(session)
 *
 * // Send message to running process
 * await manager.write(session.id, 'Build a todo app')
 *
 * // Send follow-up while still running (Baseline #1)
 * await manager.write(session.id, 'Use TypeScript please')
 *
 * // Interrupt
 * await manager.signal(session.id, 'SIGINT')
 * ```
 */
export class ProcessManager {
  private sandbox: Sandbox
  private processes: Map<string, ManagedProcess> = new Map()

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox
  }

  /**
   * Spawn an interactive Claude CLI process
   *
   * Uses named pipe for stdin to enable bidirectional communication
   */
  async spawnInteractive(options: {
    sessionId: string
    cwd: string
    args: string[]
    env?: Record<string, string>
  }): Promise<{ processId: string; inputPipe: string }> {
    const { sessionId, cwd, args, env = {} } = options

    // Create unique input pipe path
    const inputPipe = `/tmp/claude_input_${sessionId}`

    // Create named pipe for stdin
    await this.sandbox.exec(`rm -f ${inputPipe} && mkfifo ${inputPipe}`, { timeout: 5000 })

    // Build command that reads from pipe
    // Using tail -f to keep the pipe open for continuous reading
    const claudeArgs = args.join(' ')
    const command = `tail -f ${inputPipe} | claude ${claudeArgs}`

    // Start process in background
    const process = await this.sandbox.startProcess(command, {
      env: {
        HOME: '/home/claude',
        PATH: '/home/claude/.local/bin:/usr/local/bin:/usr/bin:/bin',
        ...env,
      },
    })

    // Register managed process
    const managed: ManagedProcess = {
      id: process.id,
      sessionId,
      inputPipe,
      isAlive: true,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    }

    this.processes.set(sessionId, managed)

    return {
      processId: process.id,
      inputPipe,
    }
  }

  /**
   * Register an externally spawned process
   */
  register(
    sessionId: string,
    processId: string,
    inputPipe: string
  ): void {
    const managed: ManagedProcess = {
      id: processId,
      sessionId,
      inputPipe,
      isAlive: true,
      startedAt: new Date(),
      lastActivityAt: new Date(),
    }

    this.processes.set(sessionId, managed)
  }

  /**
   * Check if process is alive
   */
  isAlive(sessionId: string): boolean {
    return this.processes.get(sessionId)?.isAlive ?? false
  }

  /**
   * Write to process stdin
   *
   * Claude CLI with --input-format stream-json expects NDJSON input:
   * {"type":"user","message":{"role":"user","content":"..."}}
   *
   * For plain text prompts, we format them automatically.
   */
  async write(sessionId: string, data: string): Promise<void> {
    const managed = this.processes.get(sessionId)
    if (!managed || !managed.isAlive) {
      throw new Error(`Process not alive: ${sessionId}`)
    }

    // Format as NDJSON if not already
    let formatted = data.trim()
    if (!formatted.startsWith('{')) {
      formatted = JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: data,
        },
      })
    }

    // Append newline for NDJSON
    formatted += '\n'

    // Write to pipe using echo
    // Safely escape for shell injection protection
    const escaped = escapeShellArg(formatted)
    await this.sandbox.exec(`echo ${escaped} >> ${managed.inputPipe}`, {
      timeout: 5000,
    })

    managed.lastActivityAt = new Date()
  }

  /**
   * Write raw data (without formatting)
   */
  async writeRaw(sessionId: string, data: string): Promise<void> {
    const managed = this.processes.get(sessionId)
    if (!managed || !managed.isAlive) {
      throw new Error(`Process not alive: ${sessionId}`)
    }

    // Write directly to pipe
    await this.sandbox.writeFile(managed.inputPipe, data)
    managed.lastActivityAt = new Date()
  }

  /**
   * Send signal to process
   */
  async signal(sessionId: string, signal: string): Promise<void> {
    const managed = this.processes.get(sessionId)
    if (!managed) {
      throw new Error(`Process not found: ${sessionId}`)
    }

    // Kill process by ID
    await this.sandbox.exec(`kill -${signal} ${managed.id} 2>/dev/null || true`, {
      timeout: 5000,
    })

    if (signal === 'SIGKILL' || signal === '9') {
      managed.isAlive = false
    }
  }

  /**
   * Kill process
   */
  async kill(sessionId: string): Promise<void> {
    const managed = this.processes.get(sessionId)
    if (!managed) return

    managed.isAlive = false

    // Kill process and clean up pipe
    await this.sandbox.exec(
      `kill -9 ${managed.id} 2>/dev/null || true; rm -f ${managed.inputPipe}`,
      { timeout: 5000 }
    )

    this.processes.delete(sessionId)
  }

  /**
   * Get process info
   */
  getProcess(sessionId: string): ManagedProcess | undefined {
    return this.processes.get(sessionId)
  }

  /**
   * Mark process as dead
   */
  markDead(sessionId: string): void {
    const managed = this.processes.get(sessionId)
    if (managed) {
      managed.isAlive = false
    }
  }

  /**
   * Clean up all processes
   */
  async cleanup(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const sessionId of this.processes.keys()) {
      promises.push(this.kill(sessionId))
    }

    await Promise.allSettled(promises)
    this.processes.clear()
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.processes.entries())
      .filter(([_, p]) => p.isAlive)
      .map(([id]) => id)
  }

  /**
   * Get process stats
   */
  getStats(): {
    total: number
    alive: number
    dead: number
  } {
    let alive = 0
    let dead = 0

    for (const process of this.processes.values()) {
      if (process.isAlive) {
        alive++
      } else {
        dead++
      }
    }

    return {
      total: this.processes.size,
      alive,
      dead,
    }
  }
}

/**
 * Build CLI arguments for Claude Code
 */
export function buildCliArgs(options: {
  outputFormat?: 'stream-json' | 'json' | 'text'
  inputFormat?: 'stream-json' | 'text'
  model?: string
  systemPrompt?: string | { type: 'preset'; preset: string; append?: string }
  permissionMode?: string
  maxTurns?: number
  tools?: string[] | { type: 'preset'; preset: string }
  mcpServers?: Record<string, unknown>
  includePartialMessages?: boolean
  resume?: string
  cwd?: string
}): string[] {
  const args: string[] = []

  // Output format (default to stream-json for parsing)
  args.push('--output-format', options.outputFormat ?? 'stream-json')

  // Input format for interactive mode
  if (options.inputFormat) {
    args.push('--input-format', options.inputFormat)
  }

  // Model
  if (options.model) {
    args.push('--model', options.model)
  }

  // System prompt
  if (options.systemPrompt) {
    if (typeof options.systemPrompt === 'string') {
      args.push('--system-prompt', options.systemPrompt)
    } else if (options.systemPrompt.type === 'preset') {
      args.push('--system-prompt-preset', options.systemPrompt.preset)
      if (options.systemPrompt.append) {
        args.push('--append-system-prompt', options.systemPrompt.append)
      }
    }
  }

  // Permission mode
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode)
  }

  // Max turns
  if (options.maxTurns) {
    args.push('--max-turns', options.maxTurns.toString())
  }

  // Tools
  if (options.tools) {
    if (Array.isArray(options.tools)) {
      args.push('--allowed-tools', options.tools.join(','))
    }
  }

  // MCP servers
  if (options.mcpServers) {
    for (const [name, config] of Object.entries(options.mcpServers)) {
      args.push('--mcp-server', `${name}=${JSON.stringify(config)}`)
    }
  }

  // Include partial messages for real-time streaming
  if (options.includePartialMessages) {
    args.push('--include-partial-messages')
  }

  // Resume session
  if (options.resume) {
    args.push('--resume', options.resume)
  }

  // Working directory
  if (options.cwd) {
    args.push('--cwd', options.cwd)
  }

  return args
}
