/**
 * TerminalEmbed Component
 *
 * React component that wraps a terminal iframe with type-safe
 * postMessage communication.
 */

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import type {
  TerminalMessage,
  TerminalInputMessage,
  TerminalOutputMessage,
  TerminalResizeMessage,
  TerminalReadyMessage,
  TerminalErrorMessage,
} from './types'
import { isTerminalMessage } from './types'

export interface TerminalEmbedProps {
  /** Base URL of the terminal app (e.g., "https://terminal.cod.ng") */
  src: string
  /** Session ID to connect to */
  sessionId?: string
  /** Additional URL parameters */
  params?: Record<string, string>
  /** Called when terminal outputs data */
  onOutput?: (data: string) => void
  /** Called when terminal resizes */
  onResize?: (size: { cols: number; rows: number }) => void
  /** Called when terminal is ready */
  onReady?: (sessionId: string) => void
  /** Called on terminal error */
  onError?: (error: string, code?: string) => void
  /** Called when terminal disconnects */
  onDisconnect?: (reason?: string) => void
  /** iframe width */
  width?: string | number
  /** iframe height */
  height?: string | number
  /** Additional CSS class */
  className?: string
  /** iframe title for accessibility */
  title?: string
  /** Allow clipboard access */
  allowClipboard?: boolean
  /** Custom iframe sandbox permissions */
  sandbox?: string
}

export interface TerminalEmbedRef {
  sendInput: (data: string) => void
}

export const TerminalEmbed = forwardRef<TerminalEmbedRef, TerminalEmbedProps>(function TerminalEmbed({
  src,
  sessionId,
  params = {},
  onOutput,
  onResize,
  onReady,
  onError,
  onDisconnect,
  width = '100%',
  height = '100%',
  className = '',
  title = 'Terminal',
  allowClipboard = true,
  sandbox = 'allow-scripts allow-same-origin allow-forms',
}, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Build iframe URL
  const iframeSrc = (() => {
    const url = new URL(src)
    if (sessionId) {
      url.searchParams.set('session', sessionId)
    }
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    return url.toString()
  })()

  // Handle incoming messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verify origin
      const expectedOrigin = new URL(src).origin
      if (event.origin !== expectedOrigin) return

      // Verify message format
      if (!isTerminalMessage(event.data)) return

      const message = event.data as TerminalMessage

      switch (message.type) {
        case 'terminal:output':
          onOutput?.((message as TerminalOutputMessage).data)
          break
        case 'terminal:resize':
          const resizeMsg = message as TerminalResizeMessage
          onResize?.({ cols: resizeMsg.cols, rows: resizeMsg.rows })
          break
        case 'terminal:ready':
          onReady?.((message as TerminalReadyMessage).sessionId)
          break
        case 'terminal:error':
          const errorMsg = message as TerminalErrorMessage
          onError?.(errorMsg.error, errorMsg.code)
          break
        case 'terminal:disconnected':
          onDisconnect?.((message as any).reason)
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [src, onOutput, onResize, onReady, onError, onDisconnect])

  // Send input to terminal
  const sendInput = useCallback((data: string) => {
    if (iframeRef.current?.contentWindow) {
      const message: TerminalInputMessage = {
        type: 'terminal:input',
        data,
      }
      const targetOrigin = new URL(src).origin
      iframeRef.current.contentWindow.postMessage(message, targetOrigin)
    }
  }, [src])

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    sendInput,
  }), [sendInput])

  // Build allow attribute
  const allow = [
    allowClipboard && 'clipboard-read',
    allowClipboard && 'clipboard-write',
  ]
    .filter(Boolean)
    .join('; ')

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc}
      width={width}
      height={height}
      className={className}
      title={title}
      allow={allow}
      sandbox={sandbox}
      style={{
        border: 'none',
        display: 'block',
      }}
    />
  )
})

export default TerminalEmbed
