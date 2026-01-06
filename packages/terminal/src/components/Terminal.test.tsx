import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Terminal } from './Terminal'

// Mock xterm.js with proper class mocks
vi.mock('@xterm/xterm', () => {
  const MockTerminal = vi.fn(function(this: any) {
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
  const MockFitAddon = vi.fn(function(this: any) {
    this.fit = vi.fn()
  })
  return { FitAddon: MockFitAddon }
})

vi.mock('@xterm/addon-webgl', () => {
  const MockWebglAddon = vi.fn(function() {})
  return { WebglAddon: MockWebglAddon }
})

describe('Terminal', () => {
  it('renders terminal container', () => {
    render(<Terminal />)
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
  })

  it('has correct accessibility attributes', () => {
    render(<Terminal ariaLabel="Test Terminal" />)
    const container = screen.getByTestId('terminal-container')
    expect(container).toHaveAttribute('role', 'region')
    expect(container).toHaveAttribute('aria-label', 'Test Terminal')
    expect(container).toHaveAttribute('aria-roledescription', 'terminal')
  })

  it('applies custom className', () => {
    render(<Terminal className="custom-class" />)
    const container = screen.getByTestId('terminal-container')
    expect(container).toHaveClass('custom-class')
  })
})
