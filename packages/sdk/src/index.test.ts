/**
 * Main Export Compatibility Tests
 *
 * TDD: Issue claude-879.3
 * Ensures the main export from @dotdo/claude works correctly and exports all public APIs.
 *
 * These tests verify:
 * 1. Default import still works
 * 2. All current exports are available
 * 3. Types are properly exported
 * 4. Backward compatibility is maintained
 */

import { describe, it, expect } from 'vitest'

// Import everything from main entry point
import * as sdk from './index.js'

describe('@dotdo/claude Main Export Compatibility', () => {
  // ============================================================================
  // Client Exports
  // ============================================================================
  describe('Client Exports', () => {
    it('should export ClaudeClient class', () => {
      expect(sdk.ClaudeClient).toBeDefined()
      expect(typeof sdk.ClaudeClient).toBe('function')
    })

    it('should export createClaudeClient factory function', () => {
      expect(sdk.createClaudeClient).toBeDefined()
      expect(typeof sdk.createClaudeClient).toBe('function')
    })

    it('should export ClaudeClientError class', () => {
      expect(sdk.ClaudeClientError).toBeDefined()
      expect(typeof sdk.ClaudeClientError).toBe('function')
    })

    it('should export ClaudeSession class', () => {
      expect(sdk.ClaudeSession).toBeDefined()
      expect(typeof sdk.ClaudeSession).toBe('function')
    })

    it('should export ReconnectionPolicy class', () => {
      expect(sdk.ReconnectionPolicy).toBeDefined()
      expect(typeof sdk.ReconnectionPolicy).toBe('function')
    })
  })

  // ============================================================================
  // Server Exports
  // ============================================================================
  describe('Server Exports', () => {
    it('should export ClaudeCode Durable Object', () => {
      expect(sdk.ClaudeCode).toBeDefined()
      expect(typeof sdk.ClaudeCode).toBe('function')
    })

    it('should export getSandbox helper', () => {
      expect(sdk.getSandbox).toBeDefined()
      expect(typeof sdk.getSandbox).toBe('function')
    })

    it('should export createClaudeServer function', () => {
      expect(sdk.createClaudeServer).toBeDefined()
      expect(typeof sdk.createClaudeServer).toBe('function')
    })

    it('should export proxyToClaude function', () => {
      expect(sdk.proxyToClaude).toBeDefined()
      expect(typeof sdk.proxyToClaude).toBe('function')
    })

    it('should export cloneRepository function', () => {
      expect(sdk.cloneRepository).toBeDefined()
      expect(typeof sdk.cloneRepository).toBe('function')
    })

    it('should export NDJSONParser class', () => {
      expect(sdk.NDJSONParser).toBeDefined()
      expect(typeof sdk.NDJSONParser).toBe('function')
    })

    it('should export ProcessManager class', () => {
      expect(sdk.ProcessManager).toBeDefined()
      expect(typeof sdk.ProcessManager).toBe('function')
    })

    it('should export buildCliArgs function', () => {
      expect(sdk.buildCliArgs).toBeDefined()
      expect(typeof sdk.buildCliArgs).toBe('function')
    })

    it('should export NDJSON extraction helpers', () => {
      expect(sdk.extractTodoUpdates).toBeDefined()
      expect(sdk.extractPlanUpdates).toBeDefined()
      expect(sdk.extractToolUses).toBeDefined()
      expect(sdk.extractResult).toBeDefined()
      expect(sdk.extractSessionId).toBeDefined()
      expect(sdk.isComplete).toBeDefined()
      expect(sdk.hasError).toBeDefined()
    })

    it('should export isExecResult type guard', () => {
      expect(sdk.isExecResult).toBeDefined()
      expect(typeof sdk.isExecResult).toBe('function')
    })
  })

  // ============================================================================
  // RPC Exports
  // ============================================================================
  describe('RPC Exports', () => {
    it('should export RpcTarget from capnweb', () => {
      expect(sdk.RpcTarget).toBeDefined()
      expect(typeof sdk.RpcTarget).toBe('function')
    })

    it('should export RpcSession class', () => {
      expect(sdk.RpcSession).toBeDefined()
      expect(typeof sdk.RpcSession).toBe('function')
    })

    it('should export createRpcSession function', () => {
      expect(sdk.createRpcSession).toBeDefined()
      expect(typeof sdk.createRpcSession).toBe('function')
    })

    it('should export newWebSocketRpcSession function', () => {
      expect(sdk.newWebSocketRpcSession).toBeDefined()
      expect(typeof sdk.newWebSocketRpcSession).toBe('function')
    })

    it('should export ClaudeCodeRpcServer class', () => {
      expect(sdk.ClaudeCodeRpcServer).toBeDefined()
      expect(typeof sdk.ClaudeCodeRpcServer).toBe('function')
    })

    it('should export createRpcHandler function', () => {
      expect(sdk.createRpcHandler).toBeDefined()
      expect(typeof sdk.createRpcHandler).toBe('function')
    })

    it('should export createRpcServer function', () => {
      expect(sdk.createRpcServer).toBeDefined()
      expect(typeof sdk.createRpcServer).toBe('function')
    })

    it('should export RpcError class', () => {
      expect(sdk.RpcError).toBeDefined()
      expect(typeof sdk.RpcError).toBe('function')
    })

    it('should export ErrorCodes constant', () => {
      expect(sdk.ErrorCodes).toBeDefined()
      expect(typeof sdk.ErrorCodes).toBe('object')
    })

    it('should export RpcTimeoutError class', () => {
      expect(sdk.RpcTimeoutError).toBeDefined()
      expect(typeof sdk.RpcTimeoutError).toBe('function')
    })
  })

  // ============================================================================
  // Event Emitter Exports
  // ============================================================================
  describe('Event Emitter Exports', () => {
    it('should export TypedEventEmitter class', () => {
      expect(sdk.TypedEventEmitter).toBeDefined()
      expect(typeof sdk.TypedEventEmitter).toBe('function')
    })

    it('should export EventKeys helper object', () => {
      expect(sdk.EventKeys).toBeDefined()
      expect(typeof sdk.EventKeys).toBe('object')
      expect(typeof sdk.EventKeys.output).toBe('function')
      expect(typeof sdk.EventKeys.todo).toBe('function')
      expect(typeof sdk.EventKeys.plan).toBe('function')
    })

    it('should export sessionEvent helper function', () => {
      expect(sdk.sessionEvent).toBeDefined()
      expect(typeof sdk.sessionEvent).toBe('function')
      expect(sdk.sessionEvent('test', '123')).toBe('test:123')
    })

    it('should export getGlobalEmitter function', () => {
      expect(sdk.getGlobalEmitter).toBeDefined()
      expect(typeof sdk.getGlobalEmitter).toBe('function')
    })

    it('should export resetGlobalEmitter function', () => {
      expect(sdk.resetGlobalEmitter).toBeDefined()
      expect(typeof sdk.resetGlobalEmitter).toBe('function')
    })
  })

  // ============================================================================
  // Terminal Proxy Exports
  // ============================================================================
  describe('Terminal Proxy Exports', () => {
    it('should export TerminalProxy class', () => {
      expect(sdk.TerminalProxy).toBeDefined()
      expect(typeof sdk.TerminalProxy).toBe('function')
    })

    it('should export createTerminalProxy factory function', () => {
      expect(sdk.createTerminalProxy).toBeDefined()
      expect(typeof sdk.createTerminalProxy).toBe('function')
    })

    it('should export ConnectionState enum', () => {
      expect(sdk.ConnectionState).toBeDefined()
      expect(sdk.ConnectionState.Connecting).toBe('connecting')
      expect(sdk.ConnectionState.Connected).toBe('connected')
      expect(sdk.ConnectionState.Disconnected).toBe('disconnected')
      expect(sdk.ConnectionState.Reconnecting).toBe('reconnecting')
    })
  })

  // ============================================================================
  // Middleware Exports
  // ============================================================================
  describe('Middleware Exports', () => {
    it('should export AuthMiddleware class', () => {
      expect(sdk.AuthMiddleware).toBeDefined()
      expect(typeof sdk.AuthMiddleware).toBe('function')
    })

    it('should export createAuthMiddleware factory function', () => {
      expect(sdk.createAuthMiddleware).toBeDefined()
      expect(typeof sdk.createAuthMiddleware).toBe('function')
    })

    it('should export ApiKeyAuthenticator class', () => {
      expect(sdk.ApiKeyAuthenticator).toBeDefined()
      expect(typeof sdk.ApiKeyAuthenticator).toBe('function')
    })

    it('should export JwtAuthenticator class', () => {
      expect(sdk.JwtAuthenticator).toBeDefined()
      expect(typeof sdk.JwtAuthenticator).toBe('function')
    })

    it('should export RateLimiter class', () => {
      expect(sdk.RateLimiter).toBeDefined()
      expect(typeof sdk.RateLimiter).toBe('function')
    })

    it('should export auth error classes', () => {
      expect(sdk.AuthenticationError).toBeDefined()
      expect(sdk.AuthorizationError).toBeDefined()
      expect(sdk.RateLimitError).toBeDefined()
      expect(typeof sdk.AuthenticationError).toBe('function')
      expect(typeof sdk.AuthorizationError).toBe('function')
      expect(typeof sdk.RateLimitError).toBe('function')
    })
  })

  // ============================================================================
  // File Operations Exports
  // ============================================================================
  describe('File Operations Exports', () => {
    it('should export readFile function', () => {
      expect(sdk.readFile).toBeDefined()
      expect(typeof sdk.readFile).toBe('function')
    })

    it('should export writeFile function', () => {
      expect(sdk.writeFile).toBeDefined()
      expect(typeof sdk.writeFile).toBe('function')
    })

    it('should export listFiles function', () => {
      expect(sdk.listFiles).toBeDefined()
      expect(typeof sdk.listFiles).toBe('function')
    })
  })

  // ============================================================================
  // Runtime Adapter Exports
  // ============================================================================
  describe('Runtime Adapter Exports', () => {
    it('should export createCloudflareRuntime factory function', () => {
      expect(sdk.createCloudflareRuntime).toBeDefined()
      expect(typeof sdk.createCloudflareRuntime).toBe('function')
    })

    it('should export CloudflareRuntimeAdapter class', () => {
      expect(sdk.CloudflareRuntimeAdapter).toBeDefined()
      expect(typeof sdk.CloudflareRuntimeAdapter).toBe('function')
    })

    it('should export CloudflareProcessAdapter class', () => {
      expect(sdk.CloudflareProcessAdapter).toBeDefined()
      expect(typeof sdk.CloudflareProcessAdapter).toBe('function')
    })
  })

  // ============================================================================
  // Type Guards Exports
  // ============================================================================
  describe('Type Guards Exports', () => {
    it('should export content block type guards', () => {
      expect(sdk.isTextBlock).toBeDefined()
      expect(sdk.isToolUseBlock).toBeDefined()
      expect(sdk.isToolResultBlock).toBeDefined()
      expect(typeof sdk.isTextBlock).toBe('function')
      expect(typeof sdk.isToolUseBlock).toBe('function')
      expect(typeof sdk.isToolResultBlock).toBe('function')
    })

    it('should export message type guards', () => {
      expect(sdk.isAssistantMessage).toBeDefined()
      expect(sdk.isUserMessage).toBeDefined()
      expect(sdk.isResultMessage).toBeDefined()
      expect(sdk.isSystemMessage).toBeDefined()
      expect(sdk.isPartialMessage).toBeDefined()
      expect(typeof sdk.isAssistantMessage).toBe('function')
      expect(typeof sdk.isUserMessage).toBe('function')
      expect(typeof sdk.isResultMessage).toBe('function')
      expect(typeof sdk.isSystemMessage).toBe('function')
      expect(typeof sdk.isPartialMessage).toBe('function')
    })

    it('should export tool input type guards', () => {
      expect(sdk.isTodoWriteInput).toBeDefined()
      expect(sdk.isExitPlanModeInput).toBeDefined()
      expect(sdk.isWriteToolInput).toBeDefined()
      expect(typeof sdk.isTodoWriteInput).toBe('function')
      expect(typeof sdk.isExitPlanModeInput).toBe('function')
      expect(typeof sdk.isWriteToolInput).toBe('function')
    })

    it('should export tool input validators', () => {
      expect(sdk.validateTodoWriteInput).toBeDefined()
      expect(sdk.validateExitPlanModeInput).toBeDefined()
      expect(sdk.validateWriteToolInput).toBeDefined()
      expect(typeof sdk.validateTodoWriteInput).toBe('function')
      expect(typeof sdk.validateExitPlanModeInput).toBe('function')
      expect(typeof sdk.validateWriteToolInput).toBe('function')
    })
  })

  // ============================================================================
  // Backward Compatibility
  // ============================================================================
  describe('Backward Compatibility', () => {
    it('should export deprecated Sandbox type aliases', () => {
      // These are type-only exports, but we can verify they don't cause import errors
      // The presence of type exports is verified by TypeScript compilation
      expect(true).toBe(true)
    })

    it('should export legacy Session type', () => {
      // Type-only export, verified by TypeScript
      expect(true).toBe(true)
    })

    it('should export ClaudeConfig type', () => {
      // Type-only export, verified by TypeScript
      expect(true).toBe(true)
    })
  })

  // ============================================================================
  // Export Completeness
  // ============================================================================
  describe('Export Completeness', () => {
    it('should export a significant number of APIs', () => {
      // Ensure we have a reasonable number of exports
      // This helps catch accidental removal of exports
      const exportCount = Object.keys(sdk).length
      expect(exportCount).toBeGreaterThan(40)
    })

    it('should not export internal implementation details', () => {
      // Internal helpers should not be exported
      expect((sdk as Record<string, unknown>).validateCapnwebModule).toBeUndefined()
      expect((sdk as Record<string, unknown>).isRpcStubWithCallbacks).toBeUndefined()
    })
  })
})

