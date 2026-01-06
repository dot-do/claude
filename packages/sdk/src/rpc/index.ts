/**
 * @dotdo/claude RPC Integration
 *
 * Cap'n Web RPC helpers for bidirectional communication with Claude Code
 */

// Re-export capnweb types (minimal wrapper to avoid direct dependency issues)
export { RpcTarget } from 'capnweb'

// RPC Server
export { ClaudeCodeRpcServer, createRpcHandler, createRpcServer } from './server.js'

// RPC Interfaces
export type {
  IClaudeCodeRpc,
  IClaudeCodeRpcWithCallbacks,
  IStreamCallbacks,
  SessionInfo,
  QueryResult,
  ErrorCode,
} from './interfaces.js'
export { ErrorCodes, RpcError } from './interfaces.js'

// ============================================================================
// RPC Types (for convenience, matches capnweb API)
// ============================================================================

/**
 * RPC Stub type - client-side proxy for remote objects
 */
export type RpcStub<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => RpcPromise<Awaited<R>>
    : never
}

/**
 * RPC Promise - promise that acts as a stub for promise pipelining
 */
export interface RpcPromise<T> extends Promise<T> {
  /**
   * Call a method on the eventual result without waiting
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe(method: string, ...args: any[]): RpcPromise<any>
}

/**
 * Claude sandbox RPC target interface (legacy)
 */
export interface ClaudeSandboxRpc {
  exec(
    command: string,
    options?: { timeout?: number }
  ): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }>
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(
    path: string
  ): Promise<
    {
      name: string
      type: 'file' | 'directory'
      size: number
    }[]
  >
  search(
    query: string,
    options?: {
      path?: string
      maxResults?: number
    }
  ): Promise<
    {
      path: string
      line: number
      match: string
    }[]
  >
  getDiff(): Promise<string>
  ptyWrite(data: string): Promise<void>
  ptyResize(cols: number, rows: number): Promise<void>
}

/**
 * RPC Session options
 */
export interface RpcSessionOptions {
  url: string
  reconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

/**
 * RPC Session state
 */
export type RpcSessionState = 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * RPC Session for managing WebSocket RPC connection
 */
export class RpcSession<T = unknown> {
  private ws: WebSocket | null = null
  private stub: RpcStub<T> | null = null
  private reconnectAttempts = 0
  private _state: RpcSessionState = 'disconnected'
  private stateListeners: Set<(state: RpcSessionState) => void> = new Set()
  private messageListeners: Set<(data: unknown) => void> = new Set()

  constructor(private options: RpcSessionOptions) {}

  get state(): RpcSessionState {
    return this._state
  }

  getStub(): RpcStub<T> {
    if (!this.stub) {
      throw new Error('Not connected')
    }
    return this.stub
  }

  connect(): Promise<RpcStub<T>> {
    this._state = 'connecting'
    this.notifyStateChange()

    return new Promise<RpcStub<T>>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url)

        this.ws.onopen = () => {
          this._state = 'connected'
          this.reconnectAttempts = 0
          this.stub = this.createStub()
          this.notifyStateChange()
          resolve(this.stub)
        }

        this.ws.onclose = () => {
          this._state = 'disconnected'
          this.stub = null
          this.notifyStateChange()
          this.handleReconnect()
        }

        this.ws.onerror = () => {
          this._state = 'error'
          this.notifyStateChange()
          reject(new Error('WebSocket error'))
        }

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            this.handleMessage(data)
          } catch {
            // Ignore malformed messages
          }
        }
      } catch (error) {
        this._state = 'error'
        this.notifyStateChange()
        reject(error)
      }
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.stub = null
    this._state = 'disconnected'
    this.notifyStateChange()
  }

  onStateChange(listener: (state: RpcSessionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  onMessage(listener: (data: unknown) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private createStub(): RpcStub<T> {
    return new Proxy({} as RpcStub<T>, {
      get: (_target, prop) => {
        // IMPORTANT: Return undefined for 'then' to avoid being treated as a thenable
        // When Promise.resolve() receives an object, it checks for a 'then' property
        // to determine if it's a thenable. If we return a function, the Promise
        // will try to use it, causing infinite loops or hanging.
        if (prop === 'then') {
          return undefined
        }
        return (...args: unknown[]) => {
          return this.callRemote(String(prop), args)
        }
      },
    })
  }

  private callRemote(method: string, args: unknown[]): RpcPromise<unknown> {
    const id = crypto.randomUUID()

    const promise = new Promise((resolve, reject) => {
      const handler = (data: unknown) => {
        if (
          typeof data === 'object' &&
          data !== null &&
          'id' in data &&
          (data as { id: string }).id === id
        ) {
          this.messageListeners.delete(handler)
          if ('error' in data) {
            reject(new Error((data as { error: string }).error))
          } else if ('result' in data) {
            resolve((data as { result: unknown }).result)
          }
        }
      }
      this.messageListeners.add(handler)
      this.send({ id, method, args })
    })

    ;(promise as RpcPromise<unknown>).pipe = (method: string, ...args: unknown[]) => {
      return promise.then((result) => {
        if (typeof result === 'object' && result !== null && method in result) {
          const fn = (result as Record<string, unknown>)[method]
          if (typeof fn === 'function') {
            return fn.apply(result, args)
          }
        }
        throw new Error(`Method ${method} not found on result`)
      }) as RpcPromise<unknown>
    }

    return promise as RpcPromise<unknown>
  }

  private handleMessage(data: unknown): void {
    for (const listener of this.messageListeners) {
      listener(data)
    }
  }

  private handleReconnect(): void {
    if (!this.options.reconnect) return
    if (this.reconnectAttempts >= (this.options.maxReconnectAttempts || 5)) return

    this.reconnectAttempts++
    const delay = this.options.reconnectDelay || 1000

    setTimeout(() => {
      this.connect().catch(() => {
        // Reconnect failed, will retry
      })
    }, delay * this.reconnectAttempts)
  }

  private notifyStateChange(): void {
    for (const listener of this.stateListeners) {
      listener(this._state)
    }
  }
}

/**
 * Create a new RPC session
 */
export function createRpcSession<T>(options: RpcSessionOptions): RpcSession<T> {
  return new RpcSession<T>(options)
}

/**
 * Create RPC session from WebSocket URL
 */
export function newWebSocketRpcSession<T>(
  url: string,
  options?: Partial<RpcSessionOptions>
): RpcSession<T> {
  return createRpcSession<T>({
    url,
    reconnect: true,
    reconnectDelay: 1000,
    maxReconnectAttempts: 5,
    ...options,
  })
}
