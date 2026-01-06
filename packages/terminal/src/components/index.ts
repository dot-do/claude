/**
 * @dotdo/terminal Components
 *
 * Tool-agnostic terminal UI components for React applications.
 *
 * @example Basic terminal
 * ```tsx
 * import { Terminal } from '@dotdo/terminal'
 *
 * function App() {
 *   return <Terminal wsUrl="wss://my-pty-server.com/ws" />
 * }
 * ```
 *
 * @example Full layout with file tree and theme support
 * ```tsx
 * import { Terminal, FileTree, Layout, ThemeProvider } from '@dotdo/terminal'
 *
 * function App() {
 *   return (
 *     <ThemeProvider defaultMode="system">
 *       <Layout
 *         sidebar={<FileTree files={files} onSelect={handleSelect} />}
 *         main={<Terminal wsUrl={wsUrl} />}
 *       />
 *     </ThemeProvider>
 *   )
 * }
 * ```
 */

export {
  Terminal,
  type TerminalProps,
  type TerminalTheme,
  type TerminalRef,
  darkTerminalTheme,
  lightTerminalTheme,
} from './Terminal'
export { FileTree, type FileTreeProps, type FileNode } from './FileTree'
export { Layout, type LayoutProps } from './Layout'
export { DiffViewer, type DiffViewerProps, type DiffViewMode } from './DiffViewer'
export { Chat, type ChatProps, type ChatMessage } from './Chat'
export { SessionPanel, type SessionPanelProps, type Session } from './SessionPanel'
export {
  ThemeProvider,
  useTheme,
  useThemeOptional,
  type ThemeProviderProps,
  type ThemeContextValue,
  type ThemeMode,
  type ResolvedTheme,
  type ThemeColors,
} from './ThemeProvider'
export { ErrorBoundary } from './ErrorBoundary'
