/**
 * Node.js Runtime Implementation
 *
 * Implements the Runtime interface for local Node.js execution using
 * the child_process module.
 */

import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type {
  Runtime,
  ExecResult,
  ExecOptions,
  ProcessOptions,
  RuntimeProcess,
} from '../types/runtime.js'

const execAsync = promisify(execCallback)

/**
 * Node.js runtime implementation using child_process
 *
 * Provides execution capabilities using Node.js native modules.
 *
 * @example
 * ```typescript
 * const runtime = new NodeRuntime()
 *
 * // Execute a command
 * const result = await runtime.exec('ls -la')
 * console.log(result.stdout)
 *
 * // Execute with timeout
 * const result2 = await runtime.exec('npm install', { timeout: 60000 })
 *
 * // Execute with custom environment
 * const result3 = await runtime.exec('echo $MY_VAR', {
 *   env: { MY_VAR: 'hello' }
 * })
 * ```
 */
export class NodeRuntime implements Runtime {
  /**
   * Execute a command and wait for it to complete
   *
   * Uses Node.js child_process.exec under the hood. Commands are executed
   * in a shell, so shell syntax (pipes, redirects, etc.) is supported.
   *
   * @param command - The command to execute (supports shell syntax)
   * @param options - Optional execution options
   * @returns Promise resolving to ExecResult with exitCode, stdout, and stderr
   *
   * @example
   * ```typescript
   * const result = await runtime.exec('echo "hello world"')
   * if (result.exitCode === 0) {
   *   console.log(result.stdout) // "hello world\n"
   * }
   * ```
   */
  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    try {
      const execOptions: Parameters<typeof execAsync>[1] = {
        // Merge custom env with process.env
        env: options?.env ? { ...process.env, ...options.env } : process.env,
        timeout: options?.timeout,
        shell: '/bin/bash',
      }

      const { stdout, stderr } = await execAsync(command, execOptions)

      return {
        exitCode: 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      }
    } catch (error) {
      // exec throws on non-zero exit code or timeout
      const execError = error as NodeJS.ErrnoException & {
        code?: number | string
        killed?: boolean
        stdout?: string | Buffer
        stderr?: string | Buffer
      }

      // Normalize exit code
      let exitCode: number

      if (execError.killed) {
        // Process was killed (timeout)
        exitCode = 124 // Standard timeout exit code
      } else if (typeof execError.code === 'number') {
        exitCode = execError.code
      } else {
        // Default to 1 for generic errors
        exitCode = 1
      }

      return {
        exitCode,
        stdout: execError.stdout?.toString() ?? '',
        stderr: execError.stderr?.toString() ?? '',
      }
    }
  }

  /**
   * Start a long-running process
   *
   * @param command - The command to start
   * @param options - Optional process options
   * @returns Promise resolving to a RuntimeProcess handle
   */
  async startProcess(
    command: string,
    options?: ProcessOptions
  ): Promise<RuntimeProcess> {
    const child = spawn(command, [], {
      shell: true,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
    })

    const id = randomUUID()

    // Convert Node streams to Web ReadableStreams
    const stdout = Readable.toWeb(child.stdout!) as unknown as ReadableStream<Uint8Array>
    const stderr = Readable.toWeb(child.stderr!) as unknown as ReadableStream<Uint8Array>

    const exited = new Promise<number>((resolve) => {
      child.on('exit', (code) => {
        resolve(code ?? 0)
      })
      child.on('error', () => {
        resolve(1)
      })
    })

    return {
      id,
      stdout,
      stderr,
      exited,
      kill: async () => {
        child.kill()
      },
      write: async (data: string | Uint8Array) => {
        if (child.stdin) {
          child.stdin.write(data)
        }
      },
    }
  }

  /**
   * Read content from a file
   *
   * @param path - Path to the file to read
   * @returns Promise resolving to the file contents as a string
   */
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8')
  }

  /**
   * Write content to a file
   *
   * Creates parent directories automatically if they don't exist.
   *
   * @param filePath - Path to the file to write
   * @param content - Content to write (string or binary data)
   * @returns Promise resolving when the write is complete
   *
   * @example
   * ```typescript
   * // Writing to nested path creates directories
   * await runtime.writeFile('/tmp/nested/deeply/file.txt', 'content')
   *
   * // Writing binary data
   * await runtime.writeFile('/tmp/data.bin', new Uint8Array([1, 2, 3]))
   * ```
   */
  async writeFile(filePath: string, content: string | Uint8Array): Promise<void> {
    // Ensure parent directory exists
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    await fs.writeFile(filePath, content)
  }
}
