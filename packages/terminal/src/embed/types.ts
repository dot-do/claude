/**
 * postMessage API types for terminal iframe communication
 */

/** Message from parent to terminal iframe */
export interface TerminalInputMessage {
  type: 'terminal:input'
  data: string
}

/** Message from terminal iframe to parent - terminal output */
export interface TerminalOutputMessage {
  type: 'terminal:output'
  data: string
}

/** Message from terminal iframe to parent - resize event */
export interface TerminalResizeMessage {
  type: 'terminal:resize'
  cols: number
  rows: number
}

/** Message from terminal iframe to parent - ready event */
export interface TerminalReadyMessage {
  type: 'terminal:ready'
  sessionId: string
}

/** Message from terminal iframe to parent - error event */
export interface TerminalErrorMessage {
  type: 'terminal:error'
  error: string
  code?: string
}

/** Message from terminal iframe to parent - disconnected event */
export interface TerminalDisconnectedMessage {
  type: 'terminal:disconnected'
  reason?: string
}

/** All terminal message types */
export type TerminalMessage =
  | TerminalInputMessage
  | TerminalOutputMessage
  | TerminalResizeMessage
  | TerminalReadyMessage
  | TerminalErrorMessage
  | TerminalDisconnectedMessage

/** Type guard for terminal messages */
export function isTerminalMessage(data: unknown): data is TerminalMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    typeof (data as { type: unknown }).type === 'string' &&
    (data as { type: string }).type.startsWith('terminal:')
  )
}
