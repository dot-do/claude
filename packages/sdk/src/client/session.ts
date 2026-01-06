/**
 * ClaudeSession - Runtime-Agnostic Session Management
 *
 * ClaudeSession provides a high-level interface for managing Claude Code sessions
 * that works with any Runtime implementation. This allows the same session logic
 * to work across different execution environments (local processes, containers,
 * cloud sandboxes, etc.)
 *
 * @example Basic usage with a runtime
 * ```typescript
 * import { ClaudeSession } from '@dotdo/claude'
 * import { LocalRuntime } from './my-runtime'
 *
 * const runtime = new LocalRuntime()
 * const session = new ClaudeSession(runtime, {
 *   model: 'claude-3-opus',
 *   cwd: '/workspace',
 * })
 *
 * await session.start()
 * await session.send('Build a todo app')
 * ```
 *
 * @example With custom configuration
 * ```typescript
 * const session = new ClaudeSession(runtime, {
 *   model: 'claude-3-sonnet',
 *   systemPrompt: 'You are a helpful coding assistant',
 *   maxTurns: 20,
 *   maxBudgetUsd: 2.0,
 *   permissionMode: 'acceptEdits',
 * })
 * ```
 */

import type { Runtime, RuntimeProcess } from '../types/runtime.js'
import type {
  PermissionMode,
  SystemPromptConfig,
  McpServerConfig,
  ToolsConfig,
} from '../types/options.js'
import type { SDKMessage, SDKResultMessage } from '../types/messages.js'
import { NDJSONParser } from '../server/ndjson-parser.js'
import { TypedEventEmitter } from '../events/emitter.js'

// ============================================================================
// Session Options
// ============================================================================

/**
 * Configuration options for ClaudeSession
 *
 * These options control the behavior of the Claude session including
 * model selection, system prompt, and resource limits.
 */
export interface ClaudeSessionOptions {
  /**
   * Anthropic API key (if not using environment variable)
   */
  apiKey?: string

  /**
   * Model to use for the session
   * @example 'claude-3-opus-20240229'
   */
  model?: string

  /**
   * Fallback model if primary model is unavailable
   */
  fallbackModel?: string

  /**
   * Working directory for the session
   * @example '/workspace/my-project'
   */
  cwd?: string

  /**
   * Environment variables for the session
   */
  env?: Record<string, string>

  /**
   * System prompt configuration
   * Can be a plain string or a preset configuration
   */
  systemPrompt?: SystemPromptConfig

  /**
   * Tools available to Claude
   */
  tools?: ToolsConfig

  /**
   * Explicitly allowed tools
   */
  allowedTools?: string[]

  /**
   * Explicitly disallowed tools
   */
  disallowedTools?: string[]

  /**
   * Permission mode for tool use
   * - 'default': Ask for confirmation
   * - 'acceptEdits': Auto-accept file edits
   * - 'bypassPermissions': Allow all operations
   * - 'plan': Planning mode only
   */
  permissionMode?: PermissionMode

  /**
   * Allow dangerous permission bypass
   */
  allowDangerouslySkipPermissions?: boolean

  /**
   * Maximum number of conversation turns
   */
  maxTurns?: number

  /**
   * Maximum budget in USD
   */
  maxBudgetUsd?: number

  /**
   * Maximum thinking tokens per turn
   */
  maxThinkingTokens?: number

  /**
   * MCP server configurations
   */
  mcpServers?: Record<string, McpServerConfig>
}

// ============================================================================
// Session Status
// ============================================================================

/**
 * Status of the Claude session
 */
export type ClaudeSessionStatus =
  | 'pending'    // Session created but not started
  | 'starting'   // Session is being initialized
  | 'active'     // Session is running
  | 'completed'  // Session finished successfully
  | 'error'      // Session ended with an error
  | 'aborted'    // Session was manually aborted
  | 'destroyed'  // Session was destroyed and resources cleaned up

// ============================================================================
// ClaudeSession Class
// ============================================================================

