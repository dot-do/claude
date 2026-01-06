/**
 * Test setup for RPC tests - mocks WebSocket globally
 */

// Mock function type for tracking calls
export type MockFn = {
  (...args: unknown[]): void
  mock: { calls: unknown[][] }
  mockClear: () => void
}

// Create mock class
export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = 0 // CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  url: string
  send: MockFn
  close: MockFn

  constructor(url: string) {
    this.url = url
    // Create mock functions for this instance
    const sendCalls: unknown[][] = []
    this.send = Object.assign(
      (...args: unknown[]) => { sendCalls.push(args) },
      { mock: { calls: sendCalls }, mockClear: () => { sendCalls.length = 0 } }
    ) as MockFn

    const closeCalls: unknown[][] = []
    const closeImpl = Object.assign(
      (...args: unknown[]) => {
        closeCalls.push(args)
        this.readyState = 3 // CLOSED
        this.onclose?.()
      },
      { mock: { calls: closeCalls }, mockClear: () => { closeCalls.length = 0 } }
    ) as MockFn
    this.close = closeImpl

    MockWebSocket.instances.push(this)
  }

  // Helper to simulate successful connection
  simulateOpen(): void {
    this.readyState = 1 // OPEN
    this.onopen?.()
  }

  // Helper to simulate connection error
  simulateError(error?: unknown): void {
    this.readyState = 3 // CLOSED
    this.onerror?.(error ?? new Error('Connection failed'))
  }

  // Helper to simulate close event from server
  simulateClose(): void {
    this.readyState = 3 // CLOSED
    this.onclose?.()
  }

  // Helper to simulate receiving a message
  receiveMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  static clear(): void {
    MockWebSocket.instances = []
  }

  // Helper to get the latest instance
  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }
}

// Set up mock on global
;(globalThis as Record<string, unknown>).WebSocket = MockWebSocket
