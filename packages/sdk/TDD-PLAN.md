# SDK TDD Hardening Plan

> Comprehensive Red-Green-Refactor plan for all identified issues

## Overview

This plan addresses 23 issues identified across 4 reviews:
- **Critical (2)**: Race conditions, silently swallowed errors
- **High (8)**: Type safety, test coverage, memory leaks
- **Medium (8)**: Architectural, naming, documentation
- **Low (5)**: Polish, enhancements

---

## Phase 1: Critical Bug Fixes

### 1.1 Race Condition in Session Mutex

**Location**: `src/server/claude-code.ts:266-267`

**Problem**: Session added to in-memory map BEFORE mutex lock acquired. If `persistSessions()` fails, in-memory state is inconsistent with storage.

```typescript
// Current (buggy)
this.sessions.set(sessionId, session)
await this.persistSessions()
```

#### RED Test
```typescript
// src/server/claude-code.test.ts
describe('Session Creation Atomicity', () => {
  it('should not add session to map if persistence fails', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const mockState = createMockState()

    // Make storage.put throw
    mockState.storage.put = vi.fn().mockRejectedValue(new Error('Storage failed'))

    const claude = new ClaudeCode(mockState, mockEnv)

    await expect(claude.createSession({ apiKey: 'test' }))
      .rejects.toThrow('Storage failed')

    // Session should NOT be in the map since transaction failed
    // @ts-expect-error - accessing private for test
    expect(claude.sessions.size).toBe(0)
  })

  it('should rollback session on partial failure', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const mockState = createMockState()

    let callCount = 0
    mockState.storage.put = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) throw new Error('First write failed')
    })

    const claude = new ClaudeCode(mockState, mockEnv)

    await expect(claude.createSession({ apiKey: 'test' }))
      .rejects.toThrow('First write failed')

    // @ts-expect-error - accessing private for test
    expect(claude.sessions.size).toBe(0)
  })
})
```

#### GREEN Fix
```typescript
// Move session creation inside mutex-protected block
async createSession(options: CreateSessionOptions): Promise<ClaudeSession> {
  // ... validation ...

  const session: ClaudeSession = { /* ... */ }

  // Atomic: add to map and persist together
  const release = await this.storageMutex.acquire()
  try {
    this.sessions.set(sessionId, session)
    await this.state.storage.put('sessions', Object.fromEntries(this.sessions))
  } catch (error) {
    // Rollback in-memory state
    this.sessions.delete(sessionId)
    throw error
  } finally {
    release()
  }

  // Emit event only after successful persistence
  this.emitter.emit(EventKeys.sessionCreated(sessionId), { sessionId, timestamp: new Date().toISOString() })

  return session
}
```

#### REFACTOR
- Extract atomic storage pattern to reusable helper
- Apply same pattern to `sendMessage`, `updateSession`, etc.

---

### 1.2 Silently Swallowed WebSocket Errors

**Location**: `src/rpc/index.ts:205-211`

**Problem**: Malformed WebSocket messages are caught and ignored without any logging or error emission.

```typescript
// Current (problematic)
this.ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    this.handleMessage(data)
  } catch {
    // Ignore malformed messages
  }
}
```

#### RED Test
```typescript
// src/rpc/index.test.ts
describe('WebSocket Message Handling', () => {
  it('should emit parse error event on malformed JSON', () => {
    const session = new RpcSession('ws://test')
    const errorHandler = vi.fn()

    session.onError(errorHandler)

    // Simulate connection
    // @ts-expect-error - accessing mock
    const mockWs = session.ws
    mockWs.onmessage({ data: 'not valid json {{{' })

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'parse_error',
        rawData: 'not valid json {{{'
      })
    )
  })

  it('should continue processing after parse error', () => {
    const session = new RpcSession('ws://test')
    const messageHandler = vi.fn()

    session.onMessage(messageHandler)

    // @ts-expect-error - accessing mock
    const mockWs = session.ws

    // Bad message
    mockWs.onmessage({ data: 'invalid' })

    // Good message
    mockWs.onmessage({ data: '{"valid": true}' })

    expect(messageHandler).toHaveBeenCalledTimes(1)
    expect(messageHandler).toHaveBeenCalledWith({ valid: true })
  })
})
```

