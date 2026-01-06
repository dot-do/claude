import { describe, it, expect } from 'vitest'
import { globSync } from 'glob'
import matter from 'gray-matter'
import fs from 'fs'
import path from 'path'

const DOCS_DIR = path.join(__dirname, '..')

describe('Documentation Schema Validation', () => {
  describe('MDX Frontmatter Validation', () => {
    const mdxFiles = globSync('**/*.mdx', {
      cwd: DOCS_DIR,
      ignore: ['node_modules/**', '__tests__/**'],
    })

    it('should have at least one MDX file in docs/', () => {
      expect(mdxFiles.length).toBeGreaterThan(0)
    })

    it.each(mdxFiles)('%s should have valid frontmatter with required fields', (file) => {
      const filePath = path.join(DOCS_DIR, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const { data: frontmatter } = matter(content)

      // Check that frontmatter exists
      expect(frontmatter).toBeDefined()
      expect(typeof frontmatter).toBe('object')

      // Check required 'title' field
      expect(frontmatter).toHaveProperty('title')
      expect(typeof frontmatter.title).toBe('string')
      expect(frontmatter.title.trim().length).toBeGreaterThan(0)

      // Check required 'description' field
      expect(frontmatter).toHaveProperty('description')
      expect(typeof frontmatter.description).toBe('string')
      expect(frontmatter.description.trim().length).toBeGreaterThan(0)
    })
  })

  describe('meta.json Structure Validation', () => {
    const metaFiles = globSync('**/meta.json', {
      cwd: DOCS_DIR,
      ignore: ['node_modules/**', '__tests__/**'],
    })

    it('should have at least one meta.json file in docs/', () => {
      expect(metaFiles.length).toBeGreaterThan(0)
    })

    it.each(metaFiles)('%s should have valid structure with pages array', (file) => {
      const filePath = path.join(DOCS_DIR, file)
      const content = fs.readFileSync(filePath, 'utf-8')

      // Should be valid JSON
      let meta: unknown
      expect(() => {
        meta = JSON.parse(content)
      }).not.toThrow()

      // Should be an object
      expect(meta).toBeDefined()
      expect(typeof meta).toBe('object')
      expect(meta).not.toBeNull()

      const metaObj = meta as Record<string, unknown>

      // Should have 'pages' property that is an array
      expect(metaObj).toHaveProperty('pages')
      expect(Array.isArray(metaObj.pages)).toBe(true)

      // Each page entry should be a string (file reference) or an object with required properties
      const pages = metaObj.pages as unknown[]
      pages.forEach((page, index) => {
        const isString = typeof page === 'string'
        const isValidObject =
          typeof page === 'object' &&
          page !== null &&
          'title' in page &&
          typeof (page as Record<string, unknown>).title === 'string'

        expect(
          isString || isValidObject,
          `pages[${index}] should be a string or an object with a 'title' property`
        ).toBe(true)
      })
    })
  })
})
