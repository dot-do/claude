/**
 * @dotdo/claude Server Helpers
 *
 * Cloudflare Durable Object and sandbox integration for Claude Code
 */

// Main ClaudeCode Durable Object
export { ClaudeCode, getSandbox } from './claude-code.js'
export type { Sandbox, SandboxNamespace } from './claude-code.js'

// NDJSON Parser
export {
  NDJSONParser,
  extractTodoUpdates,
  extractPlanUpdates,
  extractToolUses,
  extractResult,
  extractSessionId,
  isComplete,
  hasError,
} from './ndjson-parser.js'

// Process Manager
export { ProcessManager, buildCliArgs } from './process-manager.js'

// Legacy server helpers (for backward compatibility)
import type { ServerConfig } from '../types/index.js'

/**
 * Claude Code server settings for auto-accept permissions
 */
const CLAUDE_CODE_SETTINGS = {
  permissions: {
    allow: [
      'Bash',
      'Edit',
      'Read',
      'Write',
      'Glob',
      'Grep',
      'WebFetch',
      'WebSearch',
      'NotebookEdit',
      'TodoWrite',
      'Task',
      'mcp__*',
    ],
    deny: [],
  },
}

const CLAUDE_CODE_STATE = {
  hasCompletedOnboarding: true,
  shiftEnterKeyBindingInstalled: true,
  bypassPermissionsModeAccepted: true,
  theme: 'dark',
}

/**
 * Claude server instance with configured sandbox
 */
export interface ClaudeServer {
  sandbox: import('./claude-code.js').Sandbox
  config: ServerConfig
  port: number
  start(): Promise<void>
  stop(): Promise<void>
}

/**
 * Create a Claude Code server in a sandbox
 * @deprecated Use ClaudeCode Durable Object instead
 */
export async function createClaudeServer(
  sandbox: import('./claude-code.js').Sandbox,
  config: ServerConfig
): Promise<ClaudeServer> {
  const port = config.port || 7681

  // Configure Claude Code settings
  await configureClaudeCode(sandbox, config)

  const server: ClaudeServer = {
    sandbox,
    config,
    port,

    async start() {
      // Start PTY server with Claude Code
      const env: Record<string, string> = {
        WORKSPACE: config.directory,
        PTY_PORT: String(port),
      }

      if (config.apiKey) {
        env.ANTHROPIC_API_KEY = config.apiKey
      }
      if (config.oauthToken) {
        env.CLAUDE_CODE_OAUTH_TOKEN = config.oauthToken
      }

      const process = await sandbox.startProcess('cd /pty-server && node sandbox-pty-server.js', {
        env,
      })

      await process.waitForPort(port, { timeout: 30000 })
    },

    async stop() {
      // Kill PTY server process
      await sandbox.exec('pkill -f sandbox-pty-server || true', { timeout: 5000 })
    },
  }

  return server
}

/**
 * Configure Claude Code in sandbox to skip onboarding and auto-accept permissions
 */
async function configureClaudeCode(
  sandbox: import('./claude-code.js').Sandbox,
  config: ServerConfig
): Promise<void> {
  const claudeHome = '/home/claude'

  // Create directories
  await sandbox.exec(`mkdir -p ${claudeHome}/.claude`, { timeout: 5000 })

  // Write settings
  const settingsJson = JSON.stringify(CLAUDE_CODE_SETTINGS)
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
  await sandbox.exec(`printf "${settingsJson}" > ${claudeHome}/.claude/settings.json`, {
    timeout: 5000,
  })

  // Write state
  const stateJson = JSON.stringify(CLAUDE_CODE_STATE)
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
  await sandbox.exec(`printf "${stateJson}" > ${claudeHome}/.claude.json`, {
    timeout: 5000,
  })

  // Add PATH for Claude Code
  await sandbox.exec(
    `grep -q '.local/bin' ${claudeHome}/.bashrc 2>/dev/null || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${claudeHome}/.bashrc`,
    { timeout: 5000 }
  )

  // Fix ownership
  await sandbox.exec(`chown -R claude:claude ${claudeHome}`, { timeout: 5000 })
}

/**
 * Clone a repository into the sandbox
 */
export async function cloneRepository(
  sandbox: import('./claude-code.js').Sandbox,
  repo: string,
  targetDir?: string
): Promise<string> {
  // Validate repo format
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
    throw new Error('Invalid repository format. Expected: owner/repo')
  }

  const repoName = repo.split('/')[1]
  const dir = targetDir || `/${repoName}`

  // Check if already cloned
  const checkResult = await sandbox.exec(`test -d ${dir}/.git && echo exists`, {
    timeout: 5000,
  })
  if (checkResult.stdout?.trim() === 'exists') {
    return dir
  }

  // Clone repository
  const result = await sandbox.exec(`git clone --depth 1 https://github.com/${repo}.git ${dir}`, {
    timeout: 60000,
  })

  if (result.exitCode !== 0) {
    throw new Error(`Failed to clone repository: ${result.stderr || 'Unknown error'}`)
  }

  return dir
}

/**
 * Proxy HTTP/WebSocket requests to Claude server
 * @deprecated Use ClaudeCode.fetch() instead
 */
export async function proxyToClaude(server: ClaudeServer, request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Handle WebSocket upgrade
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    // @ts-expect-error - wsConnect may exist on sandbox
    return server.sandbox.wsConnect?.(request, server.port) ?? new Response('WebSocket not supported', { status: 501 })
  }

  // For HTTP requests, return placeholder
  return new Response(JSON.stringify({ error: 'HTTP proxy not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  })
}