/**
 * ClaudeSession provides runtime-agnostic session management for Claude Code.
 *
 * The session accepts any Runtime implementation, making it portable across
 * different execution environments while maintaining consistent session semantics.
 *
 * @example
 * ```typescript
 * const session = new ClaudeSession(runtime, {
 *   model: 'claude-3-opus',
 *   systemPrompt: 'You are a helpful assistant',
 * })
 *
 * console.log(session.id)      // Unique session ID
 * console.log(session.status)  // 'pending'
 *
 * await session.start()
 * await session.send('Hello!')
 * await session.abort()
 * ```
 */
export class ClaudeSession {
  /**
   * Unique identifier for this session
   */
  readonly id: string

  /**
   * The runtime instance for this session
   */
  readonly runtime: Runtime

  /**
   * Session configuration options
   */
  readonly options: ClaudeSessionOptions

  /**
   * When the session was created
   */
  readonly createdAt: string

  /**
   * Current status of the session
   */
  private _status: ClaudeSessionStatus = 'pending'

  /**
   * The running process (set after start() is called)
   */
  private _process: RuntimeProcess | null = null

  /**
   * Buffer of events for replay by multiple consumers
   */
  private _eventsBuffer: SDKMessage[] = []

  /**
   * Whether the event stream has completed
   */
  private _eventsStreamComplete = false

  /**
   * Error that occurred during streaming (if any)
   */
  private _eventsStreamError: Error | null = null

  /**
   * Promise that resolves when the stream is being consumed
   */
  private _eventsStreamPromise: Promise<void> | null = null

  /**
   * Cached result message (set when result event is received)
   */
  private _cachedResult: SDKResultMessage | null = null

  /**
   * Promise that resolves with the result (used for multiple callers)
   */
  private _resultPromise: Promise<SDKResultMessage> | null = null

  /**
   * Event emitter for callback-based event handling
   */
  private _emitter: TypedEventEmitter = new TypedEventEmitter()

  /**
   * Create a new ClaudeSession
   *
   * @param runtime - The Runtime instance to use for execution
   * @param options - Optional session configuration
   * @throws Error if runtime is null or undefined
   *
   * @example
   * ```typescript
   * const runtime = new LocalRuntime()
   * const session = new ClaudeSession(runtime)
   * ```
   *
   * @example With options
   * ```typescript
   * const session = new ClaudeSession(runtime, {
   *   model: 'claude-3-opus',
   *   cwd: '/workspace',
   *   maxTurns: 10,
   * })
   * ```
   */
  constructor(runtime: Runtime, options?: ClaudeSessionOptions) {
    // Validate runtime is provided
    if (runtime === null || runtime === undefined) {
      throw new Error('Runtime is required')
    }

    this.id = generateSessionId()
    this.runtime = runtime
    this.createdAt = new Date().toISOString()

    // Merge options with defaults
    this.options = {
      permissionMode: 'default',
      ...options,
    }
  }

  /**
   * Get the current session status
   */
  get status(): ClaudeSessionStatus {
    return this._status
  }

  /**
   * Get an async iterable of all events from the session
   *
   * Returns an AsyncIterable that yields SDKMessage objects as they are
   * received from the Claude CLI's NDJSON stdout stream. Multiple consumers
   * can iterate over the events independently - events are buffered and
   * replayed to new consumers.
   *
   * The iterable completes when:
   * - The process stdout stream closes
   * - The process exits
   *
   * The iterable throws if:
   * - A stream error occurs
   * - The session is not started or is in error state when accessed
   *
   * @throws Error if the session has not been started yet
   * @throws Error if the session is in error state
   *
   * @example Basic iteration
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   * await session.send('Build a todo app')
   *
   * for await (const event of session.events) {
   *   console.log(event.type, event)
   * }
   * ```
   *
   * @example Filtering events
   * ```typescript
   * for await (const event of session.events) {
   *   if (event.type === 'assistant') {
   *     console.log('Claude says:', event.message.content)
   *   } else if (event.type === 'result') {
   *     console.log('Session completed:', event.subtype)
   *   }
   * }
   * ```
   */
  get events(): AsyncIterable<SDKMessage> {
    // Guard: session must be started
    if (this._status === 'pending' || this._status === 'starting') {
      throw new Error(
        `Session must be started before accessing events (id: ${this.id}). ` +
        'Call start() first and wait for it to complete.'
      )
    }

    // Guard: session must not be in error state
    if (this._status === 'error') {
      throw new Error(
        `Session is in error state (id: ${this.id}). ` +
        'Cannot access events from a session that failed to start.'
      )
    }

    // Guard: session must not be destroyed
    if (this._status === 'destroyed') {
      throw new Error(
        `Session is destroyed (id: ${this.id}). ` +
        'Cannot access events from a destroyed session.'
      )
    }

    // Start consuming the stream if not already started
    if (!this._eventsStreamPromise && this._process) {
      this._eventsStreamPromise = this.consumeEventStream()
    }

    // Return an async iterable that replays buffered events and new events
    return this.createEventsIterable()
  }

