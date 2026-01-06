/**
 * @dotdo/claude - WebSocket Terminal Proxy
 *
 * Provides browser-based terminal access to the sandbox environment,
 * compatible with xterm.js
 */

/**
 * Sandbox interface
 */
interface Sandbox {
  exec(
    command: string,
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{
    exitCode: number
    stdout?: string
    stderr?: string
  }>
  startProcess(
    command: string,
    options?: { env?: Record<string, string> }
  ): Promise<{
    id: string
    waitForPort(port: number, options?: { timeout?: number }): Promise<void>
  }>
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  readFile(path: string): Promise<string>
  streamProcessLogs?(processId: string): Promise<ReadableStream<Uint8Array>>
}

/**
 * Terminal session state
 */
interface TerminalSession {
  id: string
  processId: string
  ws: WebSocket
  cols: number
  rows: number
  cwd: string
  shell: string
}

/**
 * xterm.js protocol messages (client -> server)
 */
export interface XtermInput {
  type: 'input' | 'resize' | 'ping'
  data?: string
  cols?: number
  rows?: number
}

/**
 * xterm.js protocol messages (server -> client)
 */
export interface XtermOutput {
  type: 'output' | 'exit' | 'pong' | 'error'
  data?: string
  code?: number
  message?: string
}

/**
 * Terminal proxy options
 */
export interface TerminalProxyOptions {
  /** Default shell */
  shell?: string
  /** Default working directory */
  cwd?: string
  /** Default terminal columns */
  cols?: number
  /** Default terminal rows */
  rows?: number
  /** Environment variables */
  env?: Record<string, string>
}

/**
 * WebSocket Terminal Proxy
 *
 * Provides browser-based terminal access to the sandbox environment,
 * compatible with xterm.js
 *
 * Features:
 * - PTY emulation via sandbox process
 * - Terminal resize support
 * - Input/output streaming
 * - Session management
 *
 * @example
 * ```typescript
 * const proxy = new TerminalProxy(sandbox)
 *
 * // In WebSocket handler
 * const sessionId = await proxy.createSession(ws, {
 *   cols: 80,
 *   rows: 24,
 *   cwd: '/workspace'
 * })
 *
 * // Handle messages
 * ws.onmessage = (event) => {
 *   proxy.handleMessage(sessionId, event.data)
 * }
 * ```
 */
export class TerminalProxy {
  private sandbox: Sandbox
  private sessions: Map<string, TerminalSession> = new Map()
  private defaults: TerminalProxyOptions

  constructor(sandbox: Sandbox, options: TerminalProxyOptions = {}) {
    this.sandbox = sandbox
    this.defaults = {
      shell: '/bin/bash',
      cwd: '/workspace',
      cols: 80,
      rows: 24,
      ...options,
    }
  }

  /**
   * Create a new terminal session
   */
  async createSession(
    ws: WebSocket,
    options: Partial<TerminalProxyOptions> = {}
  ): Promise<string> {
    const sessionId = crypto.randomUUID()
    const {
      cols = this.defaults.cols!,
      rows = this.defaults.rows!,
      cwd = this.defaults.cwd!,
      shell = this.defaults.shell!,
      env = this.defaults.env,
    } = options

    // Start shell process
    const process = await this.sandbox.startProcess(shell, {
      env: {
        TERM: 'xterm-256color',
        COLUMNS: cols.toString(),
        LINES: rows.toString(),
        HOME: '/home/claude',
        PATH: '/home/claude/.local/bin:/usr/local/bin:/usr/bin:/bin',
        ...env,
      },
    })

    const session: TerminalSession = {
      id: sessionId,
      processId: process.id,
      ws,
      cols,
      rows,
      cwd,
      shell,
    }

    this.sessions.set(sessionId, session)

    // Start streaming output to WebSocket
    this.streamOutput(session)

    // Set up input handler
    this.setupInputHandler(session)

    // Send initial ready message
    this.sendMessage(ws, { type: 'output', data: '' })

    return sessionId
  }

  /**
   * Handle WebSocket messages for a terminal session
   */
  handleMessage(sessionId: string, message: string | ArrayBuffer): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const data = typeof message === 'string' ? message : new TextDecoder().decode(message)

    try {
      const msg = JSON.parse(data) as XtermInput

      switch (msg.type) {
        case 'input':
          // Write to process stdin
          if (msg.data) {
            this.writeToProcess(session, msg.data)
          }
          break

        case 'resize':
          // Handle terminal resize
          if (msg.cols && msg.rows) {
            this.resizeTerminal(session, msg.cols, msg.rows)
          }
          break

        case 'ping':
          this.sendMessage(session.ws, { type: 'pong' })
          break
      }
    } catch {
      // Raw input - treat as terminal input
      this.writeToProcess(session, data)
    }
  }

  /**
   * Close a terminal session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    // Kill process
    await this.sandbox.exec(`kill -9 ${session.processId} 2>/dev/null || true`, {
      timeout: 5000,
    })

    this.sessions.delete(sessionId)
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Stream process output to WebSocket
   */
  private async streamOutput(session: TerminalSession): Promise<void> {
    if (!this.sandbox.streamProcessLogs) {
      console.warn('Sandbox does not support streamProcessLogs')
      return
    }

    try {
      const stream = await this.sandbox.streamProcessLogs(session.processId)
      const reader = stream.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Send output to WebSocket
        const output = new TextDecoder().decode(value)
        this.sendMessage(session.ws, {
          type: 'output',
          data: output,
        })
      }
    } catch (error) {
      console.error('Terminal stream error:', error)
      this.sendMessage(session.ws, {
        type: 'error',
        message: error instanceof Error ? error.message : 'Stream error',
      })
    } finally {
      // Session ended
      this.sendMessage(session.ws, {
        type: 'exit',
        code: 0,
      })
    }
  }

  /**
   * Set up WebSocket input handler
   */
  private setupInputHandler(session: TerminalSession): void {
    session.ws.addEventListener('message', (event) => {
      this.handleMessage(session.id, event.data)
    })

    session.ws.addEventListener('close', () => {
      this.closeSession(session.id)
    })

    session.ws.addEventListener('error', () => {
      this.closeSession(session.id)
    })
  }

  /**
   * Write data to process stdin
   */
  private async writeToProcess(session: TerminalSession, data: string): Promise<void> {
    // Write to process input file/pipe
    const inputPath = `/tmp/term_input_${session.processId}`

    try {
      // Escape for shell
      const escaped = data.replace(/'/g, "'\\''")
      await this.sandbox.exec(`echo -n '${escaped}' >> ${inputPath}`, {
        timeout: 5000,
      })
    } catch (error) {
      console.error('Write to terminal error:', error)
    }
  }

  /**
   * Resize terminal
   */
  private async resizeTerminal(session: TerminalSession, cols: number, rows: number): Promise<void> {
    session.cols = cols
    session.rows = rows

    // Send resize signal to process
    try {
      await this.sandbox.exec(
        `stty -F /dev/pts/0 cols ${cols} rows ${rows} 2>/dev/null || true`,
        { timeout: 5000 }
      )
    } catch (error) {
      console.error('Resize terminal error:', error)
    }
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(ws: WebSocket, message: XtermOutput): void {
    try {
      ws.send(JSON.stringify(message))
    } catch (error) {
      console.error('Send message error:', error)
    }
  }
}

/**
 * Create terminal proxy instance
 */
export function createTerminalProxy(sandbox: Sandbox, options?: TerminalProxyOptions): TerminalProxy {
  return new TerminalProxy(sandbox, options)
}
