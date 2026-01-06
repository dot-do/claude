/**
 * Layout Component
 *
 * Resizable panel layout for terminal applications.
 * Supports sidebar, main content, and bottom panel.
 */

import { useState, useRef, useCallback, type ReactNode } from 'react'

export interface LayoutProps {
  /** Sidebar content (file tree, sessions) */
  sidebar?: ReactNode
  /** Main content (terminal, chat) */
  main?: ReactNode
  /** Bottom panel content (secondary terminal, logs) */
  bottom?: ReactNode
  /** Header content */
  header?: ReactNode
  /** Initial sidebar width in pixels */
  sidebarWidth?: number
  /** Initial bottom panel height in pixels */
  bottomHeight?: number
  /** Minimum sidebar width */
  minSidebarWidth?: number
  /** Maximum sidebar width */
  maxSidebarWidth?: number
  /** Minimum bottom panel height */
  minBottomHeight?: number
  /** Maximum bottom panel height */
  maxBottomHeight?: number
  /** Show/hide sidebar */
  showSidebar?: boolean
  /** Show/hide bottom panel */
  showBottom?: boolean
  /** Additional CSS class */
  className?: string
}

export function Layout({
  sidebar,
  main,
  bottom,
  header,
  sidebarWidth: initialSidebarWidth = 256,
  bottomHeight: initialBottomHeight = 200,
  minSidebarWidth = 150,
  maxSidebarWidth = 500,
  minBottomHeight = 100,
  maxBottomHeight = 500,
  showSidebar = true,
  showBottom = true,
  className = '',
}: LayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth)
  const [bottomHeight, setBottomHeight] = useState(initialBottomHeight)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingBottom, setIsResizingBottom] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingSidebar(true)

    const startX = e.clientX
    const startWidth = sidebarWidth

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX
      const newWidth = Math.min(maxSidebarWidth, Math.max(minSidebarWidth, startWidth + delta))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizingSidebar(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [sidebarWidth, minSidebarWidth, maxSidebarWidth])

  const handleBottomMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizingBottom(true)

    const startY = e.clientY
    const startHeight = bottomHeight

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      const newHeight = Math.min(maxBottomHeight, Math.max(minBottomHeight, startHeight + delta))
      setBottomHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizingBottom(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [bottomHeight, minBottomHeight, maxBottomHeight])

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-black text-white ${className}`}
      style={{ userSelect: isResizingSidebar || isResizingBottom ? 'none' : 'auto' }}
    >
      {/* Header */}
      {header && (
        <header className="flex-shrink-0 border-b border-gray-800">
          {header}
        </header>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && sidebar && (
          <>
            <aside
              className="flex-shrink-0 border-r border-gray-800 overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </aside>

            {/* Sidebar resize handle */}
            <div
              className={`
                w-1 cursor-col-resize hover:bg-blue-500 transition-colors
                ${isResizingSidebar ? 'bg-blue-500' : 'bg-transparent'}
              `}
              onMouseDown={handleSidebarMouseDown}
            />
          </>
        )}

        {/* Main + Bottom */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Main content */}
          <main className="flex-1 overflow-hidden">
            {main}
          </main>

          {/* Bottom resize handle */}
          {showBottom && bottom && (
            <>
              <div
                className={`
                  h-1 cursor-row-resize hover:bg-blue-500 transition-colors
                  ${isResizingBottom ? 'bg-blue-500' : 'bg-transparent'}
                `}
                onMouseDown={handleBottomMouseDown}
              />

              {/* Bottom panel */}
              <div
                className="flex-shrink-0 border-t border-gray-800 overflow-hidden"
                style={{ height: bottomHeight }}
              >
                {bottom}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Layout
