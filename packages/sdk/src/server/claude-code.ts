/**
 * @dotdo/claude - ClaudeCode Durable Object
 *
 * Cloudflare Durable Object that wraps Claude Code CLI with capnweb RPC interface
 * matching the Claude Agent SDK API surface.
 *
 * Key Features:
 * - PTY/stdin streaming for interactive input (Baseline #1)
 * - NDJSON stream parsing for real-time updates
 * - Todo/Plan update callbacks
 * - capnweb RPC exposure
 *
 * ## Error Handling Strategy
 *
 * Stream errors (network disconnects, process crashes) are handled via:
 * 1. Session state updated to 'error' with error details in session.error
 * 2. Error event emitted via EventKeys.error(sessionId) for subscribers
 * 3. Process resources cleaned up (marked as dead in ProcessManager)
 * 4. Session state persisted for recovery
 *
 * Clients can:
 * - Subscribe to error events: onError(sessionId, callback)
 * - Check session.status === 'error' and read session.error
 * - Retry by creating a new session or resuming (--resume flag)
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
  ClaudeCodeEnv,
  PermissionMode,
  SessionStatus,
} from '../types/options.js'
import type { CloudflareRuntime, CloudflareNamespace, Sandbox, SandboxNamespace } from '../types/sandbox.js'
import { NDJSONParser, extractTodoUpdates, extractPlanUpdates } from './ndjson-parser.js'
import { ProcessManager, buildCliArgs } from './process-manager.js'
import { TypedEventEmitter, EventKeys } from '../events/emitter.js'
import { AsyncMutex } from '../utils/mutex.js'
import { validateSandboxNamespace } from '../utils/module-validation.js'

/**
 * Get CloudflareRuntime instance from namespace
 *
 * This helper retrieves a runtime instance from the Cloudflare namespace.
 * The function name uses "Sandbox" for backward compatibility, but internally
 * works with CloudflareRuntime.
 *
 * @param namespace - CloudflareNamespace (or SandboxNamespace alias)
 * @param id - Unique identifier for the runtime instance
 * @returns CloudflareRuntime instance
 *
 * @example Using CloudflareRuntime (preferred)
 * ```typescript
 * import type { CloudflareNamespace } from '@dotdo/claude'
 *
 * const namespace: CloudflareNamespace = env.Sandbox
 * const runtime = getSandbox(namespace, sessionId)
 * await runtime.exec('npm install')
 * ```
 *
 * @example Using Sandbox (backward compatible)
 * ```typescript
 * import type { SandboxNamespace } from '@dotdo/claude'
 *
 * const namespace: SandboxNamespace = env.Sandbox
 * const sandbox = getSandbox(namespace, sessionId)
 * await sandbox.exec('npm install')
 * ```
 */
function getSandbox(namespace: CloudflareNamespace, id: string): CloudflareRuntime {
  return namespace.get(id)
}

