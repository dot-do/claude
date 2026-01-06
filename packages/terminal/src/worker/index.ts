/**
 * @dotdo/terminal Worker
 *
 * Cloudflare Worker entry point for terminal application.
 * Handles static asset serving and WebSocket proxying to sandboxes.
 *
 * @example Usage in wrangler.jsonc
 * ```jsonc
 * {
 *   "main": "node_modules/@dotdo/terminal/src/worker/index.ts",
 *   "assets": {
 *     "directory": "node_modules/@dotdo/terminal/dist/client",
 *     "not_found_handling": "single-page-application"
 *   }
 * }
 * ```
 */

export interface Env {
  /** Static assets binding */
  ASSETS: Fetcher
  /** Sandbox Durable Object namespace (optional - for direct PTY) */
  Sandbox?: DurableObjectNamespace
  /** PTY WebSocket URL template (e.g., "wss://pty.example.com/ws/{sessionId}") */
  PTY_URL_TEMPLATE?: string
  /** Allowed origins for CORS */
  ALLOWED_ORIGINS?: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Handle WebSocket upgrade for /ws/:sessionId
    if (url.pathname.startsWith('/ws/')) {
      return handleWebSocket(request, env, url)
    }

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url)
    }

    // Serve static assets (SPA fallback handled by Cloudflare)
    return env.ASSETS.fetch(request)
  },
}

/**
 * Handle WebSocket connections for terminal PTY
 */
async function handleWebSocket(request: Request, env: Env, url: URL): Promise<Response> {
  // Verify WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade')
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 })
  }

  // Extract session ID from path: /ws/:sessionId
  const sessionId = url.pathname.split('/')[2]
  if (!sessionId) {
    return new Response('Missing session ID', { status: 400 })
  }

  // Option 1: Proxy to Sandbox Durable Object
  if (env.Sandbox) {
    const id = env.Sandbox.idFromName(sessionId)
    const stub = env.Sandbox.get(id)
    return stub.fetch(request)
  }

  // Option 2: Proxy to external PTY server
  if (env.PTY_URL_TEMPLATE) {
    const ptyUrl = env.PTY_URL_TEMPLATE.replace('{sessionId}', sessionId)
    return fetch(ptyUrl, {
      headers: request.headers,
    })
  }

  // Option 3: Create local WebSocket pair for demo/testing
  const [client, server] = Object.values(new WebSocketPair())

  server.accept()
  server.addEventListener('message', (event) => {
    // Echo back for demo
    server.send(JSON.stringify({
      type: 'output',
      data: `Echo: ${event.data}\r\n`,
    }))
  })

  // Send welcome message
  server.send(JSON.stringify({
    type: 'output',
    data: '\x1b[32m@dotdo/terminal\x1b[0m - No PTY backend configured\r\n$ ',
  }))

  return new Response(null, {
    status: 101,
    webSocket: client,
  })
}

/**
 * Handle API routes
 */
async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const corsHeaders = getCorsHeaders(request, env)

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // GET /api/health - Health check
  if (url.pathname === '/api/health') {
    return Response.json(
      {
        status: 'ok',
        timestamp: new Date().toISOString(),
        sandbox: !!env.Sandbox,
        ptyTemplate: !!env.PTY_URL_TEMPLATE,
      },
      { headers: corsHeaders }
    )
  }

  // GET /api/session - Create new session
  if (url.pathname === '/api/session' && request.method === 'POST') {
    const sessionId = crypto.randomUUID()
    return Response.json(
      { sessionId },
      { headers: corsHeaders }
    )
  }

  return Response.json(
    { error: 'Not found' },
    { status: 404, headers: corsHeaders }
  )
}

/**
 * Get CORS headers based on request origin
 */
function getCorsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || ['*']

  const headers = new Headers()

  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin || '*')
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  headers.set('Access-Control-Max-Age', '86400')

  return headers
}
