/**
 * @dotdo/claude - RPC Server
 *
 * capnweb RPC server wrapper for ClaudeCode Durable Object
 */

import { RpcTarget, newWorkersRpcResponse } from 'capnweb'
import type { ClaudeCode } from '../server/claude-code.js'
import type {
  SDKMessage,
  SDKResultMessage,
  ModelInfo,
  McpServerStatus,
} from '../types/messages.js'
import type { TodoUpdate, PlanUpdate } from '../types/events.js'
import type { ClaudeCodeOptions, ClaudeSession, PermissionMode } from '../types/options.js'
import type {
  IClaudeCodeRpc,
  IClaudeCodeRpcWithCallbacks,
  IStreamCallbacks,
} from './interfaces.js'
import { EventKeys } from '../events/emitter.js'

/**
 * RPC server wrapper for ClaudeCode DO
 *
 * Exposes ClaudeCode methods via capnweb RPC protocol
 *
 * @example
 * ```typescript
 * const server = new ClaudeCodeRpcServer(claudeCode)
 *
 * // In fetch handler
 * return newWorkersRpcResponse(request, server)
 * ```
 */
export class ClaudeCodeRpcServer extends RpcTarget implements IClaudeCodeRpcWithCallbacks {
  private claude: ClaudeCode

  constructor(claude: ClaudeCode) {
    super()
    this.claude = claude
  }

  // =========================================================================
  // Session Management
  // =========================================================================

  async createSession(options?: ClaudeCodeOptions): Promise<ClaudeSession> {
    return this.claude.createSession(options)
  }

  async getSession(sessionId: string): Promise<ClaudeSession | null> {
    return this.claude.getSession(sessionId)
  }

  async resumeSession(sessionId: string): Promise<ClaudeSession> {
    return this.claude.resumeSession(sessionId)
  }

  async listSessions(): Promise<ClaudeSession[]> {
    return this.claude.listSessions()
  }

  async destroySession(sessionId: string): Promise<void> {
    return this.claude.destroySession(sessionId)
  }

  // =========================================================================
  // Messaging
  // =========================================================================

  /**
   * Send message (basic, no callbacks)
   */
  async sendMessage(sessionId: string, message: string): Promise<void> {
    return this.claude.sendMessage(sessionId, message)
  }

  /**
   * Send message with streaming callbacks
   *
   * The callbacks parameter leverages capnweb's bidirectional RPC:
   * - Client passes callback stubs
   * - Server invokes them, triggering RPC back to client
   */
  async sendMessageWithCallbacks(
    sessionId: string,
    message: string,
    callbacks: IStreamCallbacks
  ): Promise<void> {
    const unsubscribes: Array<() => void> = []

    try {
      // Subscribe to output events
      unsubscribes.push(
        this.claude.onOutput(sessionId, (msg) => {
          try {
            callbacks.onMessage(msg)
          } catch (error) {
            console.error('Callback error (onMessage):', error)
          }
        })
      )

      // Subscribe to todo updates
      unsubscribes.push(
        this.claude.onTodoUpdate(sessionId, (update) => {
          try {
            callbacks.onTodoUpdate(update)
          } catch (error) {
            console.error('Callback error (onTodoUpdate):', error)
          }
        })
      )

      // Subscribe to plan updates
      unsubscribes.push(
        this.claude.onPlanUpdate(sessionId, (update) => {
          try {
            callbacks.onPlanUpdate(update)
          } catch (error) {
            console.error('Callback error (onPlanUpdate):', error)
          }
        })
      )

      // Wait for completion
      const resultPromise = new Promise<void>((resolve) => {
        const unsub = this.claude.onOutput(sessionId, (msg) => {
          if (msg.type === 'result') {
            try {
              callbacks.onComplete(msg as SDKResultMessage)
            } catch (error) {
              console.error('Callback error (onComplete):', error)
            }
            unsub()
            resolve()
          }
        })
        unsubscribes.push(unsub)
      })

      // Send message
      await this.claude.sendMessage(sessionId, message)

      // Wait for result
      await resultPromise
    } finally {
      // Clean up subscriptions
      for (const unsub of unsubscribes) {
        unsub()
      }
    }
  }

  /**
   * One-shot query (convenience method)
   */
  async query(prompt: string, options?: Partial<ClaudeCodeOptions>): Promise<string> {
    let result = ''

    for await (const msg of this.claude.query(prompt, options)) {
      if (msg.type === 'result' && 'subtype' in msg && msg.subtype === 'success') {
        result = (msg as SDKResultMessage).result ?? ''
      }
    }

    return result
  }

  /**
   * One-shot query with callbacks
   */
  async queryWithCallbacks(
    prompt: string,
    options: Partial<ClaudeCodeOptions>,
    callbacks: IStreamCallbacks
  ): Promise<string> {
    const session = await this.claude.createSession(options)

    try {
      await this.sendMessageWithCallbacks(session.id, prompt, callbacks)

      // Get final result
      const finalSession = await this.claude.getSession(session.id)
      return finalSession?.status === 'completed' ? 'completed' : 'error'
    } finally {
      // Clean up session if it was created for this query
      // Note: Don't destroy if user might want to continue
    }
  }

  // =========================================================================
  // Control
  // =========================================================================

  async interrupt(sessionId: string): Promise<void> {
    return this.claude.interrupt(sessionId)
  }

  async setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void> {
    return this.claude.setPermissionMode(sessionId, mode)
  }

  // =========================================================================
  // Info
  // =========================================================================

  async supportedModels(): Promise<ModelInfo[]> {
    return this.claude.supportedModels()
  }

  async mcpServerStatus(sessionId: string): Promise<McpServerStatus[]> {
    return this.claude.mcpServerStatus(sessionId)
  }
}

/**
 * Create RPC response handler for Worker fetch
 */
export function createRpcHandler(claude: ClaudeCode) {
  const server = new ClaudeCodeRpcServer(claude)

  return (request: Request): Promise<Response> => {
    return newWorkersRpcResponse(request, server)
  }
}

/**
 * Create RPC server instance
 */
export function createRpcServer(claude: ClaudeCode): ClaudeCodeRpcServer {
  return new ClaudeCodeRpcServer(claude)
}