// ============================================================================
// Type-level Tests (verified at compile time)
// ============================================================================

// These imports should compile without errors
import type {
  // Message types
  SDKMessage,
  SDKResultMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKSystemMessage,
  SDKPartialMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ToolResultBlock,
  ModelInfo,
  McpServerStatus,

  // Event types
  TodoUpdate,
  PlanUpdate,
  ToolUseEvent,
  ToolResultEvent,
  TodoItem,
  TodoStatus,
  OutputEvent,
  SessionCreatedEvent,
  SessionStatusEvent,
  SessionDestroyedEvent,

  // Options types
  ClaudeCodeOptions,
  ClaudeSession,
  ClaudeClientOptions,
  StreamCallbackHandlers,
  PermissionMode,
  SessionStatus,

  // Server types
  ClaudeServer,
  Runtime,
  RuntimeProcess,
  ExecResult,
  ExecOptions,
  ProcessOptions,
  CloudflareRuntime,
  CloudflareProcess,
  CloudflareNamespace,
  Sandbox,
  SandboxProcess,
  SandboxNamespace,

  // RPC types
  RpcStub,
  RpcPromise,
  RpcSessionOptions,
  RpcSessionState,
  ClaudeSandboxRpc,
  IClaudeCodeRpc,
  IClaudeCodeRpcWithCallbacks,
  IStreamCallbacks,
  SessionInfo,
  QueryResult,
  ErrorCode,

  // Terminal types
  XtermInput,
  XtermOutput,
  TerminalProxyOptions,
  ConnectionStateCallback,

  // Middleware types
  JwtAlgorithm,
  JwtConfig,
  RateLimitConfig,
  RateLimitStorage,
  ApiKeyValidator,
  ApiKeyValidationResult,
  JwtValidationResult,
  AuthConfig,
  AuthResult,
  RateLimitResult,
  NextFunction,

  // Client types
  ReconnectionOptions,

  // Guard types
  TodoWriteInput,
  ExitPlanModeInput,
  WriteToolInput,

  // Legacy types
  Session,
  Message,
  MessageRole,
  FileNode,
  FileContent,
  FileDiff,
  DiffHunk,
  SessionDiff,
  SearchResult,
  EventType,
  StreamEvent,
  ClaudeConfig,
  ServerConfig,
  ApiError,
} from './index.js'