#### GREEN Fix
```typescript
// Add error listener support
private errorListeners = new Set<(error: RpcParseError) => void>()

onError(listener: (error: RpcParseError) => void): () => void {
  this.errorListeners.add(listener)
  return () => this.errorListeners.delete(listener)
}

// Update onmessage handler
this.ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data)
    this.handleMessage(data)
  } catch (error) {
    const parseError: RpcParseError = {
      type: 'parse_error',
      rawData: event.data,
      error: error instanceof Error ? error.message : String(error)
    }
    this.errorListeners.forEach(listener => listener(parseError))
  }
}
```

#### REFACTOR
- Create `RpcParseError` type in `rpc/interfaces.ts`
- Add configurable error handling strategy (throw, ignore, callback)

---

### 1.3 Memory Leak in RPC Timeout

**Location**: `src/rpc/index.ts:300-354`

**Problem**: If WebSocket closes before RPC response, timeout keeps running and handler isn't cleaned up.

#### RED Test
```typescript
// src/rpc/index.test.ts
describe('RPC Timeout Cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should cleanup timeout when WebSocket closes before response', async () => {
    const session = new RpcSession('ws://test')

    const callPromise = session.call('slowMethod', [])

    // Close WebSocket before timeout
    // @ts-expect-error - accessing mock
    session.ws.onclose()

    // Advance timers past default timeout
    vi.advanceTimersByTime(35000)

    // Should reject with connection error, not timeout
    await expect(callPromise).rejects.toThrow(/connection closed/i)

    // Verify no pending timers (would indicate leak)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('should cleanup message listener when timeout fires', async () => {
    const session = new RpcSession('ws://test')

    const callPromise = session.call('slowMethod', [], { timeout: 1000 })

    // @ts-expect-error - accessing private
    const initialListenerCount = session.messageListeners.size

    // Advance past timeout
    vi.advanceTimersByTime(1500)

    await expect(callPromise).rejects.toThrow(RpcTimeoutError)

    // @ts-expect-error - accessing private
    expect(session.messageListeners.size).toBe(initialListenerCount - 1)
  })
})
```

#### GREEN Fix
```typescript
async callRemoteWithTimeout<T>(
  method: string,
  args: unknown[],
  timeout: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const callId = this.nextCallId++
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      this.messageListeners.delete(handler)
    }

    const handler = (data: unknown) => {
      if (isRpcResponse(data) && data.id === callId) {
        if (settled) return
        settled = true
        cleanup()

        if (data.error) {
          reject(new RpcError(data.error.message, data.error.code))
        } else {
          resolve(data.result as T)
        }
      }
    }

    // Register handler
    this.messageListeners.add(handler)

    // Setup timeout
    timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new RpcTimeoutError(method, timeout))
    }, timeout)

    // Handle early disconnect
    const disconnectHandler = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('Connection closed before response'))
    }
    this.once('disconnect', disconnectHandler)

    // Send the call
    this.send({ jsonrpc: '2.0', id: callId, method, params: args })
  })
}
```

#### REFACTOR
- Use AbortController pattern for consistent cleanup
- Extract common cleanup logic

---

## Phase 2: Type System Hardening

### 2.1 Missing Type Exports

**Location**: `src/types/index.ts`

**Problem**: `ResultSubtype`, `ModelUsage`, `OutputType` used but not exported.

#### RED Test
```typescript
// src/types/exports.test.ts
import type {
  ResultSubtype,
  ModelUsage,
  OutputType
} from './index.js'

describe('Type Exports', () => {
  it('should export ResultSubtype', () => {
    const subtype: ResultSubtype = 'success'
    expect(['success', 'error_max_turns', 'error_during_execution',
            'error_max_budget_usd', 'error_max_structured_output_retries']
    ).toContain(subtype)
  })

  it('should export ModelUsage', () => {
    const usage: ModelUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0
    }
    expect(usage.inputTokens).toBe(100)
  })

  it('should export OutputType', () => {
    const output: OutputType = 'text'
    expect(['text', 'json'].includes(output)).toBe(true)
  })
})
```

#### GREEN Fix
```typescript
// src/types/messages.ts - ensure exports
export type ResultSubtype =
  | 'success'
  | 'error_max_turns'
  | 'error_during_execution'
  | 'error_max_budget_usd'
  | 'error_max_structured_output_retries'

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
}

// src/types/events.ts - ensure export
export type OutputType = 'text' | 'json'

// src/types/index.ts - re-export
export type { ResultSubtype, ModelUsage } from './messages.js'
export type { OutputType } from './events.js'
```

