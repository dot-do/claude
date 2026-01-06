import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiffViewer } from './DiffViewer'

const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import { hello } from './hello'
+import { world } from './world'

 function main() {
-  console.log(hello())
+  console.log(hello(), world())
 }
`

const multiHunkDiff = `diff --git a/src/utils.ts b/src/utils.ts
index 111111..222222 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,4 +1,4 @@
-export function add(a: number, b: number) {
+export function add(a: number, b: number): number {
   return a + b
 }

@@ -10,4 +10,5 @@ export function subtract(a: number, b: number) {
 }

 export function multiply(a: number, b: number) {
+  // TODO: add type annotation
   return a * b
 }
`

describe('DiffViewer', () => {
  describe('rendering', () => {
    it('renders diff container', () => {
      render(<DiffViewer diff={sampleDiff} />)
      expect(screen.getByTestId('diff-viewer')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<DiffViewer diff={sampleDiff} className="custom-class" />)
      const container = screen.getByTestId('diff-viewer')
      expect(container).toHaveClass('custom-class')
    })

    it('has correct accessibility attributes', () => {
      render(<DiffViewer diff={sampleDiff} ariaLabel="Code diff" />)
      const container = screen.getByTestId('diff-viewer')
      expect(container).toHaveAttribute('role', 'region')
      expect(container).toHaveAttribute('aria-label', 'Code diff')
    })
  })

  describe('diff parsing', () => {
    it('displays file header', () => {
      render(<DiffViewer diff={sampleDiff} />)
      expect(screen.getByText(/src\/index\.ts/)).toBeInTheDocument()
    })

    it('displays added lines with plus indicator', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const addedLines = screen.getAllByTestId('diff-line-added')
      expect(addedLines.length).toBeGreaterThan(0)
    })

    it('displays removed lines with minus indicator', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const removedLines = screen.getAllByTestId('diff-line-removed')
      expect(removedLines.length).toBeGreaterThan(0)
    })

    it('displays context lines', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const contextLines = screen.getAllByTestId('diff-line-context')
      expect(contextLines.length).toBeGreaterThan(0)
    })

    it('parses multiple hunks', () => {
      render(<DiffViewer diff={multiHunkDiff} />)
      const hunkHeaders = screen.getAllByTestId('diff-hunk-header')
      expect(hunkHeaders).toHaveLength(2)
    })
  })

  describe('line numbers', () => {
    it('shows line numbers by default', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const lineNumbers = screen.getAllByTestId('diff-line-number')
      expect(lineNumbers.length).toBeGreaterThan(0)
    })

    it('hides line numbers when showLineNumbers is false', () => {
      render(<DiffViewer diff={sampleDiff} showLineNumbers={false} />)
      const lineNumbers = screen.queryAllByTestId('diff-line-number')
      expect(lineNumbers).toHaveLength(0)
    })
  })

  describe('view modes', () => {
    it('renders unified view by default', () => {
      render(<DiffViewer diff={sampleDiff} />)
      expect(screen.getByTestId('diff-view-unified')).toBeInTheDocument()
    })

    it('renders split view when viewMode is split', () => {
      render(<DiffViewer diff={sampleDiff} viewMode="split" />)
      expect(screen.getByTestId('diff-view-split')).toBeInTheDocument()
    })

    it('split view shows left and right columns', () => {
      render(<DiffViewer diff={sampleDiff} viewMode="split" />)
      expect(screen.getByTestId('diff-split-left')).toBeInTheDocument()
      expect(screen.getByTestId('diff-split-right')).toBeInTheDocument()
    })
  })

  describe('syntax highlighting', () => {
    it('applies syntax highlighting classes', () => {
      render(<DiffViewer diff={sampleDiff} language="typescript" />)
      // Check that code content has syntax highlighting wrapper
      const codeElements = screen.getAllByTestId('diff-line-content')
      expect(codeElements.length).toBeGreaterThan(0)
      // At least one element should have syntax highlighting
      const hasHighlight = codeElements.some(el => el.classList.contains('syntax-highlight'))
      expect(hasHighlight).toBe(true)
    })
  })

  describe('styling', () => {
    it('applies addition styling (green background)', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const addedLines = screen.getAllByTestId('diff-line-added')
      addedLines.forEach(line => {
        expect(line).toHaveClass('bg-green-100')
      })
    })

    it('applies deletion styling (red background)', () => {
      render(<DiffViewer diff={sampleDiff} />)
      const removedLines = screen.getAllByTestId('diff-line-removed')
      removedLines.forEach(line => {
        expect(line).toHaveClass('bg-red-100')
      })
    })
  })

  describe('empty state', () => {
    it('shows empty message when diff is empty', () => {
      render(<DiffViewer diff="" />)
      expect(screen.getByText(/no changes/i)).toBeInTheDocument()
    })

    it('handles whitespace-only diff', () => {
      render(<DiffViewer diff="   \n\n  " />)
      expect(screen.getByText(/no changes/i)).toBeInTheDocument()
    })
  })

  describe('multiple files', () => {
    const multiFileDiff = `diff --git a/file1.ts b/file1.ts
index aaa..bbb 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,2 @@
-const a = 1
+const a = 2

diff --git a/file2.ts b/file2.ts
index ccc..ddd 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1,2 +1,2 @@
-const b = 1
+const b = 2
`

    it('renders multiple file diffs', () => {
      render(<DiffViewer diff={multiFileDiff} />)
      const fileHeaders = screen.getAllByTestId('diff-file-header')
      expect(fileHeaders).toHaveLength(2)
    })
  })
})
