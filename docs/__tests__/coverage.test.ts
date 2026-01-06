import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const DOCS_DIR = path.join(__dirname, '..')
const PACKAGES_DIR = path.join(__dirname, '..', '..', 'packages')

/**
 * Recursively find all files matching an extension
 */
function findFiles(dir: string, extension: string): string[] {
  const files: string[] = []

  if (!fs.existsSync(dir)) {
    return files
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...findFiles(fullPath, extension))
    } else if (entry.name.endsWith(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

/**
 * Extract export names from TypeScript source files
 * Handles: export { X }, export { type X }, export const X, export type X, export interface X, export function X, export class X
 */
function extractExports(filePath: string): { values: string[]; types: string[] } {
  const content = fs.readFileSync(filePath, 'utf-8')
  const values: string[] = []
  const types: string[] = []

  // Match "export { X, Y, Z }" or "export { X as Y }" (NOT "export type { ... }")
  // This also handles inline type exports like "export { Terminal, type TerminalProps }"
  const namedExportRegex = /export\s*\{([^}]+)\}/g
  let match: RegExpExecArray | null
  while ((match = namedExportRegex.exec(content)) !== null) {
    // Check if this is "export type { ... }" - skip, handled separately
    const beforeBrace = content.slice(Math.max(0, match.index - 10), match.index + 6)
    if (beforeBrace.includes('export type')) {
      continue
    }

    const exports = match[1].split(',').map((e) => e.trim()).filter(Boolean)
    for (const exp of exports) {
      // Handle "type X" or "type X as Y" (inline type export)
      if (exp.startsWith('type ')) {
        const typeExp = exp.slice(5).trim()
        const asMatch = typeExp.match(/(\w+)\s+as\s+(\w+)/)
        types.push(asMatch ? asMatch[2] : typeExp.split(/\s/)[0])
      } else {
        // Handle "X as Y" - use the exported name (Y)
        const asMatch = exp.match(/(\w+)\s+as\s+(\w+)/)
        values.push(asMatch ? asMatch[2] : exp.split(/\s/)[0])
      }
    }
  }

  // Match "export type { X, Y }"
  const typeExportRegex = /export\s+type\s*\{([^}]+)\}/g
  while ((match = typeExportRegex.exec(content)) !== null) {
    const exports = match[1].split(',').map((e) => {
      const trimmed = e.trim()
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/)
      return asMatch ? asMatch[2] : trimmed.split(/\s/)[0]
    }).filter(Boolean)
    types.push(...exports)
  }

  // Match "export const X", "export function X", "export class X"
  const directExportRegex = /export\s+(const|let|var|function|class)\s+(\w+)/g
  while ((match = directExportRegex.exec(content)) !== null) {
    values.push(match[2])
  }

  // Match "export type X" or "export interface X"
  const typeDefRegex = /export\s+(type|interface)\s+(\w+)/g
  while ((match = typeDefRegex.exec(content)) !== null) {
    // Skip "export type { ... }" which is handled above
    if (!match[0].includes('{')) {
      types.push(match[2])
    }
  }

  return {
    values: [...new Set(values)],
    types: [...new Set(types)],
  }
}

/**
 * Get all MDX files in the docs directory
 */
function getMdxFiles(): string[] {
  return findFiles(DOCS_DIR, '.mdx')
}

/**
 * Get all documentation content concatenated
 */
function getAllDocsContent(): string {
  const mdxFiles = getMdxFiles()
  return mdxFiles.map((file) => fs.readFileSync(file, 'utf-8')).join('\n')
}

/**
 * Check if an export name appears in documentation
 */
function isDocumented(name: string, docsContent: string): boolean {
  // Check for various documentation patterns:
  // - Direct mention: `ClaudeClient`
  // - Code blocks: ClaudeClient
  // - Headings: ## ClaudeClient
  // - Tables: | ClaudeClient |
  // - Import statements in examples: import { ClaudeClient }
  const patterns = [
    new RegExp(`\`${name}\``, 'g'),           // Inline code
    new RegExp(`\\b${name}\\b`, 'g'),         // Word boundary match
    new RegExp(`import\\s*{[^}]*\\b${name}\\b`, 'g'),  // Import statement
  ]

  return patterns.some((pattern) => pattern.test(docsContent))
}