#### REFACTOR
- Audit all types for export completeness
- Add comprehensive export test file

---

### 2.2 Unsafe Tool Input Casting

**Location**: `src/server/claude-code.ts:716-728`

**Problem**: Tool input cast without validation.

```typescript
// Current (unsafe)
const input = toolUse.input as { todos?: Array<...> }
```

#### RED Test
```typescript
// src/server/claude-code.test.ts
describe('Tool Input Validation', () => {
  it('should handle malformed TodoWrite input gracefully', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    const malformedToolUse = {
      type: 'tool_use' as const,
      id: 'test-id',
      name: 'TodoWrite',
      input: { todos: 'not an array' }  // Invalid: should be array
    }

    // Should not throw
    // @ts-expect-error - calling private method
    const result = claude.extractTodoUpdate(malformedToolUse)

    expect(result).toBeUndefined()
  })

  it('should handle null TodoWrite input', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    const nullInput = {
      type: 'tool_use' as const,
      id: 'test-id',
      name: 'TodoWrite',
      input: null
    }

    // @ts-expect-error - calling private method
    const result = claude.extractTodoUpdate(nullInput)
    expect(result).toBeUndefined()
  })

  it('should extract valid TodoWrite input', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    const validToolUse = {
      type: 'tool_use' as const,
      id: 'test-id',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Task 1', status: 'pending', activeForm: 'Starting task 1' }
        ]
      }
    }

    // @ts-expect-error - calling private method
    const result = claude.extractTodoUpdate(validToolUse)

    expect(result).toEqual({
      todos: [{ content: 'Task 1', status: 'pending', activeForm: 'Starting task 1' }]
    })
  })
})
```

#### GREEN Fix
```typescript
// Use existing or create type guard
function isValidTodoWriteInput(input: unknown): input is { todos: TodoItem[] } {
  if (!input || typeof input !== 'object') return false
  const obj = input as Record<string, unknown>
  if (!Array.isArray(obj.todos)) return false
  return obj.todos.every(todo =>
    typeof todo === 'object' &&
    todo !== null &&
    typeof (todo as Record<string, unknown>).content === 'string' &&
    typeof (todo as Record<string, unknown>).status === 'string' &&
    typeof (todo as Record<string, unknown>).activeForm === 'string'
  )
}

// In handleParsedMessage
if (toolUse.name === 'TodoWrite') {
  if (isValidTodoWriteInput(toolUse.input)) {
    const update: TodoUpdate = { todos: toolUse.input.todos }
    this.emitter.emit(EventKeys.todoUpdate(sessionId), update)
  }
}
```

#### REFACTOR
- Create type guards for all tool inputs
- Move to `src/types/guards.ts`

---

### 2.3 Enable tsconfig Strict Options

**Location**: `tsconfig.json`

#### RED Test
```typescript
// src/types/strict-access.test.ts
describe('Strict Index Access', () => {
  it('should require undefined checks for array access', () => {
    const arr = [1, 2, 3]
    const value = arr[5]

    // With noUncheckedIndexedAccess, value is number | undefined
    // This test verifies we handle it correctly
    if (value !== undefined) {
      expect(value).toBeGreaterThan(0)
    } else {
      expect(value).toBeUndefined()
    }
  })

  it('should require undefined checks for object index access', () => {
    const obj: Record<string, number> = { a: 1 }
    const value = obj['b']

    // Should be number | undefined
    expect(value).toBeUndefined()
  })
})
```

#### GREEN Fix
```json
// tsconfig.json
{
  "compilerOptions": {
    // ... existing options ...
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Then fix all compilation errors:
```typescript
// Example fixes needed:

// Before
const session = this.sessions.get(sessionId)
session.status = 'active'  // Error: session might be undefined

// After
const session = this.sessions.get(sessionId)
if (!session) throw new Error(`Session not found: ${sessionId}`)
session.status = 'active'
```

#### REFACTOR
- Add `// eslint-disable-next-line` comments for intentional patterns
- Create helper functions for common patterns

---

## Phase 3: Code Deduplication

### 3.1 Duplicate Validation Logic

**Location**: `src/types/guards.ts` and `src/server/ndjson-parser.ts`

**Problem**: `VALID_RESULT_SUBTYPES` defined in both files, validation logic duplicated.

