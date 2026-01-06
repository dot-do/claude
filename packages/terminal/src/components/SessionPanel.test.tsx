import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionPanel, type Session } from './SessionPanel'

describe('SessionPanel', () => {
  const mockSessions: Session[] = [
    { id: '1', name: 'Session 1', status: 'active' },
    { id: '2', name: 'Session 2', status: 'idle' },
    { id: '3', name: 'Session 3', status: 'disconnected' },
  ]

  describe('rendering session list', () => {
    it('renders session panel container', () => {
      render(<SessionPanel sessions={[]} />)
      expect(screen.getByTestId('session-panel')).toBeInTheDocument()
    })

    it('renders session list', () => {
      render(<SessionPanel sessions={mockSessions} />)
      expect(screen.getByTestId('session-list')).toBeInTheDocument()
    })

    it('renders all sessions', () => {
      render(<SessionPanel sessions={mockSessions} />)
      expect(screen.getByText('Session 1')).toBeInTheDocument()
      expect(screen.getByText('Session 2')).toBeInTheDocument()
      expect(screen.getByText('Session 3')).toBeInTheDocument()
    })

    it('shows "No sessions" message when sessions array is empty', () => {
      render(<SessionPanel sessions={[]} />)
      expect(screen.getByTestId('no-sessions-message')).toBeInTheDocument()
      expect(screen.getByText('No sessions')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<SessionPanel sessions={[]} className="custom-class" />)
      const panel = screen.getByTestId('session-panel')
      expect(panel).toHaveClass('custom-class')
    })

    it('displays status indicators for each session', () => {
      render(<SessionPanel sessions={mockSessions} />)
      const indicators = screen.getAllByTestId('status-indicator')
      expect(indicators).toHaveLength(3)
    })

    it('shows active status indicator with green color', () => {
      render(<SessionPanel sessions={[mockSessions[0]]} />)
      const indicator = screen.getByTestId('status-indicator')
      expect(indicator).toHaveAttribute('data-status', 'active')
      expect(indicator).toHaveClass('bg-green-500')
    })

    it('shows idle status indicator with yellow color', () => {
      render(<SessionPanel sessions={[mockSessions[1]]} />)
      const indicator = screen.getByTestId('status-indicator')
      expect(indicator).toHaveAttribute('data-status', 'idle')
      expect(indicator).toHaveClass('bg-yellow-500')
    })

    it('shows disconnected status indicator with red color', () => {
      render(<SessionPanel sessions={[mockSessions[2]]} />)
      const indicator = screen.getByTestId('status-indicator')
      expect(indicator).toHaveAttribute('data-status', 'disconnected')
      expect(indicator).toHaveClass('bg-red-500')
    })

    it('highlights active session', () => {
      render(<SessionPanel sessions={mockSessions} activeSessionId="2" />)
      const session2 = screen.getByTestId('session-2')
      expect(session2).toHaveAttribute('data-active', 'true')
    })
  })

  describe('creating new session', () => {
    it('renders create session button when onCreate is provided', () => {
      const onCreate = vi.fn()
      render(<SessionPanel sessions={[]} onCreate={onCreate} />)
      expect(screen.getByTestId('create-session-button')).toBeInTheDocument()
    })

    it('does not render create button when onCreate is not provided', () => {
      render(<SessionPanel sessions={[]} />)
      expect(screen.queryByTestId('create-session-button')).not.toBeInTheDocument()
    })

    it('calls onCreate when create button is clicked', () => {
      const onCreate = vi.fn()
      render(<SessionPanel sessions={[]} onCreate={onCreate} />)

      const createButton = screen.getByTestId('create-session-button')
      fireEvent.click(createButton)

      expect(onCreate).toHaveBeenCalledTimes(1)
    })

    it('create button has accessible label', () => {
      const onCreate = vi.fn()
      render(<SessionPanel sessions={[]} onCreate={onCreate} />)

      const createButton = screen.getByTestId('create-session-button')
      expect(createButton).toHaveAttribute('aria-label', 'Create new session')
    })
  })

  describe('switching sessions', () => {
    it('calls onSelect when a session is clicked', () => {
      const onSelect = vi.fn()
      render(<SessionPanel sessions={mockSessions} onSelect={onSelect} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.click(session1)

      expect(onSelect).toHaveBeenCalledWith(mockSessions[0])
    })

    it('calls onSelect with correct session when different session is clicked', () => {
      const onSelect = vi.fn()
      render(<SessionPanel sessions={mockSessions} onSelect={onSelect} />)

      const session2 = screen.getByTestId('session-2')
      fireEvent.click(session2)

      expect(onSelect).toHaveBeenCalledWith(mockSessions[1])
    })

    it('calls onSelect when Enter key is pressed on session', () => {
      const onSelect = vi.fn()
      render(<SessionPanel sessions={mockSessions} onSelect={onSelect} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.keyDown(session1, { key: 'Enter' })

      expect(onSelect).toHaveBeenCalledWith(mockSessions[0])
    })

    it('calls onSelect when Space key is pressed on session', () => {
      const onSelect = vi.fn()
      render(<SessionPanel sessions={mockSessions} onSelect={onSelect} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.keyDown(session1, { key: ' ' })

      expect(onSelect).toHaveBeenCalledWith(mockSessions[0])
    })
  })

  describe('deleting sessions', () => {
    it('shows delete button on hover when onDelete is provided', () => {
      const onDelete = vi.fn()
      render(<SessionPanel sessions={mockSessions} onDelete={onDelete} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.mouseEnter(session1)

      expect(screen.getByTestId('delete-session-1')).toBeInTheDocument()
    })

    it('hides delete button when mouse leaves', () => {
      const onDelete = vi.fn()
      render(<SessionPanel sessions={mockSessions} onDelete={onDelete} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.mouseEnter(session1)
      fireEvent.mouseLeave(session1)

      expect(screen.queryByTestId('delete-session-1')).not.toBeInTheDocument()
    })

    it('calls onDelete when delete button is clicked', () => {
      const onDelete = vi.fn()
      render(<SessionPanel sessions={mockSessions} onDelete={onDelete} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.mouseEnter(session1)

      const deleteButton = screen.getByTestId('delete-session-1')
      fireEvent.click(deleteButton)

      expect(onDelete).toHaveBeenCalledWith(mockSessions[0])
    })

    it('does not trigger onSelect when delete button is clicked', () => {
      const onSelect = vi.fn()
      const onDelete = vi.fn()
      render(
        <SessionPanel sessions={mockSessions} onSelect={onSelect} onDelete={onDelete} />
      )

      const session1 = screen.getByTestId('session-1')
      fireEvent.mouseEnter(session1)

      const deleteButton = screen.getByTestId('delete-session-1')
      fireEvent.click(deleteButton)

      expect(onDelete).toHaveBeenCalled()
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('delete button has accessible label', () => {
      const onDelete = vi.fn()
      render(<SessionPanel sessions={mockSessions} onDelete={onDelete} />)

      const session1 = screen.getByTestId('session-1')
      fireEvent.mouseEnter(session1)

      const deleteButton = screen.getByTestId('delete-session-1')
      expect(deleteButton).toHaveAttribute(
        'aria-label',
        'Delete session Session 1'
      )
    })
  })

  describe('accessibility', () => {
    it('has correct role and aria-label', () => {
      render(<SessionPanel sessions={[]} ariaLabel="Session Manager" />)
      const panel = screen.getByTestId('session-panel')
      expect(panel).toHaveAttribute('role', 'region')
      expect(panel).toHaveAttribute('aria-label', 'Session Manager')
    })

    it('session list has list role', () => {
      render(<SessionPanel sessions={mockSessions} />)
      const list = screen.getByTestId('session-list')
      expect(list).toHaveAttribute('role', 'list')
    })

    it('sessions are keyboard accessible', () => {
      render(<SessionPanel sessions={mockSessions} />)
      const session1 = screen.getByTestId('session-1')
      expect(session1).toHaveAttribute('role', 'button')
      expect(session1).toHaveAttribute('tabIndex', '0')
    })
  })
})
