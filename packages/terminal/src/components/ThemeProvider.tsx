/**
 * ThemeProvider Component
 *
 * Provides theme context for the terminal UI components.
 * Supports light/dark mode with automatic system preference detection.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeColors {
  // Base colors
  background: string
  foreground: string
  muted: string
  mutedForeground: string

  // Component colors
  border: string
  input: string
  ring: string

  // Accent colors
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string

  // Semantic colors
  destructive: string
  destructiveForeground: string
  success: string
  successForeground: string
  warning: string
  warningForeground: string

  // Terminal-specific colors
  terminalBackground: string
  terminalForeground: string
  terminalCursor: string
  terminalSelection: string
}

export interface ThemeContextValue {
  /** Current theme mode setting */
  mode: ThemeMode
  /** Resolved theme (light or dark) */
  theme: ResolvedTheme
  /** Set theme mode */
  setMode: (mode: ThemeMode) => void
  /** Toggle between light and dark */
  toggle: () => void
  /** Theme color values */
  colors: ThemeColors
}

const lightColors: ThemeColors = {
  background: '#ffffff',
  foreground: '#0f172a',
  muted: '#f1f5f9',
  mutedForeground: '#64748b',
  border: '#e2e8f0',
  input: '#e2e8f0',
  ring: '#3b82f6',
  primary: '#3b82f6',
  primaryForeground: '#ffffff',
  secondary: '#f1f5f9',
  secondaryForeground: '#0f172a',
  destructive: '#ef4444',
  destructiveForeground: '#ffffff',
  success: '#22c55e',
  successForeground: '#ffffff',
  warning: '#f59e0b',
  warningForeground: '#ffffff',
  terminalBackground: '#1e293b',
  terminalForeground: '#e2e8f0',
  terminalCursor: '#3b82f6',
  terminalSelection: 'rgba(59, 130, 246, 0.3)',
}

const darkColors: ThemeColors = {
  background: '#0f172a',
  foreground: '#f8fafc',
  muted: '#1e293b',
  mutedForeground: '#94a3b8',
  border: '#334155',
  input: '#1e293b',
  ring: '#3b82f6',
  primary: '#3b82f6',
  primaryForeground: '#ffffff',
  secondary: '#1e293b',
  secondaryForeground: '#f8fafc',
  destructive: '#ef4444',
  destructiveForeground: '#ffffff',
  success: '#22c55e',
  successForeground: '#ffffff',
  warning: '#f59e0b',
  warningForeground: '#ffffff',
  terminalBackground: '#020617',
  terminalForeground: '#e2e8f0',
  terminalCursor: '#3b82f6',
  terminalSelection: 'rgba(59, 130, 246, 0.3)',
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export interface ThemeProviderProps {
  /** Child components */
  children: ReactNode
  /** Default theme mode */
  defaultMode?: ThemeMode
  /** Storage key for persisting theme preference */
  storageKey?: string
  /** Force a specific theme (overrides mode) */
  forcedTheme?: ResolvedTheme
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({
  children,
  defaultMode = 'system',
  storageKey = 'terminal-ui-theme',
  forcedTheme,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return defaultMode
    const stored = localStorage.getItem(storageKey)
    return (stored as ThemeMode) || defaultMode
  })

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // Resolve actual theme
  const theme: ResolvedTheme = forcedTheme ?? (mode === 'system' ? systemTheme : mode)

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement

    // Remove both classes first
    root.classList.remove('light', 'dark')

    // Add the current theme class
    root.classList.add(theme)

    // Set color-scheme for native elements
    root.style.colorScheme = theme
  }, [theme])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, newMode)
    }
  }, [storageKey])

  const toggle = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setMode(newTheme)
  }, [theme, setMode])

  const colors = theme === 'dark' ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ mode, theme, setMode, toggle, colors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

/**
 * Hook that returns theme without throwing if outside provider.
 * Defaults to dark theme.
 */
export function useThemeOptional(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      mode: 'dark',
      theme: 'dark',
      setMode: () => {},
      toggle: () => {},
      colors: darkColors,
    }
  }
  return context
}

export default ThemeProvider
