import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Chat, type ChatMessage } from './Chat'

describe('Chat', () => {
  const mockMessages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'Hello, how are you?' },
    { id: '2', role: 'assistant', content: 'I am doing well, thank you!' },
  ]

  describe('rendering', () => {
    it('renders chat container', () => {
      render(<Chat messages={[]} />)
      expect(screen.getByTestId('chat-container')).toBeInTheDocument()
    })

    it('renders message list', () => {
      render(<Chat messages={mockMessages} />)
      expect(screen.getByTestId('chat-messages')).toBeInTheDocument()
    })

    it('renders all messages', () => {
      render(<Chat messages={mockMessages} />)
      expect(screen.getByText('Hello, how are you?')).toBeInTheDocument()
      expect(screen.getByText('I am doing well, thank you!')).toBeInTheDocument()
    })

    it('renders user messages with correct role indicator', () => {
      render(<Chat messages={mockMessages} />)
      const userMessage = screen.getByTestId('message-1')
      expect(userMessage).toHaveAttribute('data-role', 'user')
    })

    it('renders assistant messages with correct role indicator', () => {
      render(<Chat messages={mockMessages} />)
      const assistantMessage = screen.getByTestId('message-2')
      expect(assistantMessage).toHaveAttribute('data-role', 'assistant')
    })

    it('applies custom className', () => {
      render(<Chat messages={[]} className="custom-class" />)
      const container = screen.getByTestId('chat-container')
      expect(container).toHaveClass('custom-class')
    })
  })

  describe('input handling', () => {
    it('renders input field', () => {
      render(<Chat messages={[]} />)
      expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    })

    it('renders submit button', () => {
      render(<Chat messages={[]} />)
      expect(screen.getByTestId('chat-submit')).toBeInTheDocument()
    })

    it('calls onSubmit when form is submitted', async () => {
      const onSubmit = vi.fn()
      render(<Chat messages={[]} onSubmit={onSubmit} />)

      const input = screen.getByTestId('chat-input')
      const submitButton = screen.getByTestId('chat-submit')

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(submitButton)

      expect(onSubmit).toHaveBeenCalledWith('Test message')
    })

    it('clears input after submit', async () => {
      const onSubmit = vi.fn()
      render(<Chat messages={[]} onSubmit={onSubmit} />)

      const input = screen.getByTestId('chat-input') as HTMLInputElement

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(screen.getByTestId('chat-submit'))

      expect(input.value).toBe('')
    })

    it('does not submit empty messages', async () => {
      const onSubmit = vi.fn()
      render(<Chat messages={[]} onSubmit={onSubmit} />)

      fireEvent.click(screen.getByTestId('chat-submit'))

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits on Enter key', async () => {
      const onSubmit = vi.fn()
      render(<Chat messages={[]} onSubmit={onSubmit} />)

      const input = screen.getByTestId('chat-input')

      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

      expect(onSubmit).toHaveBeenCalledWith('Test message')
    })

    it('disables input when disabled prop is true', () => {
      render(<Chat messages={[]} disabled />)

      const input = screen.getByTestId('chat-input')
      const submitButton = screen.getByTestId('chat-submit')

      expect(input).toBeDisabled()
      expect(submitButton).toBeDisabled()
    })

    it('shows custom placeholder', () => {
      render(<Chat messages={[]} placeholder="Ask anything..." />)
      const input = screen.getByTestId('chat-input')
      expect(input).toHaveAttribute('placeholder', 'Ask anything...')
    })
  })

  describe('streaming', () => {
    it('renders streaming message with indicator', () => {
      const streamingMessages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'I am thinking...', isStreaming: true },
      ]

      render(<Chat messages={streamingMessages} />)

      const streamingMessage = screen.getByTestId('message-2')
      expect(streamingMessage).toHaveAttribute('data-streaming', 'true')
    })

    it('shows streaming indicator element', () => {
      const streamingMessages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'Streaming...', isStreaming: true },
      ]

      render(<Chat messages={streamingMessages} />)

      expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument()
    })

    it('updates content during streaming', () => {
      const { rerender } = render(
        <Chat messages={[{ id: '1', role: 'assistant', content: 'Hello', isStreaming: true }]} />
      )

      expect(screen.getByText('Hello')).toBeInTheDocument()

      rerender(
        <Chat messages={[{ id: '1', role: 'assistant', content: 'Hello World', isStreaming: true }]} />
      )

      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })
  })

  describe('markdown rendering', () => {
    it('renders markdown bold text', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'This is **bold** text' },
      ]

      render(<Chat messages={messages} />)

      const boldElement = screen.getByText('bold')
      expect(boldElement.tagName).toBe('STRONG')
    })

    it('renders markdown italic text', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'This is *italic* text' },
      ]

      render(<Chat messages={messages} />)

      const italicElement = screen.getByText('italic')
      expect(italicElement.tagName).toBe('EM')
    })

    it('renders inline code', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'Use the `console.log` function' },
      ]

      render(<Chat messages={messages} />)

      const codeElement = screen.getByText('console.log')
      expect(codeElement.tagName).toBe('CODE')
    })

    it('renders code blocks', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: '```javascript\nconst x = 1;\n```' },
      ]

      render(<Chat messages={messages} />)

      expect(screen.getByTestId('code-block')).toBeInTheDocument()
      expect(screen.getByText('const x = 1;')).toBeInTheDocument()
    })

    it('renders code blocks with language indicator', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: '```typescript\nconst x: number = 1;\n```' },
      ]

      render(<Chat messages={messages} />)

      const codeBlock = screen.getByTestId('code-block')
      expect(codeBlock).toHaveAttribute('data-language', 'typescript')
    })

    it('renders links', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: 'Check out [this link](https://example.com)' },
      ]

      render(<Chat messages={messages} />)

      const link = screen.getByText('this link')
      expect(link.tagName).toBe('A')
      expect(link).toHaveAttribute('href', 'https://example.com')
    })

    it('renders lists', () => {
      const messages: ChatMessage[] = [
        { id: '1', role: 'assistant', content: '- Item 1\n- Item 2\n- Item 3' },
      ]

      render(<Chat messages={messages} />)

      expect(screen.getByText('Item 1')).toBeInTheDocument()
      expect(screen.getByText('Item 2')).toBeInTheDocument()
      expect(screen.getByText('Item 3')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has correct accessibility attributes', () => {
      render(<Chat messages={[]} ariaLabel="Chat Interface" />)
      const container = screen.getByTestId('chat-container')
      expect(container).toHaveAttribute('role', 'log')
      expect(container).toHaveAttribute('aria-label', 'Chat Interface')
    })

    it('marks messages as aria-live polite', () => {
      render(<Chat messages={mockMessages} />)
      const messageList = screen.getByTestId('chat-messages')
      expect(messageList).toHaveAttribute('aria-live', 'polite')
    })

    it('input has appropriate label', () => {
      render(<Chat messages={[]} />)
      const input = screen.getByTestId('chat-input')
      expect(input).toHaveAttribute('aria-label')
    })
  })

  describe('scrolling behavior', () => {
    it('auto-scrolls to bottom when new messages arrive', async () => {
      const { rerender } = render(<Chat messages={mockMessages} />)

      const messageList = screen.getByTestId('chat-messages')
      const scrollToMock = vi.fn()
      messageList.scrollTo = scrollToMock

      rerender(<Chat messages={[...mockMessages, { id: '3', role: 'user', content: 'New message' }]} />)

      await waitFor(() => {
        expect(scrollToMock).toHaveBeenCalled()
      })
    })
  })
})