#### RED Test
```typescript
// src/shared/validation.test.ts
import { VALID_RESULT_SUBTYPES } from './constants.js'
import { isAssistantMessage } from '../types/guards.js'
import { NDJSONParser } from '../server/ndjson-parser.js'

describe('Validation Consistency', () => {
  const testMessages = [
    // Valid assistant message
    {
      type: 'assistant',
      uuid: 'test-uuid',
      session_id: 'session-1',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
      parent_tool_use_id: null
    },
    // Invalid - missing session_id
    {
      type: 'assistant',
      uuid: 'test-uuid',
      message: { role: 'assistant', content: [] },
      parent_tool_use_id: null
    },
    // Invalid - wrong content type
    {
      type: 'assistant',
      uuid: 'test-uuid',
      session_id: 'session-1',
      message: { role: 'assistant', content: 'not an array' },
      parent_tool_use_id: null
    }
  ]

  it('should have single source of truth for VALID_RESULT_SUBTYPES', () => {
    // Both should use the same constant
    expect(VALID_RESULT_SUBTYPES).toEqual([
      'success',
      'error_max_turns',
      'error_during_execution',
      'error_max_budget_usd',
      'error_max_structured_output_retries'
    ])
  })

  it('should produce consistent validation results', () => {
    for (const msg of testMessages) {
      const guardResult = isAssistantMessage(msg as any)
      const parser = new NDJSONParser()
      // Parser validate method is private, so we test via parse
      const parseResult = parser.parse(JSON.stringify(msg))
      const parserValid = parseResult.length > 0 && parseResult[0].type === 'assistant'

      expect(guardResult).toBe(parserValid)
    }
  })
})
```

#### GREEN Fix

1. Create shared constants:
```typescript
// src/shared/constants.ts
export const VALID_RESULT_SUBTYPES = [
  'success',
  'error_max_turns',
  'error_during_execution',
  'error_max_budget_usd',
  'error_max_structured_output_retries'
] as const

export type ResultSubtype = typeof VALID_RESULT_SUBTYPES[number]
```

2. Update guards.ts:
```typescript
// src/types/guards.ts
import { VALID_RESULT_SUBTYPES } from '../shared/constants.js'
// Remove local VALID_RESULT_SUBTYPES definition
```

3. Update ndjson-parser.ts:
```typescript
// src/server/ndjson-parser.ts
import { VALID_RESULT_SUBTYPES } from '../shared/constants.js'
// Remove local VALID_RESULT_SUBTYPES definition
```

#### REFACTOR
- Extract all message validation to `src/shared/validation.ts`
- Have NDJSONParser use guards directly

---

### 3.2 Move NDJSONParser to Shared Location

**Location**: `src/server/ndjson-parser.ts` used by `src/client/session.ts`

**Problem**: Client code importing from server module.

#### RED Test
```typescript
// src/shared/parsers/ndjson-parser.test.ts
import { NDJSONParser } from './ndjson-parser.js'

describe('NDJSONParser (shared)', () => {
  it('should be importable from shared location', () => {
    expect(NDJSONParser).toBeDefined()
  })

  it('should parse valid NDJSON', () => {
    const parser = new NDJSONParser()
    const input = '{"type":"assistant","session_id":"s1","uuid":"u1","message":{"role":"assistant","content":[]},"parent_tool_use_id":null}'
    const result = parser.parse(input)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('assistant')
  })
})
```

#### GREEN Fix
1. Move file:
```bash
mkdir -p src/shared/parsers
mv src/server/ndjson-parser.ts src/shared/parsers/
mv src/server/ndjson-parser.test.ts src/shared/parsers/ # if exists
```

2. Update imports:
```typescript
// src/client/session.ts
import { NDJSONParser } from '../shared/parsers/ndjson-parser.js'

// src/server/claude-code.ts
import { NDJSONParser } from '../shared/parsers/ndjson-parser.js'

// src/server/index.ts (re-export for backward compatibility)
export { NDJSONParser } from '../shared/parsers/ndjson-parser.js'
```

#### REFACTOR
- Create `src/shared/index.ts` for shared exports
- Update package.json exports if needed

---

## Phase 4: Missing Test Coverage

### 4.1 ProcessManager Tests

**Location**: `src/server/process-manager.ts` - NO TEST FILE EXISTS

