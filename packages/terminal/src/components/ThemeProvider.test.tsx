/**
 * ThemeProvider Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme, useThemeOptional } from './ThemeProvider'

// Mock matchMedia
const createMatchMedia = (matches: boolean) => {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// Test component that uses the theme hook
function TestConsumer() {
  const { theme, mode, toggle, setMode } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="mode">{mode}</span>
      <button data-testid="toggle" onClick={toggle}>Toggle</button>
      <button data-testid="set-light" onClick={() => setMode('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setMode('dark')}>Dark</button>
      <button data-testid="set-system" onClick={() => setMode('system')}>System</button>
    </div>
  )
}

// Test component that uses the optional theme hook
function OptionalTestConsumer() {
  const { theme, mode } = useThemeOptional()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="mode">{mode}</span>
    </div>
  )
}

describe('ThemeProvider', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
    window.matchMedia = createMatchMedia(true) // Default to dark mode preference
    localStorage.clear()
    document.documentElement.className = ''
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('renders children', () => {
    render(
      <ThemeProvider>
        <div data-testid="child">Child content</div>
      </ThemeProvider>
    )

    expect(screen.getByTestId('child')).toHaveTextContent('Child content')
  })

  it('provides default dark theme when system prefers dark', () => {
    window.matchMedia = createMatchMedia(true)

    render(
      <ThemeProvider defaultMode="system">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it('provides default light theme when system prefers light', () => {
    window.matchMedia = createMatchMedia(false)

    render(
      <ThemeProvider defaultMode="system">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it('respects explicit defaultMode', () => {
    render(
      <ThemeProvider defaultMode="light">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })

  it('toggles theme', () => {
    window.matchMedia = createMatchMedia(true)

    render(
      <ThemeProvider defaultMode="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')

    fireEvent.click(screen.getByTestId('toggle'))

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('sets theme mode', () => {
    render(
      <ThemeProvider defaultMode="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('dark')

    fireEvent.click(screen.getByTestId('set-light'))
    expect(screen.getByTestId('mode')).toHaveTextContent('light')

    fireEvent.click(screen.getByTestId('set-system'))
    expect(screen.getByTestId('mode')).toHaveTextContent('system')
  })

  it('persists theme preference to localStorage', () => {
    render(
      <ThemeProvider defaultMode="dark" storageKey="test-theme">
        <TestConsumer />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByTestId('set-light'))

    expect(localStorage.getItem('test-theme')).toBe('light')
  })

  it('loads theme preference from localStorage', () => {
    localStorage.setItem('test-theme', 'light')

    render(
      <ThemeProvider defaultMode="dark" storageKey="test-theme">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })

  it('applies theme class to document', () => {
    render(
      <ThemeProvider defaultMode="dark">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByTestId('toggle'))

    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('respects forcedTheme prop', () => {
    window.matchMedia = createMatchMedia(true)

    render(
      <ThemeProvider defaultMode="system" forcedTheme="light">
        <TestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })
})

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestConsumer />)
    }).toThrow('useTheme must be used within a ThemeProvider')

    consoleSpy.mockRestore()
  })
})

describe('useThemeOptional', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('returns default dark theme when used outside ThemeProvider', () => {
    render(<OptionalTestConsumer />)

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
  })

  it('works correctly when inside ThemeProvider', () => {
    window.matchMedia = createMatchMedia(false)

    render(
      <ThemeProvider defaultMode="light">
        <OptionalTestConsumer />
      </ThemeProvider>
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
  })
})
