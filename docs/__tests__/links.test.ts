import { describe, it, expect } from 'vitest'
import { globSync } from 'glob'
import fs from 'fs'
import path from 'path'

const DOCS_DIR = path.join(__dirname, '..')

/**
 * Get all MDX files in the docs directory
 */
function getMdxFiles(): string[] {
  return globSync('**/*.mdx', { cwd: DOCS_DIR, absolute: true })
}

/**
 * Extract internal links from MDX content
 * Matches href="/..." patterns in both JSX and Markdown
 */
function extractInternalLinks(content: string): string[] {
  const links: string[] = []

  // Match href="/..." in JSX components (e.g., <Card href="/sdk">)
  const jsxHrefRegex = /href=["'](\/.+?)["']/g
  let match: RegExpExecArray | null
  while ((match = jsxHrefRegex.exec(content)) !== null) {
    links.push(match[1])
  }

  // Match Markdown links [text](/path)
  const markdownLinkRegex = /\]\((\/.+?)\)/g
  while ((match = markdownLinkRegex.exec(content)) !== null) {
    links.push(match[1])
  }

  return [...new Set(links)] // Remove duplicates
}

/**
 * Resolve a link path to a potential file path
 * /sdk -> /sdk/index.mdx or /sdk.mdx
 * /getting-started/installation -> /getting-started/installation.mdx or /getting-started/installation/index.mdx
 */
function resolveLink(link: string): string[] {
  // Remove hash fragments and query strings
  const cleanLink = link.split('#')[0].split('?')[0]

  // Possible file paths for this link
  const possiblePaths = [
    path.join(DOCS_DIR, `${cleanLink}.mdx`),
    path.join(DOCS_DIR, `${cleanLink}.md`),
    path.join(DOCS_DIR, cleanLink, 'index.mdx'),
    path.join(DOCS_DIR, cleanLink, 'index.md'),
    // Also check if it's a directory with a page.mdx (common in some frameworks)
    path.join(DOCS_DIR, cleanLink, 'page.mdx'),
    path.join(DOCS_DIR, cleanLink, 'page.md'),
  ]

  return possiblePaths
}

/**
 * Check if a link resolves to an existing file
 */
function linkExists(link: string): boolean {
  const possiblePaths = resolveLink(link)
  return possiblePaths.some((p) => fs.existsSync(p))
}

describe('Documentation Link Validation', () => {
  const mdxFiles = getMdxFiles()

  it('should find MDX files in the docs directory', () => {
    expect(mdxFiles.length).toBeGreaterThan(0)
  })

  describe('internal links', () => {
    const allLinks: { file: string; link: string }[] = []

    // Collect all internal links from all MDX files
    for (const file of mdxFiles) {
      const content = fs.readFileSync(file, 'utf-8')
      const links = extractInternalLinks(content)

      for (const link of links) {
        allLinks.push({
          file: path.relative(DOCS_DIR, file),
          link,
        })
      }
    }

    it('should find internal links in MDX files', () => {
      // This test will pass even if there are no links (not all docs have links)
      expect(Array.isArray(allLinks)).toBe(true)
    })

    it('should have all internal links resolve to existing pages', () => {
      const brokenLinks: { file: string; link: string }[] = []

      for (const { file, link } of allLinks) {
        if (!linkExists(link)) {
          brokenLinks.push({ file, link })
        }
      }

      if (brokenLinks.length > 0) {
        const errorMessage = brokenLinks
          .map(({ file, link }) => `  - ${file}: ${link}`)
          .join('\n')
        expect.fail(
          `Found ${brokenLinks.length} broken internal link(s):\n${errorMessage}`
        )
      }

      expect(brokenLinks).toHaveLength(0)
    })

    // Individual test for each file to make debugging easier
    for (const file of mdxFiles) {
      const relativePath = path.relative(DOCS_DIR, file)
      const content = fs.readFileSync(file, 'utf-8')
      const links = extractInternalLinks(content)

      if (links.length > 0) {
        describe(relativePath, () => {
          for (const link of links) {
            it(`link "${link}" should resolve to an existing page`, () => {
              const exists = linkExists(link)
              if (!exists) {
                const possiblePaths = resolveLink(link)
                const checkedPaths = possiblePaths
                  .map((p) => `    - ${path.relative(DOCS_DIR, p)}`)
                  .join('\n')
                expect.fail(
                  `Broken link: "${link}"\n  Checked paths:\n${checkedPaths}`
                )
              }
              expect(exists).toBe(true)
            })
          }
        })
      }
    }
  })
})