/**
 * ClaudeCode Durable Object
 *
 * Wraps Claude Code CLI with RPC interface matching Agent SDK
 *
 * ## Concurrency & Locking Strategy
 *
 * Session state is protected by a single AsyncMutex (`storageMutex`) that serializes
 * all storage operations. This design was chosen because:
 *
 * 1. **Shared storage model**: All sessions are stored in a single Map and persisted
 *    together via `put('sessions', this.sessions)`. Per-session mutexes would not
 *    prevent interleaved reads/writes to the shared storage.
 *
 * 2. **Atomic operations**: Session creation, updates, and destruction must be atomic
 *    relative to each other. A single mutex ensures these operations don't interleave.
 *
 * 3. **Simplicity**: Durable Objects already have single-threaded execution guarantees
 *    within the DO instance. The mutex primarily protects against async interleaving
 *    where multiple concurrent requests could cause read-modify-write races.
 *
 * Example race condition prevented:
 * ```
 * // Without mutex:
 * Request A: reads sessions (has session X)
 * Request B: reads sessions (has session X)
 * Request A: adds session Y, writes sessions (X, Y)
 * Request B: adds session Z, writes sessions (X, Z)  // Lost session Y!
 *
 * // With mutex:
 * Request A: acquires lock, reads, adds Y, writes (X, Y), releases
 * Request B: acquires lock, reads (X, Y), adds Z, writes (X, Y, Z), releases
 * ```
 *
 * @example Server usage
 * ```typescript
 * import { ClaudeCode } from '@dotdo/claude/server'
 *
 * export { ClaudeCode }
 *
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const id = env.CLAUDE_CODE.idFromName('default')
 *     const stub = env.CLAUDE_CODE.get(id)
 *     return stub.fetch(request)
 *   }
 * }
 * ```
 *
 * @example Client usage
 * ```typescript
 * const claude = createClaudeClient({ url: 'wss://...' })
 *
 * const session = await claude.createSession({ cwd: '/workspace' })
 *
 * // Interactive input (Baseline #1)
 * await claude.sendMessage(session.id, 'Build a todo app')
 * await claude.sendMessage(session.id, 'Use TypeScript please')
 * ```
 */
export class ClaudeCode extends RpcTarget implements DurableObject {
  private state: DurableObjectState
  private env: ClaudeCodeEnv
  /**
   * CloudflareRuntime instance for executing commands in the sandbox
   *
   * Note: The property name "sandbox" is preserved for backward compatibility,
   * but the type is CloudflareRuntime (Sandbox is a deprecated type alias).
   */
  private sandbox: CloudflareRuntime | null = null
  private sessions: Map<string, ClaudeSession> = new Map()
  private processManager: ProcessManager | null = null
  private parser: NDJSONParser
  private emitter: TypedEventEmitter

  /**
   * Mutex for serializing storage operations.
   *
   * Prevents race conditions when concurrent operations modify session state.
   * All put/get operations on this.state.storage should be wrapped with this mutex.
   *
   * @see persistSessions - main method protected by this mutex
   */
  private storageMutex: AsyncMutex = new AsyncMutex()

  // WebSocket connections for real-time streaming
  private webSockets: Set<WebSocket> = new Set()