  /**
   * Consume the process stdout stream and buffer events
   */
  private async consumeEventStream(): Promise<void> {
    if (!this._process) {
      return
    }

    const parser = new NDJSONParser()
    const reader = this._process.stdout.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { value, done } = await reader.read()

        if (done) {
          // Flush any remaining content
          const remaining = parser.flush()
          for (const msg of remaining) {
            this._eventsBuffer.push(msg)
            // Emit to event callbacks
            this._emitter.emit(msg.type, msg)
            this._emitter.emit('*', msg)
          }
          break
        }

        // Decode and parse the chunk
        const text = decoder.decode(value, { stream: true })
        const messages = parser.parse(text)

        // Add parsed messages to the buffer and emit to callbacks
        for (const msg of messages) {
          this._eventsBuffer.push(msg)
          // Emit to event callbacks
          this._emitter.emit(msg.type, msg)
          this._emitter.emit('*', msg)
        }
      }

      this._eventsStreamComplete = true
    } catch (error) {
      this._eventsStreamError = error instanceof Error ? error : new Error(String(error))
      this._eventsStreamComplete = true
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Create an async iterable that yields events from the buffer
   */
  private createEventsIterable(): AsyncIterable<SDKMessage> {
    const session = this

    return {
      [Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
        let index = 0

        return {
          async next(): Promise<IteratorResult<SDKMessage>> {
            // Wait for the stream consumption to start
            while (true) {
              // If we have more buffered events, yield them
              if (index < session._eventsBuffer.length) {
                const event = session._eventsBuffer[index]
                index++
                return { value: event, done: false }
              }

              // If stream is complete and no more events, we're done
              if (session._eventsStreamComplete) {
                // If there was an error, throw it
                if (session._eventsStreamError) {
                  throw session._eventsStreamError
                }
                return { value: undefined as any, done: true }
              }

              // Wait a bit for more events to arrive
              await new Promise(resolve => setTimeout(resolve, 10))
            }
          },
        }
      },
    }
  }

  /**
   * Start the session
   *
   * Initializes the Claude CLI process via the runtime and prepares it for interaction.
   * The session status transitions from 'pending' to 'starting' to 'active' on success,
   * or to 'error' if the runtime fails to start the process.
   *
   * @returns Promise that resolves when the session is started
   * @throws Error if the session is already started or starting
   * @throws Error if the runtime fails to start the process
   *
   * @example
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   * console.log(session.status) // 'active'
   * ```
   *
   * @example Error handling
   * ```typescript
   * try {
   *   await session.start()
   * } catch (error) {
   *   console.error('Failed to start session:', error)
   *   console.log(session.status) // 'error'
   * }
   * ```
   */
  async start(): Promise<void> {
    // Guard: prevent calling start() on already active session
    if (this._status === 'active') {
      throw new Error(
        `Session is already started (id: ${this.id}). ` +
        'Use abort() to end the current session before starting a new one.'
      )
    }

    // Guard: prevent calling start() while session is starting
    if (this._status === 'starting') {
      throw new Error(
        `Session is already starting (id: ${this.id}). ` +
        'Please wait for the current start() call to complete.'
      )
    }

    // Guard: prevent starting destroyed sessions
    if (this._status === 'destroyed') {
      throw new Error(
        `Cannot start destroyed session (id: ${this.id}). ` +
        'Create a new session to start fresh.'
      )
    }

    // Guard: prevent starting errored or completed sessions
    if (this._status === 'error' || this._status === 'completed' || this._status === 'aborted') {
      throw new Error(
        `Cannot start session in '${this._status}' state (id: ${this.id}). ` +
        'Create a new session to start fresh.'
      )
    }

    // Transition to starting status
    this._status = 'starting'

    try {
      // Build the command to start Claude CLI
      const command = this.buildClaudeCommand()

      // Build process options from session options
      const processOptions = this.buildProcessOptions()

      // Start the process via the runtime
      this._process = await this.runtime.startProcess(command, processOptions)

      // Transition to active status
      this._status = 'active'
    } catch (error) {
      // Transition to error status on failure
      this._status = 'error'
      throw error
    }
  }

  /**
   * Build the Claude CLI command string
   *
   * @returns The command to execute
   */
  private buildClaudeCommand(): string {
    const args: string[] = ['claude', '--output-format', 'stream-json']

    // Add model if specified
    if (this.options.model) {
      args.push('--model', this.options.model)
    }

    // Add permission mode if specified
    if (this.options.permissionMode) {
      switch (this.options.permissionMode) {
        case 'acceptEdits':
          args.push('--allowedTools', 'Edit', 'Write', 'MultiEdit')
          break
        case 'bypassPermissions':
          if (this.options.allowDangerouslySkipPermissions) {
            args.push('--dangerously-skip-permissions')
          }
          break
        case 'plan':
          args.push('--allowedTools', 'Task', 'Bash(git status:*)', 'Bash(git diff:*)')
          break
        // 'default' mode doesn't need special flags
      }
    }

    // Add max turns if specified
    if (this.options.maxTurns !== undefined) {
      args.push('--max-turns', String(this.options.maxTurns))
    }

    return args.join(' ')
  }

  /**
   * Build process options from session options
   *
   * @returns Process options for the runtime
   */
  private buildProcessOptions(): { env?: Record<string, string> } {
    const options: { env?: Record<string, string> } = {}

    if (this.options.env) {
      options.env = { ...this.options.env }
    }

    // Add API key to environment if specified
    if (this.options.apiKey) {
      options.env = {
        ...options.env,
        ANTHROPIC_API_KEY: this.options.apiKey,
      }
    }

    return options
  }

  /**
   * Send a message to Claude
   *
   * Sends a user message to the Claude CLI process via stdin.
   * The message is formatted as NDJSON (newline-delimited JSON) with the
   * appropriate message structure expected by the CLI.
   *
   * The session must be in 'active' status before calling this method.
   * Messages are sent immediately and do not wait for Claude's response.
   * Use the stdout stream from the process to receive responses.
   *
   * @param message - The user message to send to Claude
   * @returns Promise that resolves when the message has been written to stdin
   * @throws Error if the session is not started (status is 'pending' or 'starting')
   * @throws Error if the session is in a terminal state (completed, error, aborted, destroyed)
   * @throws Error if the process does not support stdin writing
   * @throws Error if writing to the process stdin fails
   *
   * @example Basic message sending
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   * await session.send('Build a todo app with React')
   * ```
   *
   * @example Sending multiple messages
   * ```typescript
   * await session.send('Create a new file called app.ts')
   * await session.send('Add a function to calculate fibonacci numbers')
   * await session.send('Write tests for the function')
   * ```
   *
   * @example Error handling
   * ```typescript
   * try {
   *   await session.send('Some message')
   * } catch (error) {
   *   console.error('Failed to send message:', error)
   * }
   * ```
   */
  async send(message: string): Promise<void> {
    // Guard: check for destroyed state first (takes precedence)
    if (this._status === 'destroyed') {
      throw new Error(
        `Cannot send messages to a destroyed session (id: ${this.id}). ` +
        'Create a new session to continue.'
      )
    }

    // Guard: session must be started
    if (this._status === 'pending' || this._status === 'starting') {
      throw new Error(
        `Session must be started before sending messages (id: ${this.id}). ` +
        'Call start() first and wait for it to complete.'
      )
    }

    // Guard: check for terminal states
    if (this._status === 'completed') {
      throw new Error(
        `Cannot send messages to a completed session (id: ${this.id}). ` +
        'Create a new session to continue.'
      )
    }

    if (this._status === 'error') {
      throw new Error(
        `Cannot send messages to a session in error state (id: ${this.id}). ` +
        'Create a new session to continue.'
      )
    }

    if (this._status === 'aborted') {
      throw new Error(
        `Cannot send messages to an aborted session (id: ${this.id}). ` +
        'Create a new session to continue.'
      )
    }

    // Guard: ensure process supports writing to stdin
    if (!this._process?.write) {
      throw new Error(
        `Process does not support stdin writing (id: ${this.id}). ` +
        'This runtime may not support interactive sessions.'
      )
    }

    // Format message as NDJSON for Claude CLI
    // The CLI expects messages in the format: {"type": "user", "message": "..."}
    const ndjsonMessage = JSON.stringify({ type: 'user', message }) + '\n'

    // Write to process stdin
    await this._process.write(ndjsonMessage)
  }

  /**
   * Abort the session
   *
   * Cancels any ongoing operations and ends the session.
   * This method will be fully implemented in a future issue.
   *
   * @returns Promise that resolves when the session is aborted
   *
   * @example
   * ```typescript
   * // Cancel a long-running task
   * await session.abort()
   * console.log(session.status) // 'aborted'
   * ```
   */
  async abort(): Promise<void> {
    // Placeholder implementation - will be implemented in future issue
    this._status = 'aborted'
    // TODO: Implement abort logic
  }

  /**
   * Interrupt the current Claude operation
   *
   * Sends a SIGINT signal to the running process to gracefully interrupt any
   * ongoing operation. Unlike abort(), this does NOT terminate the session -
   * the session remains active and can continue to receive new messages.
   *
   * This is equivalent to pressing Ctrl+C in an interactive terminal session.
   * Claude will stop its current operation but remain ready for new input.
   *
   * This method is a no-op if:
   * - The session is not started (pending/starting)
   * - The session is in a terminal state (completed, error, aborted, destroyed)
   * - The process does not support the signal() method
   *
   * @returns Promise that resolves when the interrupt signal has been sent
   * @throws Error if the signal method fails (e.g., process already terminated)
   *
   * @example Interrupt a long-running task
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   * await session.send('Analyze all files in the repository')
   *
   * // User decides to interrupt
   * await session.interrupt()
   *
   * // Session is still active, can send new messages
   * await session.send('Just analyze the src directory instead')
   * ```
   *
   * @example Interrupt with timeout fallback
   * ```typescript
   * try {
   *   await session.interrupt()
   *   console.log('Interrupted gracefully')
   * } catch (error) {
   *   console.error('Interrupt failed, aborting:', error)
   *   await session.abort()
   * }
   * ```
   */
  async interrupt(): Promise<void> {
    // No-op for non-active sessions
    if (this._status !== 'active') {
      return
    }

    // No-op if process doesn't exist or doesn't support signal
    if (!this._process?.signal) {
      return
    }

    // Send SIGINT to gracefully interrupt the current operation
    await this._process.signal('SIGINT')
  }

  /**
   * Wait for the session to complete and return the result
   *
   * Returns a Promise that resolves with the SDKResultMessage when the session
   * completes. This method blocks until a result event is received from the
   * Claude CLI process.
   *
   * The result is cached, so subsequent calls to waitForResult() will return
   * the same cached result immediately without waiting.
   *
   * @param options - Optional configuration
   * @param options.timeout - Maximum time to wait in milliseconds (default: no timeout)
   * @returns Promise that resolves with the SDKResultMessage
   * @throws Error if the session is not started
   * @throws Error if the session is in error state
   * @throws Error if the session is destroyed
   * @throws Error if timeout is exceeded
   *
   * @example Basic usage
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   * await session.send('Build a todo app')
   *
   * const result = await session.waitForResult()
   * console.log(result.subtype) // 'success'
   * console.log(result.result) // Final result text
   * ```
   *
   * @example With timeout
   * ```typescript
   * try {
   *   const result = await session.waitForResult({ timeout: 30000 })
   *   console.log('Completed:', result.result)
   * } catch (error) {
   *   console.error('Timeout or error:', error)
   * }
   * ```
   *
   * @example Multiple calls (cached)
   * ```typescript
   * const result1 = await session.waitForResult()
   * const result2 = await session.waitForResult() // Returns cached result instantly
   * console.log(result1 === result2) // true
   * ```
   */
  async waitForResult(options?: { timeout?: number }): Promise<SDKResultMessage> {
    // Guard: check for destroyed state first (takes precedence)
    if (this._status === 'destroyed') {
      throw new Error(
        `Cannot wait for result on a destroyed session (id: ${this.id}). ` +
        'Create a new session to continue.'
      )
    }

    // Guard: session must be started
    if (this._status === 'pending' || this._status === 'starting') {
      throw new Error(
        `Session must be started before waiting for result (id: ${this.id}). ` +
        'Call start() first and wait for it to complete.'
      )
    }

    // Guard: session must not be in error state
    if (this._status === 'error') {
      throw new Error(
        `Session is in error state (id: ${this.id}). ` +
        'Cannot wait for result from a session that failed to start.'
      )
    }

    // Return cached result if available
    if (this._cachedResult) {
      return this._cachedResult
    }

    // Return existing promise if already waiting
    if (this._resultPromise) {
      return this._resultPromise
    }

    // Create a new promise to wait for the result
    this._resultPromise = this.waitForResultInternal(options?.timeout)

    return this._resultPromise
  }

  /**
   * Internal method to wait for result event
   */
  private async waitForResultInternal(timeout?: number): Promise<SDKResultMessage> {
    // Create a promise that resolves when we find a result event
    const resultPromise = new Promise<SDKResultMessage>(async (resolve, reject) => {
      try {
        // Iterate through events looking for a result
        for await (const event of this.events) {
          if (event.type === 'result') {
            // Cache the result
            this._cachedResult = event
            // Update session status based on result
            if (event.is_error) {
              this._status = 'error'
            } else {
              this._status = 'completed'
            }
            resolve(event)
            return
          }
        }

        // If we get here, the stream ended without a result
        reject(new Error(
          `Session ended without receiving a result message (id: ${this.id})`
        ))
      } catch (error) {
        reject(error)
      }
    })

    // If no timeout, just return the result promise
    if (!timeout) {
      return resultPromise
    }

    // Create a timeout promise
    const timeoutPromise = new Promise<SDKResultMessage>((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          `Timeout waiting for result after ${timeout}ms (id: ${this.id})`
        ))
      }, timeout)
    })

    // Race between result and timeout
    return Promise.race([resultPromise, timeoutPromise])
  }

  /**
   * Convenience method to send a query and wait for the result
   *
   * This method combines start() + send() + waitForResult() into a single
   * call, making it easy to perform one-shot queries or simple interactions
   * with Claude.
   *
   * If the session is not yet started, this method will start it automatically.
   * If the session is already started, it will just send the message and wait
   * for the result.
   *
   * @param prompt - The user message to send to Claude
   * @param options - Optional configuration
   * @param options.timeout - Maximum time to wait for result in milliseconds
   * @returns Promise that resolves with the SDKResultMessage
   * @throws Error if the session fails to start
   * @throws Error if sending the message fails
   * @throws Error if timeout is exceeded
   *
   * @example Simple one-shot query
   * ```typescript
   * const session = new ClaudeSession(runtime, {
   *   model: 'claude-3-opus',
   * })
   *
   * const result = await session.query('Build a todo app')
   * console.log(result.result)
   * ```
   *
   * @example With timeout
   * ```typescript
   * try {
   *   const result = await session.query('Complex task', { timeout: 30000 })
   *   console.log('Completed:', result.result)
   * } catch (error) {
   *   console.error('Timeout or error:', error)
   * }
   * ```
   *
   * @example Multiple queries on the same session
   * ```typescript
   * const session = new ClaudeSession(runtime)
   *
   * const result1 = await session.query('First task')
   * console.log('First result:', result1.result)
   *
   * const result2 = await session.query('Second task')
   * console.log('Second result:', result2.result)
   * ```
   */
  async query(prompt: string, options?: { timeout?: number }): Promise<SDKResultMessage> {
    // Start the session if it's not already started
    if (this._status === 'pending') {
      await this.start()
    }

    // Send the message
    await this.send(prompt)

    // Wait for and return the result
    return this.waitForResult(options)
  }

  /**
   * Register a callback for a specific event type
   *
   * The callback will be invoked every time an event of the specified type
   * is received from the Claude CLI process. This method integrates with the
   * events AsyncIterable - callbacks are triggered as events are consumed.
   *
   * @param event - The event type to listen for (e.g., 'assistant', 'system', 'result')
   *                Use '*' to listen to all events
   * @param callback - Function to call when the event is received
   * @returns Unsubscribe function to remove the callback
   *
   * @example Listen for assistant messages
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   *
   * const unsubscribe = session.on('assistant', (message) => {
   *   console.log('Claude says:', message.message.content)
   * })
   *
   * // Later, stop listening
   * unsubscribe()
   * ```
   *
   * @example Listen for result events
   * ```typescript
   * session.on('result', (result) => {
   *   console.log('Session completed:', result.subtype)
   *   console.log('Cost:', result.total_cost_usd)
   * })
   * ```
   *
   * @example Listen for all events
   * ```typescript
   * session.on('*', (event) => {
   *   console.log('Event:', event.type)
   * })
   * ```
   */
  on<T = SDKMessage>(event: string, callback: (data: T) => void): () => void {
    return this._emitter.on(event, callback)
  }

  /**
   * Register a one-time callback for a specific event type
   *
   * The callback will be invoked only once, the first time an event of the
   * specified type is received. After being called, the callback is automatically
   * removed.
   *
   * @param event - The event type to listen for
   * @param callback - Function to call when the event is received
   * @returns Unsubscribe function to remove the callback before it fires
   *
   * @example Wait for first assistant message
   * ```typescript
   * session.once('assistant', (message) => {
   *   console.log('First response:', message.message.content)
   * })
   * ```
   *
   * @example Wait for completion
   * ```typescript
   * session.once('result', (result) => {
   *   console.log('Done! Result:', result.result)
   * })
   * ```
   */
  once<T = SDKMessage>(event: string, callback: (data: T) => void): () => void {
    return this._emitter.once(event, callback)
  }

  /**
   * Destroy the session and clean up all resources
   *
   * Terminates any running process and releases all resources associated with
   * the session. After calling destroy(), the session cannot be restarted.
   * This method is idempotent and can be called multiple times safely.
   *
   * @returns Promise that resolves when the session is fully destroyed
   *
   * @example
   * ```typescript
   * const session = new ClaudeSession(runtime)
   * await session.start()
   *
   * // When done, clean up resources
   * await session.destroy()
   * console.log(session.status) // 'destroyed'
   * ```
   *
   * @example Cleanup in error handling
   * ```typescript
   * try {
   *   await session.start()
   *   await session.send('Some task')
   * } catch (error) {
   *   console.error('Session failed:', error)
   * } finally {
   *   // Always clean up
   *   await session.destroy()
   * }
   * ```
   */
  async destroy(): Promise<void> {
    // Idempotent: if already destroyed, do nothing
    if (this._status === 'destroyed') {
      return
    }

    // Kill the process if it exists and has a kill method
    if (this._process?.kill) {
      try {
        await this._process.kill()
      } catch {
        // Ignore errors from kill - we're cleaning up anyway
      }
    }

    // Clear the process reference to release resources
    this._process = null

    // Clean up event listeners to prevent memory leaks
    this._emitter.removeAllListeners()

    // Transition to destroyed status
    this._status = 'destroyed'
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique session ID
 *
 * Format: ses_<timestamp>_<random>
 *
 * @returns Unique session identifier
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `ses_${timestamp}_${random}`
}
