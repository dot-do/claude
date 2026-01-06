/**
 * Terminal Component
 *
 * Tool-agnostic terminal using xterm.js with WebSocket PTY connection.
 * Can be used standalone or embedded in any React app.
 */

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

export interface TerminalTheme {
  background?: string
  foreground?: string
  cursor?: string
  cursorAccent?: string
  selectionBackground?: string
  black?: string
  red?: string
  green?: string
  yellow?: string
  blue?: string
  magenta?: string
  cyan?: string
  white?: string
}

export interface TerminalProps {
  /** WebSocket URL for PTY connection */
  wsUrl?: string
  /** Called when terminal sends data (user input) */
  onData?: (data: string) => void
  /** Called when terminal resizes */
  onResize?: (size: { cols: number; rows: number }) => void
  /** Called when WebSocket connects */
  onConnect?: () => void
  /** Called when WebSocket disconnects */
  onDisconnect?: () => void
  /** Called on WebSocket error */
  onError?: (error: Event) => void
  /** Incoming data to write to terminal */
  data?: string
  /** Terminal theme */
  theme?: TerminalTheme
  /** Font size in pixels */
  fontSize?: number
  /** Font family */
  fontFamily?: string
  /** Enable WebGL renderer (better performance) */
  webgl?: boolean
  /** Auto-focus terminal on mount */
  autoFocus?: boolean
  /** Aria label for accessibility */
  ariaLabel?: string
  /** Additional CSS class */
  className?: string
}

export interface TerminalRef {
  write: (text: string) => void
  clear: () => void
  focus: () => void
  fit: () => void
}

const defaultTheme: TerminalTheme = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
}

export const Terminal = forwardRef<TerminalRef, TerminalProps>(function Terminal({
  wsUrl,
  onData,
  onResize,
  onConnect,
  onDisconnect,
  onError,
  data,
  theme = defaultTheme,
  fontSize = 14,
  fontFamily = 'Menlo, Monaco, "Courier New", monospace',
  webgl = true,
  autoFocus = false,
  ariaLabel = 'Terminal',
  className = '',
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const writtenLengthRef = useRef(0)

  // Store callbacks in refs to avoid recreating terminal
  const callbacksRef = useRef({ onData, onResize, onConnect, onDisconnect, onError })
  useEffect(() => {
    callbacksRef.current = { onData, onResize, onConnect, onDisconnect, onError }
  }, [onData, onResize, onConnect, onDisconnect, onError])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme,
      allowProposedApi: true,
      screenReaderMode: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // Try WebGL renderer
    if (webgl) {
      try {
        const webglAddon = new WebglAddon()
        term.loadAddon(webglAddon)
      } catch {
        console.warn('WebGL not supported, using canvas renderer')
      }
    }

    term.open(containerRef.current)

    // Handle user input
    term.onData((input) => {
      callbacksRef.current.onData?.(input)
      // Send to WebSocket if connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: input }))
      }
    })

    // Handle resize
    term.onResize(({ cols, rows }) => {
      callbacksRef.current.onResize?.({ cols, rows })
      // Send resize to WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })

    // Fit to container
    fitAddon.fit()
    callbacksRef.current.onResize?.({ cols: term.cols, rows: term.rows })

    // Handle window resize
    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    if (autoFocus) {
      term.focus()
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [fontSize, fontFamily, theme, webgl, autoFocus])

  // Connect WebSocket
  useEffect(() => {
    if (!wsUrl) return

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      callbacksRef.current.onConnect?.()
      // Send initial size
      if (terminalRef.current) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
        }))
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'output' && msg.data) {
          terminalRef.current?.write(msg.data)
        }
      } catch {
        // Raw data - write directly
        terminalRef.current?.write(event.data)
      }
    }

    ws.onclose = () => {
      callbacksRef.current.onDisconnect?.()
    }

    ws.onerror = (error) => {
      callbacksRef.current.onError?.(error)
    }

    return () => {
      ws.close()
    }
  }, [wsUrl])

  // Handle incoming data prop
  useEffect(() => {
    if (data && terminalRef.current) {
      const previousLength = writtenLengthRef.current
      if (data.length > previousLength) {
        terminalRef.current.write(data.slice(previousLength))
        writtenLengthRef.current = data.length
      }
    }
  }, [data])

  // Expose methods via ref
  const write = useCallback((text: string) => {
    terminalRef.current?.write(text)
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  const fit = useCallback(() => {
    fitAddonRef.current?.fit()
  }, [])

  useImperativeHandle(ref, () => ({
    write,
    clear,
    focus,
    fit,
  }), [write, clear, focus, fit])

  return (
    <div
      ref={containerRef}
      data-testid="terminal-container"
      className={`w-full h-full ${className}`}
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-roledescription="terminal"
      tabIndex={0}
    />
  )
})

export default Terminal