#### RED Tests
```typescript
// src/server/process-manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProcessManager, buildCliArgs } from './process-manager.js'
import type { Runtime } from '../types/runtime.js'

function createMockRuntime(): Runtime {
  return {
    exec: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    startProcess: vi.fn().mockResolvedValue({
      id: 'proc-1',
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
      exited: Promise.resolve(0),
      write: vi.fn(),
      kill: vi.fn()
    }),
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}

describe('ProcessManager', () => {
  let mockRuntime: Runtime
  let pm: ProcessManager

  beforeEach(() => {
    mockRuntime = createMockRuntime()
    pm = new ProcessManager(mockRuntime)
  })

  describe('startSession', () => {
    it('should create process for new session', async () => {
      await pm.startSession('session-1', { model: 'claude-3-opus' })

      expect(mockRuntime.startProcess).toHaveBeenCalled()
      expect(pm.isAlive('session-1')).toBe(true)
    })

    it('should throw if session already exists', async () => {
      await pm.startSession('session-1', {})

      await expect(pm.startSession('session-1', {}))
        .rejects.toThrow(/already exists/)
    })
  })

  describe('write', () => {
    it('should write message to session process', async () => {
      await pm.startSession('session-1', {})
      await pm.write('session-1', 'Hello Claude')

      const process = pm.getProcess('session-1')
      expect(process?.write).toHaveBeenCalledWith('Hello Claude\n')
    })

    it('should throw when writing to non-existent session', async () => {
      await expect(pm.write('no-such-session', 'Hello'))
        .rejects.toThrow(/not found/)
    })
  })

  describe('kill', () => {
    it('should kill session process', async () => {
      await pm.startSession('session-1', {})
      await pm.kill('session-1')

      expect(pm.isAlive('session-1')).toBe(false)
    })
  })

  describe('isAlive', () => {
    it('should return false for non-existent session', () => {
      expect(pm.isAlive('no-such-session')).toBe(false)
    })
  })
})

describe('buildCliArgs', () => {
  it('should build basic args with model', () => {
    const args = buildCliArgs({ model: 'claude-3-opus' })
    expect(args).toContain('--model')
    expect(args).toContain('claude-3-opus')
  })

  it('should include output-format stream-json', () => {
    const args = buildCliArgs({})
    expect(args).toContain('--output-format')
    expect(args).toContain('stream-json')
  })

  it('should include cwd if provided', () => {
    const args = buildCliArgs({ cwd: '/project' })
    expect(args).toContain('--cwd')
    expect(args).toContain('/project')
  })

  it('should include system prompt if provided', () => {
    const args = buildCliArgs({ systemPrompt: 'Be helpful' })
    expect(args).toContain('--system-prompt')
    expect(args).toContain('Be helpful')
  })

  it('should handle permission mode', () => {
    const args = buildCliArgs({ permissionMode: 'acceptEdits' })
    expect(args).toContain('--permission-mode')
    expect(args).toContain('acceptEdits')
  })

  it('should handle max turns', () => {
    const args = buildCliArgs({ maxTurns: 10 })
    expect(args).toContain('--max-turns')
    expect(args).toContain('10')
  })
})
```

#### GREEN Fix
Ensure all tests pass with existing implementation (or fix bugs found).

#### REFACTOR
- Improve error messages
- Add cleanup on process exit

---

### 4.2 Error Propagation Tests

**Location**: `src/server/claude-code.ts` - multiple `console.error` calls

#### RED Tests
```typescript
// src/server/claude-code.test.ts
describe('Error Propagation', () => {
  it('should emit error event when process stream fails', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)
    const errorHandler = vi.fn()

    // Create session
    const session = await claude.createSession({ apiKey: 'test' })

    // Subscribe to errors
    claude.onError(session.id, errorHandler)

    // Simulate stream error
    // @ts-expect-error - accessing private
    claude.handleStreamError(session.id, new Error('Stream failed'))

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stream_error',
        message: 'Stream failed'
      })
    )
  })

  it('should update session status on fatal error', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    const session = await claude.createSession({ apiKey: 'test' })

    // Simulate fatal error
    // @ts-expect-error - accessing private
    await claude.handleFatalError(session.id, new Error('Fatal'))

    const updatedSession = await claude.getSession(session.id)
    expect(updatedSession?.status).toBe('error')
  })
})
```

