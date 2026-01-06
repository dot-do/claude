# @dotdo/claude

SDK for Claude Code - provides a typed client, Cloudflare Durable Object, and capnweb RPC integration for building Claude Code-powered applications.

## Features

- **ClaudeCode Durable Object** - Cloudflare DO that wraps Claude Code CLI
- **Interactive Input (Baseline #1)** - Send messages while Claude is still processing
- **Real-time Streaming** - Todo updates, plan changes, and tool use events via callbacks
- **capnweb RPC** - Bidirectional communication with promise pipelining
- **Terminal Proxy** - Optional xterm.js-compatible WebSocket terminal

## Installation

```bash
npm install @dotdo/claude
# or
pnpm add @dotdo/claude
```

## Client Usage

```typescript
import { createClaudeClient } from '@dotdo/claude'

const claude = createClaudeClient({
  url: 'wss://claude.example.com/rpc',
  callbacks: {
    onTodoUpdate: (update) => {
      console.log('Todos:', update.todos)
      // Update UI with task progress
    },
    onPlanUpdate: (update) => {
      console.log('Plan:', update.plan)
      // Show plan to user for approval
    },
    onMessage: (message) => {
      console.log('Output:', message)
    }
  }
})

// Create session
const session = await claude.createSession({
  cwd: '/workspace',
  model: 'claude-sonnet-4-20250514',
})

// Send message (interactive - can send while Claude is working)
await claude.sendMessage(session.id, 'Build a todo app')

// User sees plan they disagree with...
// Send follow-up while Claude is still working:
await claude.sendMessage(session.id, 'Actually, use Zustand instead of Redux')
```

## Server Usage (Cloudflare Workers)

```typescript
import { ClaudeCode } from '@dotdo/claude/server'

export { ClaudeCode }

export default {
  async fetch(request: Request, env: Env) {
    const id = env.CLAUDE_CODE.idFromName('default')
    const stub = env.CLAUDE_CODE.get(id)
    return stub.fetch(request)
  }
}
```

### wrangler.toml

```toml
[durable_objects]
bindings = [
  { name = "CLAUDE_CODE", class_name = "ClaudeCode" }
]

[[migrations]]
tag = "v1"
new_classes = ["ClaudeCode"]
```

## RPC Usage

```typescript
import { newWebSocketRpcSession, type IClaudeCodeRpc } from '@dotdo/claude/rpc'

const session = newWebSocketRpcSession<IClaudeCodeRpc>('wss://claude.example.com/rpc')
const stub = await session.connect()

const claudeSession = await stub.createSession({ cwd: '/workspace' })
await stub.sendMessage(claudeSession.id, 'Hello!')
```

## API Reference

### ClaudeClient

| Method | Description |
|--------|-------------|
| `createSession(options?)` | Create a new Claude session |
| `sendMessage(sessionId, message)` | Send a message (supports interactive input) |
| `query(prompt, options?)` | One-shot query convenience method |
| `interrupt(sessionId?)` | Interrupt current query |
| `getSession(sessionId)` | Get session by ID |
| `resumeSession(sessionId)` | Resume an existing session |
| `destroySession(sessionId?)` | Destroy session and cleanup |
| `setPermissionMode(mode, sessionId?)` | Set permission mode |
| `supportedModels()` | Get supported models |
| `mcpServerStatus(sessionId?)` | Get MCP server status |

### ClaudeCodeOptions

```typescript
interface ClaudeCodeOptions {
  apiKey?: string
  model?: string
  cwd?: string
  systemPrompt?: string | { type: 'preset', preset: 'claude_code', append?: string }
  tools?: string[] | { type: 'preset', preset: 'claude_code' }
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  maxTurns?: number
  maxBudgetUsd?: number
  mcpServers?: Record<string, McpServerConfig>
  resume?: string
  continue?: boolean
}
```

### Callbacks

```typescript
interface StreamCallbackHandlers {
  onMessage?: (message: SDKMessage) => void
  onTodoUpdate?: (update: TodoUpdate) => void
  onPlanUpdate?: (update: PlanUpdate) => void
  onToolUse?: (event: ToolUseEvent) => void
  onError?: (error: { code: string; message: string }) => void
  onComplete?: (result: SDKResultMessage) => void
}
```

## Architecture

```
@dotdo/claude
├── client/     # RPC client with callback support
├── server/     # ClaudeCode Durable Object
│   ├── claude-code.ts      # Main DO class
│   ├── process-manager.ts  # PTY/stdin streaming
│   └── ndjson-parser.ts    # Stream parser
├── rpc/        # capnweb RPC integration
├── types/      # TypeScript definitions
├── events/     # Typed event emitter
└── terminal/   # Optional WebSocket terminal proxy
```

## License

MIT