describe('Documentation Export Coverage', () => {
  const docsContent = getAllDocsContent()

  describe('@dotdo/claude (packages/sdk/src/index.ts)', () => {
    const sdkIndexPath = path.join(PACKAGES_DIR, 'sdk', 'src', 'index.ts')

    it('should have SDK index file', () => {
      expect(fs.existsSync(sdkIndexPath)).toBe(true)
    })

    const sdkExports = extractExports(sdkIndexPath)

    describe('value exports', () => {
      // Filter out internal/implementation exports that may not need documentation
      const publicExports = sdkExports.values.filter((name) => {
        // Keep all exports for now - can add exclusions if needed
        return true
      })

      it('should have value exports', () => {
        expect(publicExports.length).toBeGreaterThan(0)
      })

      for (const exportName of publicExports) {
        it(`"${exportName}" should be documented`, () => {
          const documented = isDocumented(exportName, docsContent)
          if (!documented) {
            expect.fail(
              `Export "${exportName}" from @dotdo/claude is not documented.\n` +
              `Add documentation in docs/ directory (e.g., docs/sdk/*.mdx or docs/reference/types.mdx)`
            )
          }
          expect(documented).toBe(true)
        })
      }
    })

    describe('type exports', () => {
      it('should have type exports', () => {
        expect(sdkExports.types.length).toBeGreaterThan(0)
      })

      for (const typeName of sdkExports.types) {
        it(`type "${typeName}" should be documented`, () => {
          const documented = isDocumented(typeName, docsContent)
          if (!documented) {
            expect.fail(
              `Type "${typeName}" from @dotdo/claude is not documented.\n` +
              `Add documentation in docs/ directory (e.g., docs/reference/types.mdx)`
            )
          }
          expect(documented).toBe(true)
        })
      }
    })

    it('should have all exports documented (summary)', () => {
      const allExports = [...sdkExports.values, ...sdkExports.types]
      const undocumented = allExports.filter((name) => !isDocumented(name, docsContent))

      if (undocumented.length > 0) {
        const message = [
          `Found ${undocumented.length} undocumented export(s) from @dotdo/claude:`,
          '',
          'Values:',
          ...sdkExports.values
            .filter((name) => !isDocumented(name, docsContent))
            .map((name) => `  - ${name}`),
          '',
          'Types:',
          ...sdkExports.types
            .filter((name) => !isDocumented(name, docsContent))
            .map((name) => `  - ${name}`),
        ].join('\n')

        expect.fail(message)
      }

      expect(undocumented).toHaveLength(0)
    })
  })

  describe('@dotdo/terminal (packages/terminal/src/components/index.ts)', () => {
    const terminalIndexPath = path.join(PACKAGES_DIR, 'terminal', 'src', 'components', 'index.ts')

    it('should have terminal components index file', () => {
      expect(fs.existsSync(terminalIndexPath)).toBe(true)
    })

    const terminalExports = extractExports(terminalIndexPath)

    describe('component exports', () => {
      it('should have component exports', () => {
        expect(terminalExports.values.length).toBeGreaterThan(0)
      })

      for (const exportName of terminalExports.values) {
        it(`"${exportName}" should be documented`, () => {
          const documented = isDocumented(exportName, docsContent)
          if (!documented) {
            expect.fail(
              `Export "${exportName}" from @dotdo/terminal is not documented.\n` +
              `Add documentation in docs/ directory (e.g., docs/terminal/components/*.mdx)`
            )
          }
          expect(documented).toBe(true)
        })
      }
    })

    describe('type exports', () => {
      it('should have type exports', () => {
        expect(terminalExports.types.length).toBeGreaterThan(0)
      })

      for (const typeName of terminalExports.types) {
        it(`type "${typeName}" should be documented`, () => {
          const documented = isDocumented(typeName, docsContent)
          if (!documented) {
            expect.fail(
              `Type "${typeName}" from @dotdo/terminal is not documented.\n` +
              `Add documentation in docs/ directory (e.g., docs/terminal/components/*.mdx)`
            )
          }
          expect(documented).toBe(true)
        })
      }
    })

    it('should have all exports documented (summary)', () => {
      const allExports = [...terminalExports.values, ...terminalExports.types]
      const undocumented = allExports.filter((name) => !isDocumented(name, docsContent))

      if (undocumented.length > 0) {
        const message = [
          `Found ${undocumented.length} undocumented export(s) from @dotdo/terminal:`,
          '',
          'Components:',
          ...terminalExports.values
            .filter((name) => !isDocumented(name, docsContent))
            .map((name) => `  - ${name}`),
          '',
          'Types:',
          ...terminalExports.types
            .filter((name) => !isDocumented(name, docsContent))
            .map((name) => `  - ${name}`),
        ].join('\n')

        expect.fail(message)
      }

      expect(undocumented).toHaveLength(0)
    })
  })

  describe('coverage summary', () => {
    it('should report overall documentation coverage', () => {
      const sdkIndexPath = path.join(PACKAGES_DIR, 'sdk', 'src', 'index.ts')
      const terminalIndexPath = path.join(PACKAGES_DIR, 'terminal', 'src', 'components', 'index.ts')

      const sdkExports = extractExports(sdkIndexPath)
      const terminalExports = extractExports(terminalIndexPath)

      const allSdkExports = [...sdkExports.values, ...sdkExports.types]
      const allTerminalExports = [...terminalExports.values, ...terminalExports.types]

      const sdkDocumented = allSdkExports.filter((name) => isDocumented(name, docsContent)).length
      const terminalDocumented = allTerminalExports.filter((name) => isDocumented(name, docsContent)).length

      const sdkCoverage = ((sdkDocumented / allSdkExports.length) * 100).toFixed(1)
      const terminalCoverage = ((terminalDocumented / allTerminalExports.length) * 100).toFixed(1)

      console.log('\n Documentation Coverage Report:')
      console.log(`   @dotdo/claude: ${sdkDocumented}/${allSdkExports.length} (${sdkCoverage}%)`)
      console.log(`   @dotdo/terminal: ${terminalDocumented}/${allTerminalExports.length} (${terminalCoverage}%)`)

      // This test always passes - it's just for reporting
      expect(true).toBe(true)
    })
  })
})
