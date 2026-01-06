/**
 * Terminal App
 *
 * Standalone terminal application with optional sidebar and bottom panel.
 * Configured via URL parameters for flexibility.
 */

import { useState, useEffect, useCallback } from 'react'
import { Terminal, FileTree, Layout, type FileNode } from '../components'
import type { TerminalMessage } from '../embed/types'

export default function App() {
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
        <h1 className="text-lg font-semibold">{title}</h1>
        <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div className="text-sm text-gray-400">
        {sessionId.slice(0, 8)}
      </div>
    </div>
  )

  // Sidebar component
  const sidebar = showSidebar ? (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 text-sm font-medium text-gray-400 border-b border-gray-800">
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
    <div className="h-full p-2 text-sm text-gray-400 font-mono overflow-auto">
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
