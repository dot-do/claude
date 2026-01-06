/**
 * App.tsx tests - postMessage origin validation
 *
 * TDD: These tests verify that postMessage handlers properly validate origins
 * to prevent malicious sites from injecting commands.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import App from './App'

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-session-id',
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock xterm.js and addons
vi.mock('@xterm/xterm', () => {
  const MockTerminal = vi.fn(function (this: any) {
    this.loadAddon = vi.fn()
    this.open = vi.fn()
    this.onData = vi.fn()
    this.onResize = vi.fn()
    this.focus = vi.fn()
    this.dispose = vi.fn()
    this.cols = 80
    this.rows = 24
    this.write = vi.fn()
    this.clear = vi.fn()
  })
  return { Terminal: MockTerminal }
})

vi.mock('@xterm/addon-fit', () => {
  const MockFitAddon = vi.fn(function (this: any) {
    this.fit = vi.fn()
  })
  return { FitAddon: MockFitAddon }
})

vi.mock('@xterm/addon-webgl', () => {
  const MockWebglAddon = vi.fn(function () {})
  return { WebglAddon: MockWebglAddon }
})

describe('App postMessage origin validation', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reset mocks
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Reset location
    Object.defineProperty(window, 'location', {
      value: {
        protocol: 'https:',
        host: 'terminal.example.com',
        search: '',
        origin: 'https://terminal.example.com',
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Helper to dispatch a postMessage event with a specific origin
   */
  function dispatchPostMessage(data: unknown, origin: string) {
    const event = new MessageEvent('message', {
      data,
      origin,
      source: window.parent,
    })
    window.dispatchEvent(event)
  }

  describe('origin validation', () => {
    it('should reject messages from malicious origins', async () => {
      render(<App />)

      // Simulate malicious message from evil.com
      dispatchPostMessage(
        { type: 'terminal:input', data: 'rm -rf /' },
        'https://evil.com'
      )

      // Should warn about rejected origin
      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/rejected.*evil\.com/i)
        )
      })

      // Should NOT process the input
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Received input'),
        expect.anything()
      )
    })

    it('should accept messages from allowed origins', async () => {
      // Set up allowed origin via URL parameter
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          host: 'terminal.example.com',
          search: '?allowedOrigin=https://app.example.com',
          origin: 'https://terminal.example.com',
        },
        writable: true,
      })

      render(<App />)

      // Simulate message from allowed origin
      dispatchPostMessage(
        { type: 'terminal:input', data: 'echo hello' },
        'https://app.example.com'
      )

      // Should process the input
      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Received input'),
          'echo hello'
        )
      })
    })

    it('should handle null origin (sandboxed iframe) based on configuration', async () => {
      render(<App />)

      // Simulate message from sandboxed iframe (null origin)
      dispatchPostMessage({ type: 'terminal:input', data: 'ls' }, 'null')

      // By default, null origins should be rejected for security
      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/rejected.*"null"/i)
        )
      })
    })

    it('should allow null origin when explicitly configured', async () => {
      // Set up to allow null origin
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          host: 'terminal.example.com',
          search: '?allowNullOrigin=true&allowedOrigin=https://parent.com',
          origin: 'https://terminal.example.com',
        },
        writable: true,
      })

      render(<App />)

      // Simulate message from sandboxed iframe (null origin)
      dispatchPostMessage({ type: 'terminal:input', data: 'pwd' }, 'null')

      // Should process the input when null origin is allowed
      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Received input'),
          'pwd'
        )
      })
    })

    it('should reject messages with empty origin', async () => {
      render(<App />)

      // Simulate message with empty origin
      dispatchPostMessage({ type: 'terminal:input', data: 'whoami' }, '')

      // Should warn about rejected origin (empty string is rejected)
      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/rejected.*""/i)
        )
      })
    })

    it('should reject messages from different port on same domain', async () => {
      // Set allowed origin on port 3000
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          host: 'terminal.example.com',
          search: '?allowedOrigin=https://app.example.com:3000',
          origin: 'https://terminal.example.com',
        },
        writable: true,
      })

      render(<App />)

      // Simulate message from same domain but different port
      dispatchPostMessage(
        { type: 'terminal:input', data: 'cat /etc/passwd' },
        'https://app.example.com:4000'
      )

      // Should reject due to port mismatch
      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(/rejected.*4000/i)
        )
      })
    })

    it('should allow multiple configured origins', async () => {
      // Set up multiple allowed origins
      Object.defineProperty(window, 'location', {
        value: {
          protocol: 'https:',
          host: 'terminal.example.com',
          search:
            '?allowedOrigins=https://app1.example.com,https://app2.example.com',
          origin: 'https://terminal.example.com',
        },
        writable: true,
      })

      render(<App />)

      // Test first allowed origin
      dispatchPostMessage(
        { type: 'terminal:input', data: 'echo app1' },
        'https://app1.example.com'
      )

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Received input'),
          'echo app1'
        )
      })

      // Reset spy
      consoleLogSpy.mockClear()

      // Test second allowed origin
      dispatchPostMessage(
        { type: 'terminal:input', data: 'echo app2' },
        'https://app2.example.com'
      )

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Received input'),
          'echo app2'
        )
      })
    })
  })
})