// Type assertion tests - these compile only if types are properly exported
const _typeCheck = {
  // Verify types are assignable
  message: null as unknown as SDKMessage,
  result: null as unknown as SDKResultMessage,
  assistantMessage: null as unknown as SDKAssistantMessage,
  userMessage: null as unknown as SDKUserMessage,
  systemMessage: null as unknown as SDKSystemMessage,
  partialMessage: null as unknown as SDKPartialMessage,
  textBlock: null as unknown as TextBlock,
  toolUseBlock: null as unknown as ToolUseBlock,
  toolResultBlock: null as unknown as ToolResultBlock,
  todoUpdate: null as unknown as TodoUpdate,
  planUpdate: null as unknown as PlanUpdate,
  todoItem: null as unknown as TodoItem,
  todoStatus: null as unknown as TodoStatus,
  session: null as unknown as ClaudeSession,
  runtime: null as unknown as Runtime,
  execResult: null as unknown as ExecResult,
  cloudflareRuntime: null as unknown as CloudflareRuntime,
  sandbox: null as unknown as Sandbox,
  rpcStub: null as unknown as RpcStub<IClaudeCodeRpc>,
  rpcPromise: null as unknown as RpcPromise<string>,
  rpcState: null as unknown as RpcSessionState,
  todoWriteInput: null as unknown as TodoWriteInput,
  exitPlanModeInput: null as unknown as ExitPlanModeInput,
  writeToolInput: null as unknown as WriteToolInput,
}

// Ensure the type check object is used (prevents unused variable warning)
void _typeCheck