  constructor(state: DurableObjectState, env: ClaudeCodeEnv) {
    super()
    this.state = state
    this.env = env
    this.parser = new NDJSONParser()
    this.emitter = new TypedEventEmitter()

    // Restore sessions from storage
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<Map<string, ClaudeSession>>('sessions')
      if (stored) {
        this.sessions = stored
      }
    })
  }

  /**
   * Handle HTTP/WebSocket requests
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // WebSocket upgrade for terminal or streaming
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.handleWebSocketUpgrade(request, url)
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // RPC endpoint - handled by capnweb
    if (url.pathname === '/rpc' || url.pathname === '/api') {
      // Import at runtime to avoid circular dependency
      const { newWorkersRpcResponse } = await import('capnweb')
      return newWorkersRpcResponse(request, this)
    }

    // SSE fallback endpoint
    if (url.pathname.startsWith('/sse/')) {
      return this.handleSSE(request, url)
    }

    return new Response('Not Found', { status: 404 })
  }

  // =========================================================================
  // RPC Methods - Match Claude Agent SDK API
  // =========================================================================

  /**
   * Create a new Claude session
   * Matches: Agent SDK session creation
   */
  async createSession(options: ClaudeCodeOptions = {}): Promise<ClaudeSession> {
    // Initialize sandbox if not already
    if (!this.sandbox) {
      const sandboxNamespace = validateSandboxNamespace(this.env.Sandbox)
      this.sandbox = getSandbox(sandboxNamespace, this.state.id.toString())
    }

    // Set environment variables
    if (this.sandbox.setEnvVars) {
      await this.sandbox.setEnvVars({
        ANTHROPIC_API_KEY: options.apiKey ?? this.env.ANTHROPIC_API_KEY ?? '',
        ...options.env,
      })
    }

    // Generate session ID
    const sessionId = crypto.randomUUID()

    // Create session
    const session: ClaudeSession = {
      id: sessionId,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      cwd: options.cwd ?? '/workspace',
      model: options.model,
      systemPrompt: options.systemPrompt,
      tools: options.tools,
      permissionMode: options.permissionMode ?? 'default',
      maxTurns: options.maxTurns,
      turnCount: 0,
      totalCostUsd: 0,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
    }

    // Store session
    this.sessions.set(sessionId, session)
    await this.persistSessions()

    // Emit session created event
    this.emitter.emit(EventKeys.sessionCreated(sessionId), { sessionId, timestamp: new Date().toISOString() })

    return session
  }

  /**
   * Send a message to Claude (interactive streaming input - Baseline #1)
   * Matches: Agent SDK query() with streaming input
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Initialize process manager if needed
    if (!this.processManager && this.sandbox) {
      this.processManager = new ProcessManager(this.sandbox)
    }

    // If process not running, spawn it
    if (!this.processManager?.isAlive(sessionId)) {
      await this.spawnClaudeProcess(session)
    }

    // Send message via stdin (Baseline #1 - interactive input)
    await this.processManager!.write(sessionId, message)

    // Update session activity
    session.lastActivityAt = new Date().toISOString()
    await this.persistSessions()
  }

  /**
   * Query Claude with a single message (one-shot mode)
   * Matches: Agent SDK query() with string prompt
   *
   * Returns async generator that yields parsed messages
   */
  async *query(
    prompt: string,
    options: Partial<ClaudeCodeOptions> = {}
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const session = await this.createSession(options)

    // Set up message collection
    const messages: SDKMessage[] = []
    let done = false
    let resolve: (() => void) | null = null

    const unsubscribe = this.emitter.on<SDKMessage>(EventKeys.output(session.id), (msg) => {
      messages.push(msg)
      if (resolve) {
        resolve()
        resolve = null
      }
      if (msg.type === 'result') {
        done = true
      }
    })

    try {
      // Send initial message
      await this.sendMessage(session.id, prompt)

      // Yield messages as they arrive
      let lastIndex = 0
      while (!done) {
        if (messages.length > lastIndex) {
          yield messages[lastIndex++]
        } else {
          await new Promise<void>((r) => {
            resolve = r
          })
        }
      }

      // Yield remaining messages
      while (lastIndex < messages.length) {
        yield messages[lastIndex++]
      }
    } finally {
      unsubscribe()
    }
  }

  /**
   * Interrupt the current query
   * Matches: Query.interrupt()
   */
  async interrupt(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.processManager?.signal(sessionId, 'SIGINT')
    session.status = 'interrupted'
    await this.persistSessions()
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<ClaudeSession | null> {
    return this.sessions.get(sessionId) ?? null
  }

  /**
   * Resume a session
   * Matches: options.resume
   */
  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // Reset status if previously completed/error
    if (session.status !== 'active') {
      session.status = 'active'
      session.lastActivityAt = new Date().toISOString()
      await this.persistSessions()
    }

    return session
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<ClaudeSession[]> {
    return Array.from(this.sessions.values())
  }

  /**
   * Destroy session and cleanup
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (session) {
      await this.processManager?.kill(sessionId)
      this.sessions.delete(sessionId)
      await this.persistSessions()

      // Emit session destroyed event
      this.emitter.emit(EventKeys.sessionDestroyed(sessionId), {
        sessionId,
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Get supported models
   * Matches: Query.supportedModels()
   */
  async supportedModels(): Promise<ModelInfo[]> {
    // Return known models - could also exec claude --help to get dynamic list
    return [
      {
        value: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        description: 'Fast, intelligent model for most tasks',
      },
      {
        value: 'claude-opus-4-20250514',
        displayName: 'Claude Opus 4',
        description: 'Most capable model for complex tasks',
      },
      {
        value: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        description: 'Fastest, most cost-effective model',
      },
    ]
  }

  /**
   * Get MCP server status
   * Matches: Query.mcpServerStatus()
   */
  async mcpServerStatus(sessionId: string): Promise<McpServerStatus[]> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    return (
      session.mcpServers?.map((s) => ({
        name: s.name,
        status: s.status ?? 'pending',
      })) ?? []
    )
  }

  /**
   * Set permission mode
   * Matches: Query.setPermissionMode()
   */
  async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    session.permissionMode = mode
    await this.persistSessions()
  }

  // =========================================================================
  // Event Subscription Methods (for callbacks)
  // =========================================================================

  /**
   * Subscribe to todo updates
   */
  onTodoUpdate(sessionId: string, callback: (todos: TodoUpdate) => void): () => void {
    return this.emitter.on(EventKeys.todo(sessionId), callback)
  }

  /**
   * Subscribe to plan updates
   */
  onPlanUpdate(sessionId: string, callback: (plan: PlanUpdate) => void): () => void {
    return this.emitter.on(EventKeys.plan(sessionId), callback)
  }

  /**
   * Subscribe to output events
   */
  onOutput(sessionId: string, callback: (message: SDKMessage) => void): () => void {
    return this.emitter.on(EventKeys.output(sessionId), callback)
  }

  /**
   * Subscribe to tool use events
   */
  onToolUse(sessionId: string, callback: (toolUse: ToolUseEvent) => void): () => void {
    return this.emitter.on(EventKeys.tool(sessionId), callback)
  }

  /**
   * Subscribe to error events
   *
   * Called when stream errors occur (network disconnect, process crash, etc.)
   * The session will also be updated to status='error' with error details.
   */
  onError(sessionId: string, callback: (error: Error) => void): () => void {
    return this.emitter.on(EventKeys.error(sessionId), callback)
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Spawn Claude CLI process with PTY for interactive streaming
   *
   * Uses CloudflareRuntime to start the process in the sandbox environment.
   */
  private async spawnClaudeProcess(session: ClaudeSession): Promise<void> {
    if (!this.sandbox) {
      throw new Error('CloudflareRuntime not initialized')
    }

    if (!this.processManager) {
      this.processManager = new ProcessManager(this.sandbox)
    }

    // Build CLI arguments
    const args = buildCliArgs({
      outputFormat: 'stream-json',
      inputFormat: 'stream-json',
      model: session.model,
      systemPrompt: session.systemPrompt,
      permissionMode: session.permissionMode,
      maxTurns: session.maxTurns,
      tools: session.tools,
      includePartialMessages: true,
      resume: session.cliSessionId,
      cwd: session.cwd,
    })

    // Spawn interactive process
    const { processId } = await this.processManager.spawnInteractive({
      sessionId: session.id,
      cwd: session.cwd,
      args,
      env: {
        ANTHROPIC_API_KEY: this.env.ANTHROPIC_API_KEY ?? '',
      },
    })

    // Start streaming output with proper error handling
    this.streamProcessOutput(session.id, processId).catch(error => {
      this.handleStreamError(session.id, error)
    })
  }

  /**
   * Handle stream errors by updating session state and emitting error event
   */
  private handleStreamError(sessionId: string, error: unknown): void {
    console.error(`Stream error for session ${sessionId}:`, error)

    // Update session state to error
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = 'error'
      session.error = {
        message: error instanceof Error ? error.message : String(error),
        code: 'STREAM_ERROR',
        timestamp: new Date().toISOString(),
        stack: error instanceof Error ? error.stack : undefined,
      }
      session.lastActivityAt = new Date().toISOString()

      // Persist the error state
      this.persistSessions().catch(persistError => {
        console.error('Failed to persist session error state:', persistError)
      })
    }

    // Emit error event for subscribers
    this.emitter.emit(EventKeys.error(sessionId), error)

    // Clean up resources
    this.processManager?.markDead(sessionId)
  }

  /**
   * Stream process output and parse NDJSON
   *
   * Uses CloudflareRuntime.streamProcessLogs to read process output.
   */
  private async streamProcessOutput(sessionId: string, processId: string): Promise<void> {
    if (!this.sandbox?.streamProcessLogs) {
      // Fallback: poll for output if streaming not available
      console.warn('CloudflareRuntime does not support streamProcessLogs, output streaming disabled')
      return
    }

    try {
      const logStream = await this.sandbox.streamProcessLogs(processId)
      const reader = logStream.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const messages = this.parser.parse(chunk)

        for (const message of messages) {
          this.handleParsedMessage(sessionId, message)
        }
      }

      // Flush any remaining buffer content
      const remaining = this.parser.flush()
      for (const message of remaining) {
        this.handleParsedMessage(sessionId, message)
      }
    } catch (error) {
      // Use centralized error handling
      this.handleStreamError(sessionId, error)
    } finally {
      // Mark process as dead (handles normal stream end)
      this.processManager?.markDead(sessionId)
    }
  }

  /**
   * Handle parsed NDJSON message
   */
  private handleParsedMessage(sessionId: string, message: SDKMessage): void {
    // Emit to general output listeners
    this.emitter.emit(EventKeys.output(sessionId), message)

    // Broadcast to WebSocket clients
    this.broadcastToWebSockets(sessionId, message)

    // Handle specific message types
    switch (message.type) {
      case 'system':
        if ('subtype' in message && message.subtype === 'init') {
          this.emitter.emit(EventKeys.init(sessionId), message)

          // Store CLI session ID for resume
          const session = this.sessions.get(sessionId)
          if (session) {
            session.cliSessionId = message.session_id
            this.persistSessions().catch(error => {
              console.error('Failed to persist sessions:', error)
            })
          }
        }
        break

      case 'assistant':
        // Check for tool use (TodoWrite, ExitPlanMode)
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              this.handleToolUse(sessionId, block)
            }
          }
        }
        break

      case 'user':
        // Tool results
        if (message.message?.content && Array.isArray(message.message.content)) {
          for (const block of message.message.content) {
            if (typeof block === 'object' && block.type === 'tool_result') {
              this.emitter.emit(EventKeys.toolResult(sessionId), block)
            }
          }
        }
        break

      case 'result':
        this.handleResultMessage(sessionId, message)
        break
    }
  }

  /**
   * Handle tool use - extract todo/plan updates
   */
  private handleToolUse(
    sessionId: string,
    toolUse: { type: 'tool_use'; id: string; name: string; input: unknown }
  ): void {
    // Emit generic tool use event
    this.emitter.emit(EventKeys.tool(sessionId), {
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
      timestamp: new Date().toISOString(),
    })

    // Special handling for TodoWrite
    if (toolUse.name === 'TodoWrite') {
      const input = toolUse.input as { todos?: Array<{ content: string; status: string; activeForm: string }> }
      if (input.todos) {
        this.emitter.emit(EventKeys.todo(sessionId), {
          todos: input.todos.map((t) => ({
            content: t.content,
            status: t.status as 'pending' | 'in_progress' | 'completed',
            activeForm: t.activeForm,
          })),
          timestamp: new Date().toISOString(),
          sessionId,
        })
      }
    }

    // Special handling for ExitPlanMode (plan updates)
    if (toolUse.name === 'ExitPlanMode') {
      this.emitter.emit(EventKeys.plan(sessionId), {
        plan: '',
        timestamp: new Date().toISOString(),
        sessionId,
      })
    }

    // Check for Write tool to plan files
    if (toolUse.name === 'Write') {
      const input = toolUse.input as { file_path?: string; content?: string }
      if (input.file_path?.includes('.claude/plans/') && input.file_path.endsWith('.md')) {
        this.emitter.emit(EventKeys.plan(sessionId), {
          plan: input.content ?? '',
          planFile: input.file_path,
          timestamp: new Date().toISOString(),
          sessionId,
        })
      }
    }
  }

  /**
   * Handle result message - update session stats
   */
  private handleResultMessage(sessionId: string, message: SDKResultMessage): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.status = message.is_error ? 'error' : 'completed'
      session.turnCount = message.num_turns
      session.totalCostUsd = message.total_cost_usd
      session.usage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      }
      session.lastActivityAt = new Date().toISOString()
      this.persistSessions().catch(error => {
        console.error('Failed to persist sessions:', error)
      })
    }

    this.emitter.emit(EventKeys.result(sessionId), message)
  }

  /**
   * Handle WebSocket upgrade for terminal or streaming
   */
  private handleWebSocketUpgrade(request: Request, url: URL): Response {
    const sessionId = url.searchParams.get('sessionId')
    const mode = url.searchParams.get('mode') ?? 'stream' // 'stream' | 'terminal'

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    this.state.acceptWebSocket(server, [sessionId ?? '', mode])
    this.webSockets.add(server)

    // Set up message handler for terminal mode
    if (mode === 'terminal' && sessionId) {
      this.setupTerminalWebSocket(server, sessionId)
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    })
  }

  /**
   * Setup WebSocket for terminal mode
   */
  private setupTerminalWebSocket(ws: WebSocket, sessionId: string): void {
    ws.addEventListener('message', async (event) => {
      const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer)

      try {
        const msg = JSON.parse(data)

        if (msg.type === 'input' && this.processManager?.isAlive(sessionId)) {
          await this.processManager.write(sessionId, msg.data)
        }
      } catch {
        // Raw input - send directly
        if (this.processManager?.isAlive(sessionId)) {
          await this.processManager.write(sessionId, data)
        }
      }
    })
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  private broadcastToWebSockets(sessionId: string, message: unknown): void {
    const data = JSON.stringify(message)

    for (const ws of this.webSockets) {
      try {
        const tags = this.state.getTags(ws)
        // Send to clients subscribed to this session or all sessions
        if (tags.includes(sessionId) || tags.includes('')) {
          ws.send(data)
        }
      } catch {
        this.webSockets.delete(ws)
      }
    }
  }

  /**
   * Handle SSE fallback connection
   */
  private handleSSE(request: Request, url: URL): Response {
    const sessionId = url.pathname.split('/')[2]

    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    const encoder = new TextEncoder()

    // Subscribe to session events
    const unsubscribe = this.emitter.on(EventKeys.output(sessionId), (msg) => {
      const data = `data: ${JSON.stringify(msg)}\n\n`
      writer.write(encoder.encode(data)).catch(() => {
        unsubscribe()
        writer.close()
      })
    })

    // Handle disconnect
    request.signal.addEventListener('abort', () => {
      unsubscribe()
      writer.close()
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  /**
   * Persist sessions to storage
   *
   * Protected by storageMutex to prevent race conditions when concurrent
   * operations modify session state. Each call acquires the lock, writes
   * to storage, and releases the lock in a finally block.
   */
  private async persistSessions(): Promise<void> {
    const release = await this.storageMutex.acquire()
    try {
      await this.state.storage.put('sessions', this.sessions)
    } finally {
      release()
    }
  }

  // DurableObject lifecycle methods
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Handled in setupTerminalWebSocket
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.webSockets.delete(ws)
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error)
    this.webSockets.delete(ws)
  }
}

// Re-export for convenience
export { getSandbox }
// Types: CloudflareRuntime (preferred) and Sandbox (deprecated alias) are exported from '../types/sandbox.js'
// See: CloudflareRuntime, CloudflareNamespace, CloudflareProcess for canonical type names
