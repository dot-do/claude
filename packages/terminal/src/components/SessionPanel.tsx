/**
 * SessionPanel Component
 *
 * A panel for managing terminal sessions with session listing,
 * creation, switching, and deletion functionality.
 */

import { useState, useCallback } from 'react'

export interface Session {
  id: string
  name: string
  status: 'active' | 'idle' | 'disconnected'
  createdAt?: string
}

export interface SessionPanelProps {
  /** Array of sessions to display */
  sessions: Session[]
  /** Currently active session ID */
  activeSessionId?: string
  /** Called when a session is selected */
  onSelect?: (session: Session) => void
  /** Called when creating a new session */
  onCreate?: () => void
  /** Called when deleting a session */
  onDelete?: (session: Session) => void
  /** Additional CSS class */
  className?: string
  /** Aria label for accessibility */
  ariaLabel?: string
}

function StatusIndicator({ status }: { status: Session['status'] }) {
  const colorMap = {
    active: 'bg-green-500',
    idle: 'bg-yellow-500',
    disconnected: 'bg-red-500',
  }

  return (
    <span
      data-testid="status-indicator"
      data-status={status}
      className={`w-2 h-2 rounded-full ${colorMap[status]}`}
      aria-label={`Status: ${status}`}
    />
  )
}

function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: Session
  isActive: boolean
  onSelect?: (session: Session) => void
  onDelete?: (session: Session) => void
}) {
  const [showDelete, setShowDelete] = useState(false)

  const handleClick = useCallback(() => {
    onSelect?.(session)
  }, [onSelect, session])

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDelete?.(session)
    },
    [onDelete, session]
  )

  return (
    <div
      data-testid={`session-${session.id}`}
      data-active={isActive ? 'true' : undefined}
      className={`
        flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
        transition-colors
        ${isActive ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}
      `}
      onClick={handleClick}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <StatusIndicator status={session.status} />

      <span className="flex-1 truncate text-sm">{session.name}</span>

      {showDelete && onDelete && (
        <button
          data-testid={`delete-session-${session.id}`}
          onClick={handleDelete}
          className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
          aria-label={`Delete session ${session.name}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  )
}

export function SessionPanel({
  sessions,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
  className = '',
  ariaLabel = 'Session panel',
}: SessionPanelProps) {
  return (
    <div
      data-testid="session-panel"
      role="region"
      aria-label={ariaLabel}
      className={`flex flex-col h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white theme-transition ${className}`}
    >
      {/* Header with create button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Sessions</h2>
        {onCreate && (
          <button
            data-testid="create-session-button"
            onClick={onCreate}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            aria-label="Create new session"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </button>
        )}
      </div>

      {/* Session list */}
      <div
        data-testid="session-list"
        className="flex-1 overflow-y-auto p-2 space-y-1"
        role="list"
        aria-label="Session list"
      >
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
        {sessions.length === 0 && (
          <div
            data-testid="no-sessions-message"
            className="text-slate-400 dark:text-slate-500 text-sm text-center py-4"
          >
            No sessions
          </div>
        )}
      </div>
    </div>
  )
}

export default SessionPanel
