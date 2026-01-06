/**
 * @dotdo/terminal/embed
 *
 * iframe wrapper component for embedding terminal in any app.
 * Provides type-safe postMessage communication.
 *
 * @example React usage
 * ```tsx
 * import { TerminalEmbed } from '@dotdo/terminal/embed'
 *
 * function App() {
 *   return (
 *     <TerminalEmbed
 *       src="https://terminal.cod.ng"
 *       sessionId="abc123"
 *       onOutput={(data) => console.log('Output:', data)}
 *       onResize={(size) => console.log('Size:', size)}
 *     />
 *   )
 * }
 * ```
 *
 * @example Vanilla HTML
 * ```html
 * <iframe
 *   src="https://terminal.cod.ng?session=abc123"
 *   id="terminal"
 *   allow="clipboard-read; clipboard-write"
 * ></iframe>
 * <script>
 *   window.addEventListener('message', (e) => {
 *     if (e.data.type === 'terminal:output') {
 *       console.log('Output:', e.data.data)
 *     }
 *   })
 * </script>
 * ```
 */

export { TerminalEmbed, type TerminalEmbedProps } from './TerminalEmbed'
export type {
  TerminalMessage,
  TerminalInputMessage,
  TerminalOutputMessage,
  TerminalResizeMessage,
  TerminalReadyMessage,
  TerminalErrorMessage,
} from './types'
