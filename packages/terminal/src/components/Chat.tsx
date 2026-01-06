/**
 * Chat Component
 *
 * A chat interface component for displaying messages with markdown support,
 * streaming responses, and code block rendering.
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FormEvent } from 'react'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}

export interface ChatProps {
  /** Array of messages to display */
  messages: ChatMessage[]
  /** Called when user submits a message */
  onSubmit?: (message: string) => void
  /** Disable input and submit button */
  disabled?: boolean
  /** Placeholder text for input field */
  placeholder?: string
  /** Aria label for accessibility */
  ariaLabel?: string
  /** Additional CSS class */
  className?: string
}

/**
 * Parse and render markdown content
 */
function MarkdownContent({ content }: { content: string }) {
  const elements: React.ReactNode[] = []

  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let keyIndex = 0

  const parseInlineContent = (text: string, startKey: number): React.ReactNode[] => {
    const result: React.ReactNode[] = []
    let remaining = text
    let currentKey = startKey

    // Process inline elements
    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // Italic
      const italicMatch = remaining.match(/\*(.+?)\*/)
      // Inline code
      const codeMatch = remaining.match(/`([^`]+)`/)
      // Link
      const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
      // List item
      const listMatch = remaining.match(/^- (.+)$/m)

      // Find the earliest match
      const matches = [
        { type: 'bold', match: boldMatch, index: boldMatch?.index ?? Infinity },
        { type: 'italic', match: italicMatch, index: italicMatch?.index ?? Infinity },
        { type: 'code', match: codeMatch, index: codeMatch?.index ?? Infinity },
        { type: 'link', match: linkMatch, index: linkMatch?.index ?? Infinity },
        { type: 'list', match: listMatch, index: listMatch?.index ?? Infinity },
      ].filter(m => m.match !== null)
        .sort((a, b) => a.index - b.index)

      // Check if bold comes before italic (same position means bold wins)
      const firstMatch = matches[0]

      if (!firstMatch || firstMatch.index === Infinity) {
        // No more matches, add remaining text
        if (remaining.length > 0) {
          result.push(remaining)
        }
        break
      }

      // Add text before the match
      if (firstMatch.index > 0) {
        result.push(remaining.substring(0, firstMatch.index))
      }

      const m = firstMatch.match!

      switch (firstMatch.type) {
        case 'bold':
          result.push(<strong key={currentKey++}>{m[1]}</strong>)
          remaining = remaining.substring(firstMatch.index + m[0].length)
          break
        case 'italic':
          // Make sure this isn't part of a bold (check for double asterisk)
          if (remaining.substring(firstMatch.index).startsWith('**')) {
            // This is bold, not italic - skip and handle normally
            result.push(remaining.substring(0, firstMatch.index + 1))
            remaining = remaining.substring(firstMatch.index + 1)
          } else {
            result.push(<em key={currentKey++}>{m[1]}</em>)
            remaining = remaining.substring(firstMatch.index + m[0].length)
          }
          break
        case 'code':
          result.push(<code key={currentKey++} className="bg-zinc-800 px-1 py-0.5 rounded text-sm font-mono">{m[1]}</code>)
          remaining = remaining.substring(firstMatch.index + m[0].length)
          break
        case 'link':
          result.push(
            <a
              key={currentKey++}
              href={m[2]}
              className="text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              {m[1]}
            </a>
          )
          remaining = remaining.substring(firstMatch.index + m[0].length)
          break
        case 'list':
          result.push(
            <li key={currentKey++} className="ml-4">
              {m[1]}
            </li>
          )
          remaining = remaining.substring(firstMatch.index + m[0].length)
          break
      }
    }

    return result
  }

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add content before the code block
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index)
      elements.push(...parseInlineContent(textBefore, keyIndex))
      keyIndex += 100
    }

    // Add code block
    const language = match[1] || ''
    const code = match[2].trim()
    elements.push(
      <pre
        key={`code-${keyIndex++}`}
        data-testid="code-block"
        data-language={language || undefined}
        className="bg-zinc-900 p-3 rounded-lg overflow-x-auto my-2 font-mono text-sm"
      >
        <code>{code}</code>
      </pre>
    )

    lastIndex = match.index + match[0].length
  }

  // Add remaining content after the last code block
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex)
    elements.push(...parseInlineContent(remainingText, keyIndex))
  }

  return <>{elements}</>
}

/**
 * Single message component
 */
function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isStreaming = message.isStreaming ?? false

  return (
    <div
      data-testid={`message-${message.id}`}
      data-role={message.role}
      data-streaming={isStreaming ? 'true' : undefined}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-zinc-800 text-zinc-100'
        }`}
      >
        <MarkdownContent content={message.content} />
        {isStreaming && (
          <span
            data-testid="streaming-indicator"
            className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-1"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
}

export function Chat({
  messages,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
  ariaLabel = 'Chat',
  className = '',
}: ChatProps) {
  const [inputValue, setInputValue] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const prevMessagesLengthRef = useRef(messages.length)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && messagesRef.current) {
      messagesRef.current.scrollTo({
        top: messagesRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages])

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault()
      const trimmedValue = inputValue.trim()
      if (trimmedValue && onSubmit) {
        onSubmit(trimmedValue)
        setInputValue('')
      }
    },
    [inputValue, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div
      data-testid="chat-container"
      role="log"
      aria-label={ariaLabel}
      className={`flex flex-col h-full bg-zinc-950 text-white ${className}`}
    >
      {/* Messages container */}
      <div
        ref={messagesRef}
        data-testid="chat-messages"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4"
      >
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}
      </div>

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 p-4 border-t border-zinc-800"
      >
        <input
          data-testid="chat-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message input"
          className="flex-1 bg-zinc-800 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          data-testid="chat-submit"
          type="submit"
          disabled={disabled}
          aria-label="Send message"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default Chat
