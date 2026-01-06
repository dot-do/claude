/**
 * Safely escape a string for use in shell commands.
 * Uses single-quote escaping which is the safest approach.
 */
export function escapeShellArg(arg: string): string {
  if (arg.includes('\x00')) {
    throw new Error('Invalid input: null byte not allowed')
  }
  // Single-quote the entire string, escaping any single quotes within
  // 'foo' becomes 'foo'
  // foo'bar becomes 'foo'\''bar'
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

/**
 * Generate a shell command to safely write JSON content to a file.
 * Uses heredoc with quoted delimiter to prevent any shell expansion/injection.
 *
 * The quoted delimiter ('EOF') ensures:
 * - No variable expansion ($var, ${var})
 * - No command substitution ($(cmd), `cmd`)
 * - No special character interpretation
 *
 * @param content - The JSON content to write (will be stringified if object)
 * @param filePath - The target file path
 * @returns A safe shell command string
 */
export function writeJsonFileCommand(content: unknown, filePath: string): string {
  const jsonString = typeof content === 'string' ? content : JSON.stringify(content)

  // Validate no null bytes in content
  if (jsonString.includes('\x00')) {
    throw new Error('Invalid content: null byte not allowed')
  }

  // Validate file path - basic sanity check
  if (!filePath || filePath.includes('\x00')) {
    throw new Error('Invalid file path')
  }

  // Use heredoc with quoted delimiter 'EOF' - this prevents ALL shell expansion
  // Including: $(), ``, ${}, $var, etc.
  return `cat <<'EOF' > ${escapeShellArg(filePath)}
${jsonString}
EOF`
}
