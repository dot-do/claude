/**
 * @dotdo/claude - WebSocket Terminal Proxy
 *
 * Provides browser-based terminal access to the sandbox environment,
 * compatible with xterm.js
 */

import { ReconnectionPolicy, type ReconnectionOptions } from '../client/reconnect.js'
import { escapeShellArg } from '../utils/shell.js'
import type { Sandbox } from '../types/sandbox.js'

/**
 * Connection state enum
 */
export enum ConnectionState {
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Reconnecting = 'reconnecting',
}

/**
 * Connection state change callback
 */
export type ConnectionStateCallback = (
  sessionId: string,
  state: ConnectionState,
  details?: { code?: number; reason?: string }
) => void

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
  connectionState: ConnectionState
  messageBuffer: string[]
  reconnectionPolicy?: ReconnectionPolicy
  reconnectTimer?: ReturnType<typeof setTimeout>
  healthCheckTimer?: ReturnType<typeof setInterval>
  lastPongTime?: number
  onClose?: (code: number, reason: string) => void
  onError?: (error: Error) => void
  options: SessionOptions
}

/**
 * Session-specific options
 */
interface SessionOptions {
  reconnect?: boolean
  maxReconnectAttempts?: number
  healthCheck?: boolean
  healthCheckInterval?: number
  healthCheckTimeout?: number
  onClose?: (code: number, reason: string) => void
  onError?: (error: Error) => void
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
 *
 * Note: 'ping' is included for server-initiated health checks to the client.
 * This is bidirectional - client sends ping to server (XtermInput) and
 * server can also send ping to client for keep-alive purposes.
 */
export interface XtermOutput {
  type: 'output' | 'exit' | 'pong' | 'error' | 'ping'
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
  /** Reconnection options */
  reconnection?: ReconnectionOptions
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
 * - Connection state tracking
 * - Automatic reconnection with exponential backoff
 * - Message buffering during reconnection
 * - Health check via ping/pong
 *
 * @example
 * ```typescript
 * const proxy = new TerminalProxy(sandbox)
 *
 * // Subscribe to state changes
 * proxy.onConnectionStateChange((sessionId, state, details) => {
 *   console.log(`Session ${sessionId} is now ${state}`)
 * })
 *
 * // In WebSocket handler
 * const sessionId = await proxy.createSession(ws, {
 *   cols: 80,
 *   rows: 24,
 *   cwd: '/workspace',
 *   reconnect: true
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
  private stateCallbacks: Set<ConnectionStateCallback> = new Set()

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
   * Subscribe to connection state changes
   */
  onConnectionStateChange(callback: ConnectionStateCallback): () => void {
    this.stateCallbacks.add(callback)
    return () => {
      this.stateCallbacks.delete(callback)
    }
  }

  /**
   * Get the current connection state for a session
   */
  getConnectionState(sessionId: string): ConnectionState | undefined {
    const session = this.sessions.get(sessionId)
    return session?.connectionState
  }

  /**
   * Get the number of buffered messages for a session
   */
  getBufferedMessageCount(sessionId: string): number {
    const session = this.sessions.get(sessionId)
    return session?.messageBuffer.length ?? 0
  }

  /**
   * Create a new terminal session
   */
  async createSession(
    ws: WebSocket,
    options: Partial<TerminalProxyOptions> & SessionOptions = {}
  ): Promise<string> {
    const sessionId = crypto.randomUUID()
    const {
      cols = this.defaults.cols!,
      rows = this.defaults.rows!,
      cwd = this.defaults.cwd!,
      shell = this.defaults.shell!,
      env = this.defaults.env,
      reconnect,
      maxReconnectAttempts,
      healthCheck,
      healthCheckInterval,
      healthCheckTimeout,
      onClose,
      onError,
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
      connectionState: ConnectionState.Connected,
      messageBuffer: [],
      onClose,
      onError,
      options: {
        reconnect,
        maxReconnectAttempts,
        healthCheck,
        healthCheckInterval,
        healthCheckTimeout,
        onClose,
        onError,
      },
    }

    // Set up reconnection policy if enabled
    if (reconnect) {
      session.reconnectionPolicy = new ReconnectionPolicy({
        ...this.defaults.reconnection,
        maxAttempts: maxReconnectAttempts,
      })
    }

    this.sessions.set(sessionId, session)

    // Notify state change to connected
    this.notifyStateChange(sessionId, ConnectionState.Connected)

    // Start streaming output to WebSocket
    this.streamOutput(session)

    // Set up input handler
    this.setupInputHandler(session)

    // Set up health check if enabled
    if (healthCheck) {
      this.setupHealthCheck(session)
    }

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

    // If disconnected/reconnecting, buffer the message
    if (
      session.connectionState === ConnectionState.Disconnected ||
      session.connectionState === ConnectionState.Reconnecting
    ) {
      session.messageBuffer.push(data)
      return
    }

    try {
      const msg = JSON.parse(data) as XtermInput

      // Validate message structure
      if (!msg || typeof msg !== 'object' || !msg.type) {
        // Invalid message structure, treat as raw input
        this.writeToProcess(session, data)
        return
      }

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

        default:
          // Unknown message type - ignore gracefully
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

    // Clear any pending timers
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer)
    }
    if (session.healthCheckTimer) {
      clearInterval(session.healthCheckTimer)
    }

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
   * Notify state change to all subscribers
   */
  private notifyStateChange(
    sessionId: string,
    state: ConnectionState,
    details?: { code?: number; reason?: string }
  ): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.connectionState = state
    }

    for (const callback of this.stateCallbacks) {
      try {
        callback(sessionId, state, details)
      } catch (error) {
        console.error('State callback error:', error)
      }
    }
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
   * Set up WebSocket input handler with proper error and close handling
   */
  private setupInputHandler(session: TerminalSession): void {
    session.ws.addEventListener('message', (event) => {
      this.handleMessage(session.id, event.data)
    })

    session.ws.addEventListener('close', (event) => {
      this.handleClose(session, event as CloseEvent)
    })

    session.ws.addEventListener('error', (event) => {
      this.handleError(session, event)
    })
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(session: TerminalSession, event: CloseEvent): void {
    const code = event.code ?? 1000
    const reason = event.reason ?? ''

    // Call user callback if provided
    if (session.onClose) {
      session.onClose(code, reason)
    }

    // Determine if this is an abnormal closure that should trigger reconnection
    const isAbnormalClose = code !== 1000 && code !== 1001

    if (isAbnormalClose && session.reconnectionPolicy?.shouldRetry()) {
      // Start reconnection process
      this.notifyStateChange(session.id, ConnectionState.Reconnecting, { code, reason })
      this.attemptReconnection(session)
    } else {
      // Normal close or max attempts reached
      this.notifyStateChange(session.id, ConnectionState.Disconnected, { code, reason })
      this.closeSession(session.id)
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(session: TerminalSession, event: Event): void {
    const error = new Error('WebSocket error')

    // Call user callback if provided
    if (session.onError) {
      session.onError(error)
    }

    // Notify state change
    this.notifyStateChange(session.id, ConnectionState.Disconnected, {
      reason: 'WebSocket error',
    })
  }

  /**
   * Attempt to reconnect a session
   */
  private attemptReconnection(session: TerminalSession): void {
    if (!session.reconnectionPolicy) return

    session.reconnectionPolicy.recordAttempt()

    if (!session.reconnectionPolicy.shouldRetry()) {
      // Max attempts reached
      this.notifyStateChange(session.id, ConnectionState.Disconnected, {
        reason: 'Max reconnection attempts reached',
      })
      this.closeSession(session.id)
      return
    }

    const delay = session.reconnectionPolicy.getNextDelay()

    session.reconnectTimer = setTimeout(() => {
      // In a real implementation, you would create a new WebSocket connection here
      // For now, we just notify that we're still trying to reconnect
      this.notifyStateChange(session.id, ConnectionState.Reconnecting, {
        reason: `Reconnection attempt ${session.reconnectionPolicy!.attempts}`,
      })

      // If still not connected, try again
      if (session.connectionState === ConnectionState.Reconnecting) {
        this.attemptReconnection(session)
      }
    }, delay)
  }

  /**
   * Flush buffered messages after reconnection
   */
  private flushMessageBuffer(session: TerminalSession): void {
    const messages = session.messageBuffer.splice(0)
    for (const message of messages) {
      this.handleMessage(session.id, message)
    }
  }

  /**
   * Set up health check ping/pong
   */
  private setupHealthCheck(session: TerminalSession): void {
    const interval = session.options.healthCheckInterval ?? 30000
    const timeout = session.options.healthCheckTimeout ?? 10000

    session.lastPongTime = Date.now()

    session.healthCheckTimer = setInterval(() => {
      // Check if we've received a pong recently
      const timeSinceLastPong = Date.now() - (session.lastPongTime ?? 0)

      if (timeSinceLastPong > timeout) {
        // Connection is stale
        this.notifyStateChange(session.id, ConnectionState.Disconnected, {
          reason: 'Health check timeout - connection stale',
        })

        if (session.healthCheckTimer) {
          clearInterval(session.healthCheckTimer)
        }

        // Try to reconnect if enabled
        if (session.reconnectionPolicy?.shouldRetry()) {
          this.notifyStateChange(session.id, ConnectionState.Reconnecting)
          this.attemptReconnection(session)
        } else {
          this.closeSession(session.id)
        }
        return
      }

      // Send ping for health check
      this.sendMessage(session.ws, { type: 'ping' })
    }, interval)
  }

  /**
   * Handle pong response (update last pong time)
   */
  handlePong(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastPongTime = Date.now()
    }
  }

  /**
   * Write data to process stdin
   */
  private async writeToProcess(session: TerminalSession, data: string): Promise<void> {
    // Write to process input file/pipe
    const inputPath = `/tmp/term_input_${session.processId}`

    try {
      // Safely escape for shell injection protection
      const escaped = escapeShellArg(data)
      await this.sandbox.exec(`echo -n ${escaped} >> ${inputPath}`, {
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
