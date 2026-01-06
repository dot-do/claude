/**
 * @dotdo/claude SDK Example Application
 *
 * This example demonstrates how to use the ClaudeClient to:
 * - Create a session
 * - Send messages
 * - Handle real-time callbacks (todo updates, plan updates)
 * - Handle errors gracefully
 *
 * Prerequisites:
 * 1. Set ANTHROPIC_API_KEY environment variable
 * 2. Have a running Claude Code RPC server endpoint
 *
 * Usage:
 *   ANTHROPIC_API_KEY=your-key CLAUDE_RPC_URL=wss://your-server/rpc npm start
 */

import { ClaudeClient, ClaudeClientError } from '@dotdo/claude/client'
import type {
  ClaudeSession,
  ClaudeCodeOptions,
  TodoUpdate,
  PlanUpdate,
  TodoItem,
  SDKMessage,
  SDKResultMessage,
  ContentBlock,
} from '@dotdo/claude'

// ============================================================================
// Configuration
// ============================================================================

const RPC_URL = process.env.CLAUDE_RPC_URL || 'wss://localhost:8787/rpc'
const API_KEY = process.env.ANTHROPIC_API_KEY

if (!API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required')
  console.error('Usage: ANTHROPIC_API_KEY=your-key npm start')
  process.exit(1)
}

// ============================================================================
// Callback Handlers
// ============================================================================

/**
 * Handle todo list updates from Claude's TodoWrite tool
 */
function handleTodoUpdate(update: TodoUpdate): void {
  console.log('\n--- Todo Update ---')
  console.log(`Timestamp: ${update.timestamp}`)

  if (update.todos.length === 0) {
    console.log('No todos')
    return
  }

  update.todos.forEach((todo: TodoItem, index: number) => {
    const statusIcon =
      todo.status === 'completed' ? '[x]' :
      todo.status === 'in_progress' ? '[~]' : '[ ]'
    console.log(`  ${statusIcon} ${index + 1}. ${todo.content}`)
    if (todo.status === 'in_progress') {
      console.log(`      Currently: ${todo.activeForm}`)
    }
  })
}

/**
 * Handle plan updates from Claude's ExitPlanMode tool
 */
function handlePlanUpdate(update: PlanUpdate): void {
  console.log('\n--- Plan Update ---')
  console.log(`Timestamp: ${update.timestamp}`)
  if (update.planFile) {
    console.log(`Plan file: ${update.planFile}`)
  }
  console.log('Plan:')
  console.log(update.plan)
}

/**
 * Handle streaming messages from Claude
 */
function handleMessage(message: SDKMessage): void {
  // Handle different message types
  if (message.type === 'assistant') {
    // Text output from Claude
    const content = message.message?.content
    if (Array.isArray(content)) {
      for (const block of content as ContentBlock[]) {
        if (block.type === 'text') {
          process.stdout.write(block.text)
        }
      }
    }
  } else if (message.type === 'result') {
    // Session result
    const result = message as SDKResultMessage
    console.log(`\n\nSession completed: ${result.subtype}`)
    if (result.cost_usd) {
      console.log(`Cost: $${result.cost_usd.toFixed(4)}`)
    }
  }
}

/**
 * Handle errors from the streaming session
 */
function handleError(error: { code: string; message: string }): void {
  console.error(`\n--- Error ---`)
  console.error(`Code: ${error.code}`)
  console.error(`Message: ${error.message}`)
}

/**
 * Handle session completion
 */
function handleComplete(result: SDKResultMessage): void {
  console.log('\n--- Session Complete ---')
  console.log(`Result: ${result.subtype}`)
  if (result.cost_usd) {
    console.log(`Total cost: $${result.cost_usd.toFixed(4)}`)
  }
  if (result.total_cost_usd) {
    console.log(`Cumulative cost: $${result.total_cost_usd.toFixed(4)}`)
  }
}

// ============================================================================
// Main Application
// ============================================================================

