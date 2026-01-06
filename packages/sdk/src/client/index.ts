/**
 * @dotdo/claude Client
 *
 * Typed RPC client for Claude Code with callback support
 */

import { RpcTarget } from 'capnweb'
import type {
  SDKMessage,
  SDKResultMessage,
  ModelInfo,
  McpServerStatus,
} from '../types/messages.js'
import type { TodoUpdate, PlanUpdate, ToolUseEvent } from '../types/events.js'
import type {
  ClaudeCodeOptions,
  ClaudeSession,
  ClaudeClientOptions,
  StreamCallbackHandlers,
  PermissionMode,
} from '../types/options.js'
import type { IClaudeCodeRpc, IStreamCallbacks } from '../rpc/interfaces.js'

// Types for capnweb (minimal to avoid full dependency)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcStub<T> = T & { [key: string]: (...args: any[]) => Promise<any> }

interface RpcSession {
  connect(): Promise<void>
  disconnect(): void
  getStub<T>(): RpcStub<T>
}

/**
 * Callback handler that extends RpcTarget for capnweb bidirectional RPC
 */
class StreamCallbackHandler extends RpcTarget implements IStreamCallbacks {
  private handlers: Partial<StreamCallbackHandlers>

  constructor(handlers: Partial<StreamCallbackHandlers>) {
    super()
    this.handlers = handlers
  }

  onMessage(message: SDKMessage): void {
    this.handlers.onMessage?.(message)
  }

  onTodoUpdate(update: TodoUpdate): void {
    this.handlers.onTodoUpdate?.(update)
  }

  onPlanUpdate(update: PlanUpdate): void {
    this.handlers.onPlanUpdate?.(update)
  }

  onError(error: { code: string; message: string }): void {
    this.handlers.onError?.(error)
  }

  onComplete(result: SDKResultMessage): void {
    this.handlers.onComplete?.(result)
  }
}

/**
 * Claude Code RPC Client
 *
 * Provides a typed client for interacting with ClaudeCode DO via capnweb
 *
 * @example Basic usage
 * ```typescript
 * const claude = new ClaudeClient({
 *   url: 'wss://claude.example.com/rpc',
 * })
 *
 * const session = await claude.createSession({ cwd: '/workspace' })
 * await claude.sendMessage(session.id, 'Build a todo app')
 * ```
 *
 * @example With callbacks (real-time updates)
 * ```typescript
 * const claude = new ClaudeClient({
 *   url: 'wss://claude.example.com/rpc',
 *   callbacks: {
 *     onTodoUpdate: (update) => {
 *       console.log('Todos:', update.todos)
 *     },
 *     onPlanUpdate: (update) => {
 *       console.log('Plan:', update.plan)
 *     },
 *     onMessage: (message) => {
 *       console.log('Message:', message)
 *     }
 *   }
 * })
 *
 * // Interactive input (Baseline #1)
 * await claude.sendMessage(session.id, 'Build a todo app')
 * await claude.sendMessage(session.id, 'Actually, use TypeScript')
 * ```
 */
export class ClaudeClient {
  private options: ClaudeClientOptions
  private session: RpcSession | null = null
  private stub: RpcStub<IClaudeCodeRpc> | null = null
  private callbacks: StreamCallbackHandler | null = null
  private _currentSession: ClaudeSession | null = null
  private _connected: boolean = false
  private reconnectAttempts: number = 0

  constructor(options: ClaudeClientOptions) {
    this.options = {
      transport: 'websocket',
      timeout: 30000,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      ...options,
    }

    // Create callback handler if callbacks provided
    if (options.callbacks) {
      this.callbacks = new StreamCallbackHandler(options.callbacks)
    }
  }

  /**
   * Get current session (if any)
   */
  get currentSession(): ClaudeSession | null {
    return this._currentSession
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this._connected
  }

  /**
   * Connect to RPC server
   */
  async connect(): Promise<void> {
    if (this._connected) return

    try {
      // Import capnweb at runtime - use any to avoid deep type instantiation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const capnweb: any = await import('capnweb')

      // Create RPC session based on transport
      if (this.options.transport === 'http') {
        this.session = capnweb.newHttpBatchRpcSession(this.options.url) as RpcSession
      } else {
        this.session = capnweb.newWebSocketRpcSession(this.options.url) as RpcSession
      }

      await this.session.connect()
      this.stub = this.session.getStub<IClaudeCodeRpc>()
      this._connected = true
      this.reconnectAttempts = 0
    } catch (error) {
      this._connected = false
      throw error
    }
  }

  /**
   * Disconnect from RPC server
   */
  disconnect(): void {
    if (this.session) {
      this.session.disconnect()
      this.session = null
    }
    this.stub = null
    this._connected = false
  }

