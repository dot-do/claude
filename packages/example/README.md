# @dotdo/claude SDK Example

A simple example application demonstrating how to use the `@dotdo/claude` SDK to interact with Claude Code.

## Features

This example demonstrates:

- Creating a `ClaudeClient` with configuration options
- Connecting to a Claude Code RPC server
- Creating and managing sessions
- Sending messages to Claude
- Handling real-time callbacks:
  - `onTodoUpdate` - Track Claude's task progress
  - `onPlanUpdate` - Receive plan updates
  - `onMessage` - Stream Claude's responses
  - `onError` - Handle errors gracefully
  - `onComplete` - Know when a session completes
- Proper cleanup and error handling

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm (for workspace dependencies)
- A running Claude Code RPC server
- An Anthropic API key

### Installation

From the repository root:

```bash
# Install all dependencies
pnpm install

# Build the SDK
cd packages/sdk
pnpm build
```

### Environment Variables

Set the following environment variables:

```bash
# Required: Your Anthropic API key
export ANTHROPIC_API_KEY=your-api-key-here

# Optional: RPC server URL (defaults to wss://localhost:8787/rpc)
export CLAUDE_RPC_URL=wss://your-server/rpc
```

### Running the Example

```bash
cd packages/example

# Run with default prompt
npm start

# Run with custom prompt
npm start "Write a hello world function in TypeScript"
```

### Development Mode

For hot-reloading during development:

```bash
npm run dev
```

## Code Structure

### Main Application (`src/index.ts`)

```typescript
import { ClaudeClient, ClaudeClientError } from '@dotdo/claude/client'
import type { ClaudeSession, ClaudeCodeOptions } from '@dotdo/claude'

// Create client with callbacks
const client = new ClaudeClient({
  url: 'wss://your-server/rpc',
  callbacks: {
    onTodoUpdate: (update) => {
      console.log('Todos:', update.todos)
    },
    onPlanUpdate: (update) => {
      console.log('Plan:', update.plan)
    },
    onMessage: (message) => {
      // Handle streaming responses
    },
    onError: (error) => {
      console.error('Error:', error.message)
    },
    onComplete: (result) => {
      console.log('Done:', result.subtype)
    },
  },
})

// Connect and create session
await client.connect()
const session = await client.createSession({
  apiKey: process.env.ANTHROPIC_API_KEY,
  cwd: '/workspace',
  model: 'claude-sonnet-4-20250514',
})

// Send message
await client.sendMessage(session.id, 'Hello, Claude!')

// Cleanup
await client.destroySession(session.id)
client.disconnect()
```

## Usage Patterns

### One-Shot Query

For simple single-prompt interactions:

```typescript
const client = new ClaudeClient({ url: RPC_URL })
await client.connect()

const result = await client.query('What is 2 + 2?', {
  apiKey: API_KEY,
  maxTurns: 1,
})

client.disconnect()
```

### Interactive Session

For multi-turn conversations:

```typescript
const session = await client.createSession({ apiKey: API_KEY })

// First message
await client.sendMessage(session.id, 'Create a todo list')

// Follow-up (interactive input)
await client.sendMessage(session.id, 'Add another item')

await client.destroySession(session.id)
```

### Dynamic Callbacks

Subscribe to specific events at runtime:

```typescript
const client = new ClaudeClient({ url: RPC_URL })

// Subscribe
const unsubscribe = client.onTodoUpdate((update) => {
  console.log('Todos updated:', update.todos)
})

// Later, unsubscribe
unsubscribe()
```

## Session Options

Available options when creating a session:

```typescript
const options: ClaudeCodeOptions = {
  // Required
  apiKey: 'your-api-key',

  // Working directory
  cwd: '/workspace',

  // Model selection
  model: 'claude-sonnet-4-20250514',
  fallbackModel: 'claude-3-haiku-20240307',

  // Permissions
  permissionMode: 'default', // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

  // Limits
  maxTurns: 10,
  maxBudgetUsd: 1.0,

  // System prompt
  systemPrompt: 'You are a helpful coding assistant.',

  // Environment variables
  env: {
    NODE_ENV: 'development',
  },
}
```

## Error Handling

The SDK provides typed errors:

```typescript
import { ClaudeClientError } from '@dotdo/claude/client'

try {
  await client.sendMessage(sessionId, prompt)
} catch (error) {
  if (error instanceof ClaudeClientError) {
    console.error(`Error ${error.status}: ${error.message}`)
    if (error.errorId) {
      console.error(`Error ID: ${error.errorId}`)
    }
  }
}
```

## Troubleshooting

### Connection Issues

1. Verify the RPC server is running
2. Check the `CLAUDE_RPC_URL` is correct
3. Ensure WebSocket connections are allowed

### Authentication Errors

1. Verify `ANTHROPIC_API_KEY` is set correctly
2. Check the API key has the necessary permissions

### Session Errors

1. Check session hasn't expired
2. Verify the working directory exists
3. Review permission mode settings

## Related Documentation

- [@dotdo/claude SDK Documentation](../sdk/README.md)
- [Claude Code CLI Documentation](https://docs.anthropic.com/claude-code)
- [Anthropic API Reference](https://docs.anthropic.com/api)
