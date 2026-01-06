/**
 * Terminal App
 *
 * Standalone terminal application with optional sidebar and bottom panel.
 * Configured via URL parameters for flexibility.
 */

import { useState, useEffect, useCallback } from 'react'
import { Terminal, FileTree, Layout, ThemeProvider, useTheme, type FileNode, type ThemeMode } from '../components'
import type { TerminalMessage } from '../embed/types'

/**
 * Theme toggle button component
 */
function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )
}

function TerminalApp() {
  // Parse URL params for configuration
  const params = new URLSearchParams(window.location.search)
  const sessionId = params.get('session') || crypto.randomUUID()
  const showSidebar = params.get('sidebar') !== 'false'
  const showBottom = params.get('bottom') === 'true'
  const title = params.get('title') || 'Terminal'

  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState<FileNode[]>([])
  const [selectedFile, setSelectedFile] = useState<string | undefined>()

  // Build WebSocket URL
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/${sessionId}`

  // Notify parent window of terminal events (for iframe embedding)
  const notifyParent = useCallback((message: TerminalMessage) => {
    if (window.parent !== window) {
      window.parent.postMessage(message, '*')
    }
  }, [])

  // Handle incoming messages from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'terminal:input') {
        // Input will be handled by Terminal component via its WebSocket
        console.log('Received input from parent:', event.data.data)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleConnect = useCallback(() => {
    setConnected(true)
    notifyParent({ type: 'terminal:ready', sessionId })
  }, [sessionId, notifyParent])

  const handleDisconnect = useCallback(() => {
    setConnected(false)
    notifyParent({ type: 'terminal:disconnected' })
  }, [notifyParent])

  const handleError = useCallback((error: Event) => {
    notifyParent({ type: 'terminal:error', error: 'WebSocket error' })
  }, [notifyParent])

  const handleResize = useCallback((size: { cols: number; rows: number }) => {
    notifyParent({ type: 'terminal:resize', ...size })
  }, [notifyParent])

  const handleFileSelect = useCallback((file: FileNode) => {
    setSelectedFile(file.path)
    console.log('Selected file:', file.path)
  }, [])

  // Header component
  const header = (
    <div className="flex items-center justify-between px-4 py-2">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
        <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400 dark:text-slate-500">
          {sessionId.slice(0, 8)}
        </span>
        <ThemeToggle />
      </div>
    </div>
  )

  // Sidebar component
  const sidebar = showSidebar ? (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
        Files
      </div>
      <FileTree
        files={files}
        selectedPath={selectedFile}
        onSelect={handleFileSelect}
        className="flex-1"
      />
    </div>
  ) : undefined

  // Main terminal
  const main = (
    <Terminal
      wsUrl={wsUrl}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      onError={handleError}
      onResize={handleResize}
      autoFocus
      className="h-full"
    />
  )

  // Bottom panel (optional secondary terminal or logs)
  const bottom = showBottom ? (
    <div className="h-full p-2 text-sm text-slate-500 dark:text-slate-400 font-mono overflow-auto">
      <div>Session: {sessionId}</div>
      <div>Status: {connected ? 'Connected' : 'Disconnected'}</div>
    </div>
  ) : undefined

  return (
    <Layout
      header={header}
      sidebar={sidebar}
      main={main}
      bottom={bottom}
      showSidebar={showSidebar}
      showBottom={showBottom}
      className="h-screen"
    />
  )
}

export default function App() {
  // Parse URL params for theme configuration
  const params = new URLSearchParams(window.location.search)
  const defaultTheme = (params.get('theme') as ThemeMode) || 'system'

  return (
    <ThemeProvider defaultMode={defaultTheme}>
      <TerminalApp />
    </ThemeProvider>
  )
}