  /**
   * Ensure connected before making RPC call
   */
  private async ensureConnected(): Promise<RpcStub<IClaudeCodeRpc>> {
    if (!this._connected || !this.stub) {
      await this.connect()
    }
    if (!this.stub) {
      throw new ClaudeClientError('Not connected', 500)
    }
    return this.stub
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  /**
   * Create a new Claude session
   */
  async createSession(options?: ClaudeCodeOptions): Promise<ClaudeSession> {
    const stub = await this.ensureConnected()
    const session = await stub.createSession(options)
    this._currentSession = session
    return session
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<ClaudeSession | null> {
    const stub = await this.ensureConnected()
    return stub.getSession(sessionId)
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    const stub = await this.ensureConnected()
    const session = await stub.resumeSession(sessionId)
    this._currentSession = session
    return session
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<ClaudeSession[]> {
    const stub = await this.ensureConnected()
    return stub.listSessions()
  }

  /**
   * Destroy session and cleanup
   */
  async destroySession(sessionId?: string): Promise<void> {
    const id = sessionId ?? this._currentSession?.id
    if (!id) return

    const stub = await this.ensureConnected()
    await stub.destroySession(id)

    if (this._currentSession?.id === id) {
      this._currentSession = null
    }
  }

  // =========================================================================
  // Messaging (Baseline #1 - Interactive Input)
  // =========================================================================

  /**
   * Send a message to Claude
   *
   * If callbacks were provided in constructor, streaming events
   * will be forwarded to those handlers.
   *
   * Supports interactive input (Baseline #1) - can send multiple
   * messages while Claude is still processing.
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const stub = await this.ensureConnected()

    if (this.callbacks) {
      // Use callback-enabled send
      await (stub as any).sendMessageWithCallbacks(sessionId, message, this.callbacks)
    } else {
      await stub.sendMessage(sessionId, message)
    }
  }

  /**
   * One-shot query (convenience method)
   *
   * Creates a session, sends message, waits for completion
   */
  async query(prompt: string, options?: Partial<ClaudeCodeOptions>): Promise<string> {
    const session = await this.createSession(options)
    await this.sendMessage(session.id, prompt)

    // Wait for completion
    const finalSession = await this.getSession(session.id)
    return finalSession?.status === 'completed' ? 'completed' : 'error'
  }

  // =========================================================================
  // Control
  // =========================================================================

  /**
   * Interrupt current query
   */
  async interrupt(sessionId?: string): Promise<void> {
    const id = sessionId ?? this._currentSession?.id
    if (!id) throw new ClaudeClientError('No session to interrupt', 400)

    const stub = await this.ensureConnected()
    return stub.interrupt(id)
  }

  /**
   * Set permission mode
   */
  async setPermissionMode(mode: PermissionMode, sessionId?: string): Promise<void> {
    const id = sessionId ?? this._currentSession?.id
    if (!id) throw new ClaudeClientError('No active session', 400)

    const stub = await this.ensureConnected()
    return stub.setPermissionMode(id, mode)
  }

  // =========================================================================
  // Info
  // =========================================================================

  /**
   * Get supported models
   */
  async supportedModels(): Promise<ModelInfo[]> {
    const stub = await this.ensureConnected()
    return stub.supportedModels()
  }

  /**
   * Get MCP server status
   */
  async mcpServerStatus(sessionId?: string): Promise<McpServerStatus[]> {
    const id = sessionId ?? this._currentSession?.id
    if (!id) throw new ClaudeClientError('No active session', 400)

    const stub = await this.ensureConnected()
    return stub.mcpServerStatus(id)
  }

  // =========================================================================
  // Callbacks
  // =========================================================================

  /**
   * Update callbacks at runtime
   */
  setCallbacks(callbacks: Partial<StreamCallbackHandlers>): void {
    this.callbacks = new StreamCallbackHandler(callbacks)
  }

  /**
   * Subscribe to todo updates
   */
  onTodoUpdate(callback: (update: TodoUpdate) => void): () => void {
    const existingHandlers = this.callbacks
      ? {
          ...((this.callbacks as any).handlers as Partial<StreamCallbackHandlers>),
        }
      : {}

    this.callbacks = new StreamCallbackHandler({
      ...existingHandlers,
      onTodoUpdate: callback,
    })

    return () => {
      this.callbacks = new StreamCallbackHandler({
        ...existingHandlers,
        onTodoUpdate: undefined,
      })
    }
  }

  /**
   * Subscribe to plan updates
   */
  onPlanUpdate(callback: (update: PlanUpdate) => void): () => void {
    const existingHandlers = this.callbacks
      ? {
          ...((this.callbacks as any).handlers as Partial<StreamCallbackHandlers>),
        }
      : {}

    this.callbacks = new StreamCallbackHandler({
      ...existingHandlers,
      onPlanUpdate: callback,
    })

    return () => {
      this.callbacks = new StreamCallbackHandler({
        ...existingHandlers,
        onPlanUpdate: undefined,
      })
    }
  }

  /**
   * Subscribe to output messages
   */
  onOutput(callback: (message: SDKMessage) => void): () => void {
    const existingHandlers = this.callbacks
      ? {
          ...((this.callbacks as any).handlers as Partial<StreamCallbackHandlers>),
        }
      : {}

    this.callbacks = new StreamCallbackHandler({
      ...existingHandlers,
      onMessage: callback,
    })

    return () => {
      this.callbacks = new StreamCallbackHandler({
        ...existingHandlers,
        onMessage: undefined,
      })
    }
  }
}

/**
 * Error class for Claude client errors
 */
export class ClaudeClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public errorId?: string
  ) {
    super(message)
    this.name = 'ClaudeClientError'
  }
}

/**
 * Create a Claude client instance
 */
export function createClaudeClient(options: ClaudeClientOptions): ClaudeClient {
  return new ClaudeClient(options)
}

// Legacy exports for backward compatibility
export { ClaudeClient as default }

/**
 * Options for creating a session
 * @deprecated Use ClaudeCodeOptions from types
 */
export interface CreateSessionOptions {
  repo?: string
  task?: string
}

/**
 * Options for sending a message
 * @deprecated Use sendMessage directly
 */
export interface SendMessageOptions {
  content: string
  stream?: boolean
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
  path?: string
  depth?: number
}

/**
 * Options for searching
 */
export interface SearchOptions {
  query: string
  path?: string
  type?: 'text' | 'file' | 'symbol'
  maxResults?: number
}
