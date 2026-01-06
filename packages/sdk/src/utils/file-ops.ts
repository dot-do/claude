/**
 * File Operations API
 *
 * Simple file operations for the ClaudeCode SDK.
 */

import {
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
  readdir,
  mkdir,
} from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Read the contents of a file as a UTF-8 string.
 *
 * @param path - The path to the file to read
 * @returns The file contents as a string
 * @throws Error if the file does not exist or cannot be read
 *
 * @example
 * ```typescript
 * const content = await readFile('/path/to/file.txt')
 * console.log(content)
 * ```
 */
export async function readFile(path: string): Promise<string> {
  return nodeReadFile(path, 'utf-8')
}

/**
 * Write content to a file, creating parent directories if needed.
 *
 * @param path - The path to the file to write
 * @param content - The content to write to the file
 * @throws Error if the file cannot be written
 *
 * @example
 * ```typescript
 * await writeFile('/path/to/file.txt', 'Hello, World!')
 * ```
 */
export async function writeFile(path: string, content: string): Promise<void> {
  // Ensure parent directory exists
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })

  await nodeWriteFile(path, content, 'utf-8')
}

/**
 * List files in a directory.
 *
 * Returns a sorted array of file and directory names (not full paths).
 * Hidden files (starting with '.') are excluded by default.
 *
 * @param path - The path to the directory to list
 * @returns An array of file and directory names, sorted alphabetically
 * @throws Error if the directory does not exist or cannot be read
 *
 * @example
 * ```typescript
 * const files = await listFiles('/path/to/directory')
 * console.log(files) // ['file1.txt', 'file2.txt', 'subdir']
 * ```
 */
export async function listFiles(path: string): Promise<string[]> {
  const entries = await readdir(path)

  // Filter out hidden files and sort
  return entries.filter((name) => !name.startsWith('.')).sort()
}
