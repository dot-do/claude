/**
 * Tests for module and interface validation utilities
 *
 * These replace unsafe 'as unknown as' type assertions with proper runtime validation.
 */

import { describe, it, expect } from 'vitest'
import {
  isCapnwebModule,
  isRpcStubWithCallbacks,
  isSandboxNamespace,
  validateCapnwebModule,
  validateRpcStubWithCallbacks,
  validateSandboxNamespace,
  type CapnwebModule,
  type SandboxNamespace,
} from './module-validation.js'

describe('isCapnwebModule', () => {
  it('returns true for valid capnweb module', () => {
    const validModule = {
      newHttpBatchRpcSession: () => ({}),
      newWebSocketRpcSession: () => ({}),
    }
    expect(isCapnwebModule(validModule)).toBe(true)
  })

  it('returns false when newHttpBatchRpcSession is missing', () => {
    const invalidModule = {
      newWebSocketRpcSession: () => ({}),
    }
    expect(isCapnwebModule(invalidModule)).toBe(false)
  })

  it('returns false when newWebSocketRpcSession is missing', () => {
    const invalidModule = {
      newHttpBatchRpcSession: () => ({}),
    }
    expect(isCapnwebModule(invalidModule)).toBe(false)
  })

  it('returns false when functions are not actually functions', () => {
    const invalidModule = {
      newHttpBatchRpcSession: 'not a function',
      newWebSocketRpcSession: 123,
    }
    expect(isCapnwebModule(invalidModule)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isCapnwebModule(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isCapnwebModule(undefined)).toBe(false)
  })

  it('returns false for non-object types', () => {
    expect(isCapnwebModule('string')).toBe(false)
    expect(isCapnwebModule(123)).toBe(false)
    expect(isCapnwebModule(true)).toBe(false)
  })
})

describe('validateCapnwebModule', () => {
  it('returns the module when valid', () => {
    const validModule = {
      newHttpBatchRpcSession: () => ({}),
      newWebSocketRpcSession: () => ({}),
    }
    const result = validateCapnwebModule(validModule)
    expect(result).toBe(validModule)
  })

  it('throws when module is invalid', () => {
    const invalidModule = { foo: 'bar' }
    expect(() => validateCapnwebModule(invalidModule)).toThrow(
      'Invalid capnweb module: missing required functions'
    )
  })

  it('throws with descriptive message for null', () => {
    expect(() => validateCapnwebModule(null)).toThrow(
      'Invalid capnweb module: missing required functions'
    )
  })
})

describe('isRpcStubWithCallbacks', () => {
  it('returns true for stub with sendMessageWithCallbacks', () => {
    const validStub = {
      createSession: () => Promise.resolve({}),
      sendMessageWithCallbacks: () => Promise.resolve(),
    }
    expect(isRpcStubWithCallbacks(validStub)).toBe(true)
  })

  it('returns false when sendMessageWithCallbacks is missing', () => {
    const invalidStub = {
      createSession: () => Promise.resolve({}),
      sendMessage: () => Promise.resolve(),
    }
    expect(isRpcStubWithCallbacks(invalidStub)).toBe(false)
  })

  it('returns false when sendMessageWithCallbacks is not a function', () => {
    const invalidStub = {
      sendMessageWithCallbacks: 'not a function',
    }
    expect(isRpcStubWithCallbacks(invalidStub)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isRpcStubWithCallbacks(null)).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(isRpcStubWithCallbacks('string')).toBe(false)
    expect(isRpcStubWithCallbacks(123)).toBe(false)
  })
})

describe('validateRpcStubWithCallbacks', () => {
  it('returns the stub when valid', () => {
    const validStub = {
      sendMessageWithCallbacks: () => Promise.resolve(),
    }
    const result = validateRpcStubWithCallbacks(validStub)
    expect(result).toBe(validStub)
  })

  it('throws when stub lacks sendMessageWithCallbacks', () => {
    const invalidStub = { sendMessage: () => {} }
    expect(() => validateRpcStubWithCallbacks(invalidStub)).toThrow(
      'RPC stub does not support callbacks: sendMessageWithCallbacks method not found'
    )
  })
})

describe('isSandboxNamespace', () => {
  it('returns true for valid sandbox namespace', () => {
    const validNamespace = {
      get: () => Promise.resolve({}),
    }
    expect(isSandboxNamespace(validNamespace)).toBe(true)
  })

  it('returns true when additional methods are present', () => {
    const validNamespace = {
      get: () => Promise.resolve({}),
      idFromName: () => ({}),
    }
    expect(isSandboxNamespace(validNamespace)).toBe(true)
  })

  it('returns false when get is missing', () => {
    const invalidNamespace = {
      idFromName: () => ({}),
    }
    expect(isSandboxNamespace(invalidNamespace)).toBe(false)
  })

  it('returns false when get is not a function', () => {
    const invalidNamespace = {
      get: 'not a function',
    }
    expect(isSandboxNamespace(invalidNamespace)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isSandboxNamespace(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSandboxNamespace(undefined)).toBe(false)
  })
})

describe('validateSandboxNamespace', () => {
  it('returns the namespace when valid', () => {
    const validNamespace = {
      get: () => Promise.resolve({}),
    }
    const result = validateSandboxNamespace(validNamespace)
    expect(result).toBe(validNamespace)
  })

  it('throws when namespace is invalid', () => {
    const invalidNamespace = { foo: 'bar' }
    expect(() => validateSandboxNamespace(invalidNamespace)).toThrow(
      'Invalid sandbox namespace: missing required method (get)'
    )
  })
})