#### GREEN Fix
Add proper error event emission:
```typescript
// Add error types
interface ClaudeError {
  type: 'stream_error' | 'process_error' | 'parse_error'
  message: string
  sessionId?: string
  details?: unknown
}

// Add error event handler
onError(sessionId: string, handler: (error: ClaudeError) => void): () => void {
  return this.emitter.on(EventKeys.error(sessionId), handler)
}

// Emit errors instead of console.error
private handleStreamError(sessionId: string, error: Error): void {
  const claudeError: ClaudeError = {
    type: 'stream_error',
    message: error.message,
    sessionId
  }
  this.emitter.emit(EventKeys.error(sessionId), claudeError)
}
```

#### REFACTOR
- Remove console.error calls
- Create centralized error handling

---

## Phase 5: API Surface Cleanup

### 5.1 ClaudeSession Naming Collision

**Location**: `src/client/session.ts` (class) vs `src/types/options.ts` (interface)

**Problem**: Same name for different concepts causes confusion.

#### RED Test
```typescript
// src/naming.test.ts
import { ClaudeSession } from './client/session.js'
import type { ClaudeSessionData } from './types/options.js'

describe('Session Naming', () => {
  it('should distinguish ClaudeSession class from ClaudeSessionData interface', () => {
    const data: ClaudeSessionData = {
      id: 'session-1',
      status: 'pending',
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      cost: { totalUsd: 0, inputTokens: 0, outputTokens: 0 }
    }

    const mockRuntime = { /* ... */ } as any
    const session = new ClaudeSession(mockRuntime, {})

    // Different types should be clear
    expect(typeof session.start).toBe('function')  // Class has methods
    expect(data.status).toBe('pending')  // Interface is just data
  })
})
```

#### GREEN Fix
1. Rename interface in `src/types/options.ts`:
```typescript
// Before
export interface ClaudeSession { ... }

// After
export interface ClaudeSessionData { ... }

// Add deprecation alias
/** @deprecated Use ClaudeSessionData instead */
export type ClaudeSession = ClaudeSessionData
```

2. Update all usages of the interface to use new name

#### REFACTOR
- Update JSDoc comments
- Update README/docs references

---

### 5.2 Type-Safe Event Emitter

**Location**: `src/events/emitter.ts`

**Problem**: Events are keyed by string with unconstrained generic type.

#### RED Test
```typescript
// src/events/emitter.test.ts
import { TypedEventEmitter } from './emitter.js'
import type { TodoUpdate, PlanUpdate } from '../types/events.js'

interface TestEventMap {
  'todo': TodoUpdate
  'plan': PlanUpdate
  'count': number
}

describe('TypedEventEmitter with EventMap', () => {
  it('should enforce event type at compile time', () => {
    const emitter = new TypedEventEmitter<TestEventMap>()

    const todoHandler = vi.fn()
    emitter.on('todo', todoHandler)

    emitter.emit('todo', { todos: [] })

    expect(todoHandler).toHaveBeenCalledWith({ todos: [] })
  })

  it('should allow proper typing for all event types', () => {
    const emitter = new TypedEventEmitter<TestEventMap>()

    const countHandler = vi.fn()
    emitter.on('count', countHandler)

    emitter.emit('count', 42)

    expect(countHandler).toHaveBeenCalledWith(42)
  })

  // This test documents that the old API still works
  it('should support legacy untyped usage', () => {
    const emitter = new TypedEventEmitter()

    emitter.on('anything', (data: unknown) => {
      expect(data).toBe('works')
    })

    emitter.emit('anything', 'works')
  })
})
```

#### GREEN Fix
```typescript
// src/events/emitter.ts
export class TypedEventEmitter<
  EventMap extends Record<string, unknown> = Record<string, unknown>
> {
  private listeners = new Map<keyof EventMap, Set<(data: unknown) => void>>()

  on<K extends keyof EventMap>(
    event: K,
    callback: (data: EventMap[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback as (data: unknown) => void)
    return () => this.listeners.get(event)?.delete(callback as (data: unknown) => void)
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach(cb => cb(data))
  }

  // ... rest of methods with same pattern
}
```

#### REFACTOR
- Define `ClaudeEventMap` interface with all event types
- Update ClaudeCode to use typed emitter

---

## Phase 6: Feature Completion

### 6.1 Implement Abort Logic

**Location**: `src/client/session.ts:714-718`

**Problem**: `abort()` method is a stub with TODO comment.

