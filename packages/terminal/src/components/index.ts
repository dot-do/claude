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
 * @example Full layout with file tree
 * ```tsx
 * import { Terminal, FileTree, Layout } from '@dotdo/terminal'
 *
 * function App() {
 *   return (
 *     <Layout
 *       sidebar={<FileTree files={files} onSelect={handleSelect} />}
 *       main={<Terminal wsUrl={wsUrl} />}
 *     />
 *   )
 * }
 * ```
 */

export { Terminal, type TerminalProps, type TerminalTheme, type TerminalRef } from './Terminal'
export { FileTree, type FileTreeProps, type FileNode } from './FileTree'
export { Layout, type LayoutProps } from './Layout'
