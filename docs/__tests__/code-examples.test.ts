import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const DOCS_DIR = path.join(__dirname, '..')

/**
 * Recursively find all MDX files in a directory
 */
function findMdxFiles(dir: string): string[] {
  const files: string[] = []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '__tests__') {
      files.push(...findMdxFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Regex to match TypeScript code blocks in MDX files
 * Matches ```typescript or ```ts with optional metadata (like title="...")
 */
const CODE_BLOCK_REGEX = /```(?:typescript|ts)(?:\s+[^\n]*)?\n([\s\S]*?)```/g

interface CodeBlock {
  file: string
  code: string
  index: number
}

/**
 * Extract all TypeScript code blocks from MDX content
 */
function extractCodeBlocks(content: string, filePath: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  let match: RegExpExecArray | null
  let index = 0

  // Reset regex state
  CODE_BLOCK_REGEX.lastIndex = 0

  while ((match = CODE_BLOCK_REGEX.exec(content)) !== null) {
    blocks.push({
      file: filePath,
      code: match[1],
      index: index++,
    })
  }

  return blocks
}

/**
 * Create a temporary tsconfig for syntax-only validation
 */
function createTempTsConfig(tempDir: string, files: string[]): string {
  const tsconfigPath = path.join(tempDir, 'tsconfig.json')
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      skipLibCheck: true,
      noEmit: true,
      // Don't report errors for missing modules
      noResolve: true,
      // Type checking flags - be lenient for docs
      strict: false,
      noImplicitAny: false,
      // Treat files independently
      isolatedModules: true,
    },
    files: files,
  }
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2))
  return tsconfigPath
}

/**
 * Filter out module resolution errors (TS2307) since doc examples may import non-existent modules
 */
function filterModuleErrors(errorOutput: string): string {
  return errorOutput
    .split('\n')
    .filter((line) => !line.includes('TS2307')) // Cannot find module
    .filter((line) => !line.includes('TS2304')) // Cannot find name (for unimported types)
    .filter((line) => !line.includes('TS1208')) // All files must be modules (isolatedModules)
    .join('\n')
    .trim()
}

/**
 * Write code to a temp file and run tsc --noEmit to validate syntax
 */
function validateTypeScriptSyntax(code: string, tempDir: string, index: number): { valid: boolean; error?: string } {
  const tempFile = path.join(tempDir, `code-block-${index}.ts`)

  try {
    fs.writeFileSync(tempFile, code, 'utf-8')

    // Create tsconfig for syntax checking with the file included
    const tsconfigPath = createTempTsConfig(tempDir, [tempFile])

    // Run tsc with the custom tsconfig
    execSync(`npx tsc --project "${tsconfigPath}"`, {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    return { valid: true }
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message?: string }
    // tsc outputs errors to stdout, not stderr
    const rawError = execError.stdout || execError.stderr || execError.message || 'Unknown error'

    // Filter out module resolution errors since doc examples may reference external packages
    const filteredError = filterModuleErrors(rawError)

    if (!filteredError) {
      // Only module resolution errors, which we ignore
      return { valid: true }
    }

    return {
      valid: false,
      error: filteredError,
    }
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile)
    } catch {
      // Ignore cleanup errors
    }
  }
}

describe('Documentation Code Example Validation', () => {
  let tempDir: string
  let mdxFiles: string[]
  let allCodeBlocks: CodeBlock[]

  beforeAll(() => {
    // Create temp directory for validation
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-code-validation-'))

    // Find all MDX files in docs directory
    mdxFiles = findMdxFiles(DOCS_DIR)

    // Extract all code blocks from all files
    allCodeBlocks = []
    for (const file of mdxFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const blocks = extractCodeBlocks(content, file)
      allCodeBlocks.push(...blocks)
    }
  })

  afterAll(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should find MDX files in docs directory', () => {
    expect(mdxFiles.length).toBeGreaterThan(0)
  })

  it('should extract TypeScript code blocks from MDX files', () => {
    // This test passes even if there are no code blocks (some docs may not have code)
    expect(allCodeBlocks).toBeDefined()
    expect(Array.isArray(allCodeBlocks)).toBe(true)
  })

  it('should have syntactically valid TypeScript in all code blocks', () => {
    if (allCodeBlocks.length === 0) {
      // Skip if no code blocks found
      return
    }

    const errors: { file: string; index: number; error: string }[] = []

    for (const block of allCodeBlocks) {
      const result = validateTypeScriptSyntax(block.code, tempDir, block.index)
      if (!result.valid) {
        errors.push({
          file: path.relative(DOCS_DIR, block.file),
          index: block.index,
          error: result.error || 'Unknown error',
        })
      }
    }

    if (errors.length > 0) {
      const errorMessage = errors
        .map((e) => `\n  - ${e.file} (block ${e.index + 1}):\n    ${e.error.split('\n').join('\n    ')}`)
        .join('')

      expect.fail(`Found ${errors.length} TypeScript syntax error(s):${errorMessage}`)
    }
  })

  // Generate individual tests per file for better reporting
  describe('Per-file validation', () => {
    it.each(
      // Use a getter pattern to ensure files are loaded
      (() => {
        const files = findMdxFiles(DOCS_DIR)
        return files.map((file) => [path.relative(DOCS_DIR, file), file])
      })()
    )('validates code blocks in %s', (relativePath, absolutePath) => {
      const content = fs.readFileSync(absolutePath, 'utf-8')
      const blocks = extractCodeBlocks(content, absolutePath)

      if (blocks.length === 0) {
        // No TypeScript code blocks in this file - that's ok
        return
      }

      const localTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-code-'))

      try {
        const errors: { index: number; error: string }[] = []

        for (const block of blocks) {
          const result = validateTypeScriptSyntax(block.code, localTempDir, block.index)
          if (!result.valid) {
            errors.push({
              index: block.index,
              error: result.error || 'Unknown error',
            })
          }
        }

        if (errors.length > 0) {
          const errorMessage = errors
            .map((e) => `\n  Block ${e.index + 1}:\n    ${e.error.split('\n').join('\n    ')}`)
            .join('')

          expect.fail(`Found ${errors.length} TypeScript syntax error(s) in ${relativePath}:${errorMessage}`)
        }
      } finally {
        fs.rmSync(localTempDir, { recursive: true, force: true })
      }
    })
  })
})
