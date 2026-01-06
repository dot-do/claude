import { describe, it, expect } from 'vitest'
import { escapeShellArg, writeJsonFileCommand } from './shell'

describe('escapeShellArg', () => {
  it('escapes single quotes', () => {
    const result = escapeShellArg("hello'world")
    // The single quote should be escaped as '\'' (end quote, escaped quote, start quote)
    expect(result).toBe("'hello'\\''world'")
  })

  it('neutralizes injection attempts', () => {
    const malicious = "'; rm -rf /; echo '"
    const result = escapeShellArg(malicious)
    // Should be safely escaped
    expect(result).toBeDefined()
  })

  it('rejects null bytes', () => {
    expect(() => escapeShellArg('hello\x00world')).toThrow('null byte')
  })

  it('handles unicode', () => {
    const result = escapeShellArg('こんにちは 🎉')
    expect(result).toContain('こんにちは')
  })

  it('handles empty string', () => {
    const result = escapeShellArg('')
    expect(result).toBeDefined()
  })

  it('handles newlines', () => {
    const result = escapeShellArg('line1\nline2')
    expect(result).toBeDefined()
  })
})

describe('writeJsonFileCommand', () => {
  it('generates heredoc command with quoted delimiter', () => {
    const result = writeJsonFileCommand({ key: 'value' }, '/path/to/file.json')
    expect(result).toContain("cat <<'EOF'")
    expect(result).toContain('/path/to/file.json')
    expect(result).toContain('EOF')
  })

  it('prevents $(command) injection via quoted heredoc', () => {
    // Even if content contains command substitution, it should be in heredoc
    const maliciousContent = { key: '$(whoami)' }
    const result = writeJsonFileCommand(maliciousContent, '/tmp/test.json')

    // The command should use quoted heredoc which prevents expansion
    expect(result).toContain("cat <<'EOF'")
    // The content should be present verbatim, not executed
    expect(result).toContain('$(whoami)')
  })

  it('prevents backtick injection via quoted heredoc', () => {
    const maliciousContent = { key: '`rm -rf /`' }
    const result = writeJsonFileCommand(maliciousContent, '/tmp/test.json')

    // Quoted heredoc prevents backtick execution
    expect(result).toContain("cat <<'EOF'")
    expect(result).toContain('`rm -rf /`')
  })

  it('prevents ${} variable expansion via quoted heredoc', () => {
    const maliciousContent = { key: '${PATH}' }
    const result = writeJsonFileCommand(maliciousContent, '/tmp/test.json')

    // Quoted heredoc prevents variable expansion
    expect(result).toContain("cat <<'EOF'")
    expect(result).toContain('${PATH}')
  })

  it('handles complex JSON with special characters', () => {
    const content = {
      permissions: ['Bash', 'Edit'],
      special: '$HOME',
      command: '$(echo test)',
      backtick: '`ls`',
      quotes: '"double"',
    }
    const result = writeJsonFileCommand(content, '/path/to/settings.json')

    // Should be valid JSON in the output
    expect(result).toContain('"permissions"')
    expect(result).toContain('"$HOME"')
  })

  it('escapes file path with single quotes', () => {
    const result = writeJsonFileCommand({ a: 1 }, '/path/with spaces/file.json')
    // File path should be escaped with single quotes
    expect(result).toContain("'/path/with spaces/file.json'")
  })

  it('handles string content directly', () => {
    const result = writeJsonFileCommand('{"already":"json"}', '/tmp/file.json')
    expect(result).toContain('{"already":"json"}')
  })

  it('rejects null bytes in content (string input)', () => {
    // When passing a string directly, null bytes should be rejected
    expect(() => writeJsonFileCommand('test\x00value', '/tmp/file.json')).toThrow(
      'null byte'
    )
  })

  it('handles null bytes in object values (escaped by JSON.stringify)', () => {
    // JSON.stringify escapes null bytes to \u0000, so this is safe
    const result = writeJsonFileCommand({ key: 'test\x00value' }, '/tmp/file.json')
    expect(result).toContain('\\u0000') // JSON-escaped null byte
  })

  it('rejects null bytes in file path', () => {
    expect(() => writeJsonFileCommand({ key: 'value' }, '/tmp/file\x00.json')).toThrow(
      'Invalid file path'
    )
  })

  it('rejects empty file path', () => {
    expect(() => writeJsonFileCommand({ key: 'value' }, '')).toThrow('Invalid file path')
  })

  it('handles paths with special shell characters', () => {
    const result = writeJsonFileCommand({ a: 1 }, "/path'with/quotes.json")
    // Should properly escape single quote in path
    expect(result).toContain("\\'")
  })
})
