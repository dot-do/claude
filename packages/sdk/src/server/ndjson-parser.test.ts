/**
 * @dotdo/claude - NDJSON Parser Tests
 *
 * TDD-07: NDJSON Schema Validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NDJSONParser } from './ndjson-parser'

// ============================================================================
// Schema Validation Tests (TDD: RED phase)
// ============================================================================

describe('NDJSONParser schema validation before cast', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  describe('assistant message schema', () => {
    it('rejects assistant message without session_id', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'assistant',
        uuid: 'test-uuid',
        message: { role: 'assistant', content: [] }
        // Missing session_id
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects assistant message without message object', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session'
        // Missing message object
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects assistant message with wrong role', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: { role: 'user', content: [] } // Wrong role
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects assistant message with non-array content', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: { role: 'assistant', content: 'not an array' }
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('accepts valid assistant message with full schema', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'assistant',
        uuid: 'test-uuid',
        session_id: 'test-session',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        parent_tool_use_id: null
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('assistant')
    })
  })

  describe('user message schema', () => {
    it('rejects user message without session_id', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'test' }
        // Missing session_id
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects user message with wrong role', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'user',
        session_id: 'test-session',
        message: { role: 'assistant', content: 'test' } // Wrong role
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('accepts user message with string content', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'user',
        session_id: 'test-session',
        message: { role: 'user', content: 'Hello' },
        parent_tool_use_id: null
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('user')
    })

    it('accepts user message with array content', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'user',
        session_id: 'test-session',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'id', content: 'result' }] },
        parent_tool_use_id: null
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('user')
    })
  })

  describe('system message schema', () => {
    it('rejects system message without session_id', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'system',
        subtype: 'init'
        // Missing session_id
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects system message with invalid subtype', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'system',
        subtype: 'invalid_subtype',
        session_id: 'test-session'
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('accepts valid system init message', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'system',
        subtype: 'init',
        uuid: 'test-uuid',
        session_id: 'test-session',
        cwd: '/test',
        tools: [],
        model: 'claude-3',
        permissionMode: 'default'
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('system')
    })

    it('accepts valid system compact_boundary message', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'test-uuid',
        session_id: 'test-session',
        compact_metadata: { trigger: 'manual', pre_tokens: 1000 }
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('system')
    })
  })

  describe('result message schema', () => {
    it('rejects result message without session_id', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'result',
        subtype: 'success',
        usage: { input_tokens: 0, output_tokens: 0 }
        // Missing session_id
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects result message with invalid subtype', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'result',
        subtype: 'invalid_subtype',
        session_id: 'test-session',
        usage: { input_tokens: 0, output_tokens: 0 }
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('rejects result message without usage object', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'result',
        subtype: 'success',
        session_id: 'test-session'
        // Missing usage
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('accepts valid result message', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'result',
        subtype: 'success',
        uuid: 'test-uuid',
        session_id: 'test-session',
        usage: { input_tokens: 100, output_tokens: 50 },
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        total_cost_usd: 0.01
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('result')
    })

    it('accepts result message with error subtype', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'result',
        subtype: 'error_max_turns',
        uuid: 'test-uuid',
        session_id: 'test-session',
        usage: { input_tokens: 100, output_tokens: 50 },
        is_error: true
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('result')
    })
  })

  describe('stream_event message schema', () => {
    it('rejects stream_event message without session_id', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta' }
        // Missing session_id
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toEqual([])
      expect(warnSpy).toHaveBeenCalled()
    })

    it('accepts valid stream_event message', () => {
      const parser = new NDJSONParser()
      const msg = JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta' },
        uuid: 'test-uuid',
        session_id: 'test-session',
        parent_tool_use_id: null
      }) + '\n'

      const result = parser.parse(msg)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('stream_event')
    })
  })
})

// ============================================================================
// Original Tests
// ============================================================================

describe('NDJSONParser validation', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('returns empty array for malformed JSON', () => {
    const parser = new NDJSONParser()

    const result = parser.parse('not json\n')

    expect(result).toEqual([]) // No message emitted for invalid JSON
  })

  it('handles unknown message types gracefully', () => {
    const parser = new NDJSONParser()

    const result = parser.parse('{"type": "unknown_weird_type"}\n')

    // Should warn but not crash, and NOT return the message
    expect(warnSpy).toHaveBeenCalledWith('Unknown message type: unknown_weird_type')
    expect(result).toEqual([])
  })

  it('parses valid assistant message', () => {
    const parser = new NDJSONParser()

    const validMsg = JSON.stringify({
      type: 'assistant',
      session_id: 'test-session',
      message: { role: 'assistant', content: [] }
    }) + '\n'

    const result = parser.parse(validMsg)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('assistant')
  })

  it('parses valid result message', () => {
    const parser = new NDJSONParser()

    const validMsg = JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: 'test-session',
      usage: { input_tokens: 0, output_tokens: 0 }
    }) + '\n'

    const result = parser.parse(validMsg)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('result')
  })

  it('parses valid system message', () => {
    const parser = new NDJSONParser()

    const validMsg = JSON.stringify({
      type: 'system',
      subtype: 'init',
      session_id: 'test-session'
    }) + '\n'

    const result = parser.parse(validMsg)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('system')
  })

  it('parses valid user message', () => {
    const parser = new NDJSONParser()

    const validMsg = JSON.stringify({
      type: 'user',
      session_id: 'test-session',
      message: { role: 'user', content: 'test' }
    }) + '\n'

    const result = parser.parse(validMsg)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('user')
  })

  it('parses valid stream_event message', () => {
    const parser = new NDJSONParser()

    const validMsg = JSON.stringify({
      type: 'stream_event',
      session_id: 'test-session',
      event: 'content_block_delta'
    }) + '\n'

    const result = parser.parse(validMsg)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('stream_event')
  })

  it('returns null for object without type field', () => {
    const parser = new NDJSONParser()

    const result = parser.parse('{"foo": "bar"}\n')

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith('Message missing type field:', { foo: 'bar' })
  })

  it('returns null for non-object JSON', () => {
    const parser = new NDJSONParser()

    const result = parser.parse('"just a string"\n')

    expect(result).toEqual([])
  })

  it('handles multiple lines with mixed valid and invalid', () => {
    const parser = new NDJSONParser()

    const mixedInput = [
      '{"type": "system", "subtype": "init", "session_id": "test-session"}',
      'invalid json',
      '{"type": "unknown_type"}',
      '{"type": "result", "subtype": "success", "session_id": "test-session", "usage": {"input_tokens": 0, "output_tokens": 0}}',
      '{"no_type": true}'
    ].join('\n') + '\n'

    const result = parser.parse(mixedInput)

    // Should only return valid messages (system and result)
    expect(result).toHaveLength(2)
    expect(result[0].type).toBe('system')
    expect(result[1].type).toBe('result')
  })
})
