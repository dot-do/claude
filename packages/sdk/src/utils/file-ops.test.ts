import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFile, writeFile, listFiles } from './file-ops'
import { mkdir, rm, writeFile as nodeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('file operations', () => {
  let testDir: string

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `file-ops-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up the test directory
    await rm(testDir, { recursive: true, force: true })
  })

  describe('readFile', () => {
    it('reads content from an existing file', async () => {
      const filePath = join(testDir, 'test.txt')
      await nodeWriteFile(filePath, 'Hello, World!')

      const content = await readFile(filePath)
      expect(content).toBe('Hello, World!')
    })

    it('reads UTF-8 content correctly', async () => {
      const filePath = join(testDir, 'unicode.txt')
      const unicodeContent = 'Hello, World!'
      await nodeWriteFile(filePath, unicodeContent)

      const content = await readFile(filePath)
      expect(content).toBe(unicodeContent)
    })

    it('throws error for non-existent file', async () => {
      const filePath = join(testDir, 'nonexistent.txt')

      await expect(readFile(filePath)).rejects.toThrow()
    })

    it('handles empty files', async () => {
      const filePath = join(testDir, 'empty.txt')
      await nodeWriteFile(filePath, '')

      const content = await readFile(filePath)
      expect(content).toBe('')
    })

    it('reads files with newlines', async () => {
      const filePath = join(testDir, 'multiline.txt')
      const content = 'line1\nline2\nline3'
      await nodeWriteFile(filePath, content)

      const result = await readFile(filePath)
      expect(result).toBe(content)
    })
  })

  describe('writeFile', () => {
    it('writes content to a new file', async () => {
      const filePath = join(testDir, 'newfile.txt')
      await writeFile(filePath, 'New content')

      const { readFile: nodeReadFile } = await import('node:fs/promises')
      const content = await nodeReadFile(filePath, 'utf-8')
      expect(content).toBe('New content')
    })

    it('overwrites existing file content', async () => {
      const filePath = join(testDir, 'overwrite.txt')
      await nodeWriteFile(filePath, 'Old content')

      await writeFile(filePath, 'New content')

      const { readFile: nodeReadFile } = await import('node:fs/promises')
      const content = await nodeReadFile(filePath, 'utf-8')
      expect(content).toBe('New content')
    })

    it('handles UTF-8 content', async () => {
      const filePath = join(testDir, 'unicode-write.txt')
      const unicodeContent = 'Hello, World!'

      await writeFile(filePath, unicodeContent)

      const { readFile: nodeReadFile } = await import('node:fs/promises')
      const content = await nodeReadFile(filePath, 'utf-8')
      expect(content).toBe(unicodeContent)
    })

    it('creates parent directories if they do not exist', async () => {
      const filePath = join(testDir, 'nested', 'dir', 'file.txt')

      await writeFile(filePath, 'Nested content')

      const { readFile: nodeReadFile } = await import('node:fs/promises')
      const content = await nodeReadFile(filePath, 'utf-8')
      expect(content).toBe('Nested content')
    })

    it('handles empty content', async () => {
      const filePath = join(testDir, 'empty-write.txt')

      await writeFile(filePath, '')

      const { readFile: nodeReadFile } = await import('node:fs/promises')
      const content = await nodeReadFile(filePath, 'utf-8')
      expect(content).toBe('')
    })
  })

  describe('listFiles', () => {
    it('lists files in a directory', async () => {
      await nodeWriteFile(join(testDir, 'file1.txt'), 'content1')
      await nodeWriteFile(join(testDir, 'file2.txt'), 'content2')

      const files = await listFiles(testDir)
      expect(files).toHaveLength(2)
      expect(files).toContain('file1.txt')
      expect(files).toContain('file2.txt')
    })

    it('returns empty array for empty directory', async () => {
      const files = await listFiles(testDir)
      expect(files).toEqual([])
    })

    it('throws error for non-existent directory', async () => {
      const nonExistentDir = join(testDir, 'nonexistent')

      await expect(listFiles(nonExistentDir)).rejects.toThrow()
    })

    it('lists directories and files', async () => {
      await nodeWriteFile(join(testDir, 'file.txt'), 'content')
      await mkdir(join(testDir, 'subdir'))

      const files = await listFiles(testDir)
      expect(files).toHaveLength(2)
      expect(files).toContain('file.txt')
      expect(files).toContain('subdir')
    })

    it('does not include hidden files by default', async () => {
      await nodeWriteFile(join(testDir, '.hidden'), 'hidden content')
      await nodeWriteFile(join(testDir, 'visible.txt'), 'visible content')

      const files = await listFiles(testDir)
      expect(files).toHaveLength(1)
      expect(files).toContain('visible.txt')
      expect(files).not.toContain('.hidden')
    })

    it('returns sorted file list', async () => {
      await nodeWriteFile(join(testDir, 'charlie.txt'), 'c')
      await nodeWriteFile(join(testDir, 'alpha.txt'), 'a')
      await nodeWriteFile(join(testDir, 'bravo.txt'), 'b')

      const files = await listFiles(testDir)
      expect(files).toEqual(['alpha.txt', 'bravo.txt', 'charlie.txt'])
    })
  })
})