#### RED Tests
```typescript
// src/client/session.test.ts
describe('ClaudeSession.abort()', () => {
  it('should abort active session', async () => {
    const mockRuntime = createMockRuntime()
    const session = new ClaudeSession(mockRuntime, {})

    await session.start('Hello')
    expect(session.status).toBe('active')

    await session.abort()

    expect(session.status).toBe('aborted')
  })

  it('should kill the running process', async () => {
    const mockProcess = {
      id: 'proc-1',
      kill: vi.fn().mockResolvedValue(undefined),
      // ... other fields
    }
    const mockRuntime = createMockRuntime()
    mockRuntime.startProcess = vi.fn().mockResolvedValue(mockProcess)

    const session = new ClaudeSession(mockRuntime, {})
    await session.start('Hello')
    await session.abort()

    expect(mockProcess.kill).toHaveBeenCalled()
  })

  it('should emit abort event', async () => {
    const session = new ClaudeSession(createMockRuntime(), {})
    const abortHandler = vi.fn()
    session.on('abort', abortHandler)

    await session.start('Hello')
    await session.abort()

    expect(abortHandler).toHaveBeenCalled()
  })

  it('should be idempotent', async () => {
    const session = new ClaudeSession(createMockRuntime(), {})
    await session.start('Hello')

    await session.abort()
    await session.abort()  // Second call should be no-op

    expect(session.status).toBe('aborted')
  })

  it('should do nothing if session not started', async () => {
    const session = new ClaudeSession(createMockRuntime(), {})

    await session.abort()  // Should not throw

    expect(session.status).toBe('pending')  // Unchanged
  })

  it('should reject pending promises', async () => {
    const session = new ClaudeSession(createMockRuntime(), {})
    await session.start('Hello')

    const messagePromise = session.sendMessage('Another message')
    await session.abort()

    await expect(messagePromise).rejects.toThrow(/aborted/)
  })
})
```

#### GREEN Fix
```typescript
async abort(): Promise<void> {
  // Only abort if in active state
  if (this._status !== 'active' && this._status !== 'starting') {
    return  // Idempotent: no-op if not running
  }

  this._status = 'aborted'

  // Kill the process if running
  if (this._process?.kill) {
    try {
      await this._process.kill()
    } catch {
      // Process may already be dead
    }
  }

  // Reject any pending promises
  this._abortController?.abort()

  // Emit abort event
  this._emitter.emit('abort', { sessionId: this._sessionId })

  // Cleanup
  this._process = null
}
```

#### REFACTOR
- Use AbortController throughout for consistent cancellation
- Extract cleanup logic to shared method with `destroy()`

---

### 6.2 API Key Validation

**Location**: `src/server/claude-code.ts:237-239`

**Problem**: Empty string fallback could cause confusing errors later.

#### RED Tests
```typescript
// src/server/claude-code.test.ts
describe('API Key Validation', () => {
  it('should throw early if API key is empty string', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const mockEnvNoKey = { ...mockEnv, ANTHROPIC_API_KEY: undefined }
    const claude = new ClaudeCode(mockState, mockEnvNoKey)

    await expect(claude.createSession({ apiKey: '' }))
      .rejects.toThrow(/API key is required/)
  })

  it('should throw if API key is only whitespace', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const mockEnvNoKey = { ...mockEnv, ANTHROPIC_API_KEY: undefined }
    const claude = new ClaudeCode(mockState, mockEnvNoKey)

    await expect(claude.createSession({ apiKey: '   ' }))
      .rejects.toThrow(/API key is required/)
  })

  it('should use env API key if option not provided', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)  // Has ANTHROPIC_API_KEY

    const session = await claude.createSession({})  // No apiKey option

    expect(session).toBeDefined()
    // Verify env key was used (check setEnvVars call)
    expect(mockRuntime.setEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({ ANTHROPIC_API_KEY: 'test-api-key' })
    )
  })

  it('should prefer option API key over env', async () => {
    const { ClaudeCode } = await import('./claude-code.js')
    const claude = new ClaudeCode(mockState, mockEnv)

    await claude.createSession({ apiKey: 'option-key' })

    expect(mockRuntime.setEnvVars).toHaveBeenCalledWith(
      expect.objectContaining({ ANTHROPIC_API_KEY: 'option-key' })
    )
  })
})
```