async function main(): Promise<void> {
  console.log('Claude SDK Example Application')
  console.log('==============================')
  console.log(`RPC URL: ${RPC_URL}`)
  console.log('')

  // Create client with callbacks for real-time updates
  const client = new ClaudeClient({
    url: RPC_URL,
    transport: 'websocket',
    timeout: 60000,
    autoReconnect: true,
    maxReconnectAttempts: 3,
    callbacks: {
      onTodoUpdate: handleTodoUpdate,
      onPlanUpdate: handlePlanUpdate,
      onMessage: handleMessage,
      onError: handleError,
      onComplete: handleComplete,
    },
  })

  let session: ClaudeSession | null = null

  try {
    // Connect to the RPC server
    console.log('Connecting to RPC server...')
    await client.connect()
    console.log('Connected!')

    // Create a new session with options
    const sessionOptions: ClaudeCodeOptions = {
      apiKey: API_KEY,
      cwd: process.cwd(),
      model: 'claude-sonnet-4-20250514',
      permissionMode: 'default',
      maxTurns: 10,
    }

    console.log('\nCreating session...')
    session = await client.createSession(sessionOptions)
    console.log(`Session created: ${session.id}`)
    console.log(`Status: ${session.status}`)

    // Send a message to Claude
    const prompt = process.argv[2] || 'Hello! Please tell me a short joke.'
    console.log(`\nSending message: "${prompt}"`)
    console.log('\n--- Claude Response ---\n')

    await client.sendMessage(session.id, prompt)

    // The callbacks above will handle the streaming response
    // Wait a bit for the response to complete
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check session status
    const updatedSession = await client.getSession(session.id)
    if (updatedSession) {
      console.log(`\nFinal session status: ${updatedSession.status}`)
      console.log(`Turns used: ${updatedSession.turnCount}`)
      console.log(`Total cost: $${updatedSession.totalCostUsd.toFixed(4)}`)
    }

    // List all sessions (demonstrates session management)
    console.log('\n--- All Sessions ---')
    const sessions = await client.listSessions()
    sessions.forEach((s: ClaudeSession) => {
      console.log(`  - ${s.id}: ${s.status} (${s.turnCount} turns)`)
    })

  } catch (err: unknown) {
    // Handle specific client errors
    if (err instanceof ClaudeClientError) {
      console.error(`\nClient error (${err.status}): ${err.message}`)
      if (err.errorId) {
        console.error(`Error ID: ${err.errorId}`)
      }
    } else if (err instanceof Error) {
      console.error(`\nError: ${err.message}`)
    } else {
      console.error('\nUnknown error:', err)
    }
    process.exit(1)
  } finally {
    // Cleanup: destroy session and disconnect
    if (session) {
      console.log('\nCleaning up...')
      try {
        await client.destroySession(session.id)
        console.log('Session destroyed')
      } catch {
        // Ignore cleanup errors
      }
    }

    client.disconnect()
    console.log('Disconnected')
  }
}

// ============================================================================
// Alternative Usage Patterns
// ============================================================================

/**
 * Example: One-shot query (simpler pattern for single prompts)
 */
async function oneShotExample(): Promise<void> {
  const client = new ClaudeClient({
    url: RPC_URL,
    callbacks: {
      onMessage: (msg: SDKMessage) => {
        if (msg.type === 'assistant') {
          const content = msg.message?.content
          if (Array.isArray(content)) {
            for (const block of content as ContentBlock[]) {
              if (block.type === 'text') {
                process.stdout.write(block.text)
              }
            }
          }
        }
      },
    },
  })

  try {
    await client.connect()
    const result = await client.query('What is 2 + 2?', {
      apiKey: API_KEY,
      maxTurns: 1,
    })
    console.log(`\nQuery result: ${result}`)
  } finally {
    client.disconnect()
  }
}

/**
 * Example: Interactive session with multiple messages
 */
async function interactiveExample(): Promise<void> {
  const client = new ClaudeClient({
    url: RPC_URL,
    callbacks: {
      onTodoUpdate: handleTodoUpdate,
      onMessage: handleMessage,
    },
  })

  try {
    await client.connect()

    const session = await client.createSession({
      apiKey: API_KEY,
      cwd: process.cwd(),
    })

    // First message
    await client.sendMessage(session.id, 'Create a todo list for learning TypeScript')

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Follow-up message (interactive input pattern)
    await client.sendMessage(session.id, 'Add "practice with generics" to the list')

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 3000))

    await client.destroySession(session.id)
  } finally {
    client.disconnect()
  }
}

/**
 * Example: Subscribe to specific callbacks dynamically
 */
function dynamicCallbacksExample(): void {
  const client = new ClaudeClient({ url: RPC_URL })

  // Subscribe to todo updates
  const unsubscribeTodo = client.onTodoUpdate((update: TodoUpdate) => {
    console.log('Got todo update:', update.todos.length, 'items')
  })

  // Subscribe to plan updates
  const unsubscribePlan = client.onPlanUpdate((update: PlanUpdate) => {
    console.log('Got plan update:', update.plan.slice(0, 50), '...')
  })

  // Demonstrate that unsubscribe functions are available
  console.log('Subscribed to updates. Unsubscribe functions available.')
  void unsubscribeTodo
  void unsubscribePlan

  client.disconnect()
}

// Run the main example
main().catch(console.error)

// Export examples for testing/exploration
export { main, oneShotExample, interactiveExample, dynamicCallbacksExample }