#### GREEN Fix
```typescript
async createSession(options: CreateSessionOptions): Promise<ClaudeSession> {
  // Resolve API key early
  const apiKey = options.apiKey?.trim() || this.env.ANTHROPIC_API_KEY?.trim()

  if (!apiKey) {
    throw new Error(
      'API key is required. Provide it via options.apiKey or ANTHROPIC_API_KEY environment variable.'
    )
  }

  // ... rest of method, use resolved apiKey
}
```

#### REFACTOR
- Create `resolveApiKey()` helper
- Add similar validation for other required config

---

## Phase 7: Documentation

### 7.1 Create README

**Location**: `packages/sdk/README.md` - DOES NOT EXIST

#### Content
```markdown
# @dotdo/claude SDK

TypeScript SDK for building Claude Code-powered applications.

## Installation

\`\`\`bash
npm install @dotdo/claude
\`\`\`

## Quick Start

### Client (Browser/Node)

\`\`\`typescript
import { ClaudeClient } from '@dotdo/claude/client'

const client = new ClaudeClient({
  url: 'wss://your-worker.example.com',
  callbacks: {
    onMessage: (msg) => console.log(msg),
    onTodoUpdate: (update) => console.log('Todos:', update.todos),
    onComplete: (result) => console.log('Done:', result)
  }
})

const session = await client.createSession({ apiKey: 'your-api-key' })
await client.sendMessage(session.id, 'Hello Claude!')
\`\`\`

### Server (Cloudflare Workers)

\`\`\`typescript
import { ClaudeCode } from '@dotdo/claude/server'

export class MyClaudeCode extends ClaudeCode {
  // Customize as needed
}

export default {
  fetch(request, env) {
    // Handle requests
  }
}
\`\`\`

### Local Execution

\`\`\`typescript
import { ClaudeSession } from '@dotdo/claude/client'
import { BunRuntime } from '@dotdo/claude/bun'

const runtime = new BunRuntime()
const session = new ClaudeSession(runtime, {
  model: 'claude-sonnet-4-20250514',
  cwd: '/my/project'
})

session.on('message', (msg) => console.log(msg))
await session.start('Explain this codebase')
\`\`\`

## Subpath Exports

- `@dotdo/claude` - Everything
- `@dotdo/claude/client` - Client SDK
- `@dotdo/claude/server` - Server SDK (Cloudflare)
- `@dotdo/claude/types` - Type definitions only
- `@dotdo/claude/runtimes` - All runtimes
- `@dotdo/claude/bun` - Bun runtime
- `@dotdo/claude/node` - Node.js runtime
- `@dotdo/claude/cloudflare` - Cloudflare runtime adapter

## API Reference

See [API Documentation](./docs/api.md)

## License

MIT
\`\`\`

---

## Execution Order

### Sprint 1: Critical Fixes (Phase 1)
1. 1.1 Race Condition - ~2h
2. 1.2 Swallowed Errors - ~1h
3. 1.3 Memory Leak - ~2h

### Sprint 2: Type Safety (Phase 2)
4. 2.1 Missing Exports - ~30m
5. 2.2 Unsafe Casting - ~1h
6. 2.3 tsconfig Strict - ~2h (many files to update)

### Sprint 3: Deduplication (Phase 3)
7. 3.1 Duplicate Validation - ~1h
8. 3.2 Move NDJSONParser - ~1h

### Sprint 4: Test Coverage (Phase 4)
9. 4.1 ProcessManager Tests - ~2h
10. 4.2 Error Propagation Tests - ~1h

### Sprint 5: API Cleanup (Phase 5)
11. 5.1 Naming Collision - ~1h
12. 5.2 Type-Safe Events - ~2h

### Sprint 6: Features (Phase 6)
13. 6.1 Abort Logic - ~2h
14. 6.2 API Key Validation - ~30m

### Sprint 7: Documentation (Phase 7)
15. 7.1 README - ~2h

---

## Summary

| Phase | Issues | Tests | Priority |
|-------|--------|-------|----------|
| 1. Critical Bugs | 3 | 8 | P0 |
| 2. Type System | 3 | 6 | P0 |
| 3. Deduplication | 2 | 3 | P1 |
| 4. Test Coverage | 2 | 12 | P1 |
| 5. API Cleanup | 2 | 4 | P2 |
| 6. Features | 2 | 10 | P2 |
| 7. Documentation | 1 | 0 | P2 |

**Total: 15 work items, ~43 new tests**
