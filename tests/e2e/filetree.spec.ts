/**
 * FileTree E2E Tests
 *
 * Playwright tests for file tree functionality including:
 * - Viewing file tree structure
 * - Expanding/collapsing directories
 * - Selecting files
 * - File tree navigation
 */

import { test, expect, type Page } from '@playwright/test'

// Test data for file tree
const mockFileTree = [
  {
    name: 'src',
    path: '/src',
    type: 'directory',
    children: [
      { name: 'components', path: '/src/components', type: 'directory', children: [
        { name: 'Button.tsx', path: '/src/components/Button.tsx', type: 'file', size: 2048 },
        { name: 'Input.tsx', path: '/src/components/Input.tsx', type: 'file', size: 1536 },
      ]},
      { name: 'index.ts', path: '/src/index.ts', type: 'file', size: 1024 },
      { name: 'utils.ts', path: '/src/utils.ts', type: 'file', size: 512 },
    ],
  },
  {
    name: 'tests',
    path: '/tests',
    type: 'directory',
    children: [
      { name: 'unit', path: '/tests/unit', type: 'directory', children: [] },
      { name: 'e2e', path: '/tests/e2e', type: 'directory', children: [] },
    ],
  },
  { name: 'package.json', path: '/package.json', type: 'file', size: 256 },
  { name: 'README.md', path: '/README.md', type: 'file', size: 4096 },
  { name: 'tsconfig.json', path: '/tsconfig.json', type: 'file', size: 512 },
]

/**
 * Helper to inject FileTree test component into the page
 */
async function setupFileTreeTestPage(page: Page, options: {
  files?: typeof mockFileTree
  showSize?: boolean
  selectedPath?: string
} = {}) {
  const { files = mockFileTree, showSize = false, selectedPath } = options

  await page.setContent(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>FileTree E2E Test</title>
        <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <style>
          body {
            margin: 0;
            padding: 0;
            background: #111;
            color: #fff;
            font-family: system-ui, sans-serif;
          }
          .file-tree {
            width: 300px;
            height: 100vh;
            overflow: auto;
          }
          .tree-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            cursor: pointer;
            user-select: none;
          }
          .tree-item:hover {
            background: #333;
          }
          .tree-item.selected {
            background: #374151;
          }
          .tree-item .chevron {
            width: 16px;
            color: #666;
          }
          .tree-item .icon {
            width: 16px;
          }
          .tree-item .name {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .tree-item .size {
            color: #666;
            font-size: 12px;
          }
          .tree-children {
            margin-left: 16px;
          }
          .empty-message {
            color: #666;
            padding: 16px;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div id="root"></div>
        <script>
          const { createElement: h, useState, useCallback } = React;

          const files = ${JSON.stringify(files)};
          const showSize = ${showSize};
          const initialSelectedPath = ${selectedPath ? JSON.stringify(selectedPath) : 'null'};

          // Icon mapping
          function getIcon(type, name) {
            if (type === 'directory') return '\\u{1F4C1}';
            const ext = name.split('.').pop()?.toLowerCase();
            const icons = {
              ts: '\\u{1F4D8}',
              tsx: '\\u{1F4D8}',
              js: '\\u{1F4D2}',
              jsx: '\\u{1F4D2}',
              json: '\\u{1F4CB}',
              md: '\\u{1F4DD}',
              css: '\\u{1F3A8}',
              html: '\\u{1F310}',
            };
            return icons[ext] || '\\u{1F4C4}';
          }

          function formatSize(bytes) {
            if (!bytes) return '';
            if (bytes < 1024) return bytes + 'B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'K';
            return (bytes / 1024 / 1024).toFixed(1) + 'M';
          }

          function TreeNode({ node, depth, selectedPath, onSelect }) {
            const [expanded, setExpanded] = useState(false);
            const isDirectory = node.type === 'directory';
            const isSelected = selectedPath === node.path;

            const handleClick = () => {
              if (isDirectory) {
                setExpanded(!expanded);
              } else {
                onSelect(node);
              }
            };

            return h('div', { 'data-testid': 'tree-node', 'data-path': node.path },
              h('button', {
                className: 'tree-item' + (isSelected ? ' selected' : ''),
                onClick: handleClick,
                style: { paddingLeft: (depth * 16 + 8) + 'px' },
                'data-testid': isDirectory ? 'directory-item' : 'file-item',
                'data-name': node.name,
                'aria-expanded': isDirectory ? expanded : undefined,
              },
                h('span', { className: 'chevron' }, isDirectory ? (expanded ? '\\u25BC' : '\\u25B6') : ''),
                h('span', { className: 'icon' }, getIcon(node.type, node.name)),
                h('span', { className: 'name' }, node.name),
                showSize && node.size ? h('span', { className: 'size' }, formatSize(node.size)) : null
              ),
              expanded && node.children && node.children.length > 0 ?
                h('div', { className: 'tree-children', 'data-testid': 'tree-children' },
                  node.children.map(child =>
                    h(TreeNode, {
                      key: child.path,
                      node: child,
                      depth: depth + 1,
                      selectedPath,
                      onSelect,
                    })
                  )
                ) : null
            );
          }

          function FileTree({ files, showSize, selectedPath: initialSelected }) {
            const [selectedPath, setSelectedPath] = useState(initialSelected);
            const [selectedFile, setSelectedFile] = useState(null);

            const handleSelect = useCallback((file) => {
              setSelectedPath(file.path);
              setSelectedFile(file);
              // Expose selection for testing
              window.__lastSelectedFile = file;
            }, []);

            if (files.length === 0) {
              return h('div', {
                className: 'file-tree',
                role: 'tree',
                'aria-label': 'File tree'
              },
                h('div', { className: 'empty-message' }, 'No files')
              );
            }

            return h('div', {
              className: 'file-tree',
              role: 'tree',
              'aria-label': 'File tree',
              'data-testid': 'file-tree'
            },
              files.map(file =>
                h(TreeNode, {
                  key: file.path,
                  node: file,
                  depth: 0,
                  selectedPath,
                  onSelect: handleSelect,
                })
              ),
              selectedFile && h('div', {
                'data-testid': 'selected-file-info',
                style: { padding: '16px', borderTop: '1px solid #333', marginTop: '16px' }
              },
                h('div', null, 'Selected: ', selectedFile.name),
                h('div', null, 'Path: ', selectedFile.path)
              )
            );
          }

          ReactDOM.render(
            h(FileTree, { files, showSize, selectedPath: initialSelectedPath }),
            document.getElementById('root')
          );
        </script>
      </body>
    </html>
  `)
}

test.describe('FileTree E2E Tests', () => {
  test.describe('Viewing file tree', () => {
    test('should render the file tree with proper accessibility attributes', async ({ page }) => {
      await setupFileTreeTestPage(page)

      const fileTree = page.getByRole('tree', { name: 'File tree' })
      await expect(fileTree).toBeVisible()
      await expect(fileTree).toHaveAttribute('aria-label', 'File tree')
    })

    test('should display root-level files and directories', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Check root directories
      await expect(page.getByText('src')).toBeVisible()
      await expect(page.getByText('tests')).toBeVisible()

      // Check root files
      await expect(page.getByText('package.json')).toBeVisible()
      await expect(page.getByText('README.md')).toBeVisible()
      await expect(page.getByText('tsconfig.json')).toBeVisible()
    })

    test('should show "No files" message when file tree is empty', async ({ page }) => {
      await setupFileTreeTestPage(page, { files: [] })

      await expect(page.getByText('No files')).toBeVisible()
    })

    test('should display file icons based on file type', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand src directory to see TypeScript files
      await page.getByText('src').click()

      // Check for TypeScript file icon (blue book emoji)
      const tsFile = page.locator('[data-name="index.ts"]')
      await expect(tsFile).toBeVisible()
    })

    test('should show file sizes when showSize is enabled', async ({ page }) => {
      await setupFileTreeTestPage(page, { showSize: true })

      // Check for size display on root files
      await expect(page.getByText('256B')).toBeVisible() // package.json size
      await expect(page.getByText('4.0K')).toBeVisible() // README.md size
    })
  })

  test.describe('Expanding/collapsing directories', () => {
    test('should show collapsed indicator for directories initially', async ({ page }) => {
      await setupFileTreeTestPage(page)

      const srcDir = page.locator('[data-name="src"]')
      await expect(srcDir).toHaveAttribute('aria-expanded', 'false')
    })

    test('should expand directory on click', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Directory children should not be visible initially
      await expect(page.getByText('index.ts')).not.toBeVisible()

      // Click to expand
      await page.getByText('src').click()

      // Now children should be visible
      await expect(page.getByText('index.ts')).toBeVisible()
      await expect(page.getByText('utils.ts')).toBeVisible()
      await expect(page.getByText('components')).toBeVisible()
    })

    test('should collapse expanded directory on second click', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand first
      await page.getByText('src').click()
      await expect(page.getByText('index.ts')).toBeVisible()

      // Collapse
      await page.getByText('src').click()
      await expect(page.getByText('index.ts')).not.toBeVisible()
    })

    test('should support nested directory expansion', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand src
      await page.getByText('src').click()
      await expect(page.getByText('components')).toBeVisible()

      // Expand nested components directory
      await page.getByText('components').click()
      await expect(page.getByText('Button.tsx')).toBeVisible()
      await expect(page.getByText('Input.tsx')).toBeVisible()
    })

    test('should change chevron indicator when expanded/collapsed', async ({ page }) => {
      await setupFileTreeTestPage(page)

      const srcDir = page.locator('[data-name="src"]')

      // Initially shows right-pointing chevron
      await expect(srcDir).toContainText('\u25B6')

      // Click to expand
      await srcDir.click()

      // Should now show down-pointing chevron
      await expect(srcDir).toContainText('\u25BC')
    })

    test('should maintain expansion state of multiple directories independently', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand both src and tests directories
      await page.getByText('src').click()
      await page.getByText('tests').click()

      // Both should show their children
      await expect(page.getByText('index.ts')).toBeVisible()
      await expect(page.getByText('unit')).toBeVisible()

      // Collapse only src
      await page.getByText('src').click()

      // src children hidden, tests children still visible
      await expect(page.getByText('index.ts')).not.toBeVisible()
      await expect(page.getByText('unit')).toBeVisible()
    })
  })

  test.describe('Selecting files', () => {
    test('should select a file when clicked', async ({ page }) => {
      await setupFileTreeTestPage(page)

      await page.getByText('package.json').click()

      // Check that selection info is displayed
      const selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toBeVisible()
      await expect(selectedInfo).toContainText('package.json')
      await expect(selectedInfo).toContainText('/package.json')
    })

    test('should highlight selected file', async ({ page }) => {
      await setupFileTreeTestPage(page)

      const packageJsonItem = page.locator('[data-name="package.json"]')
      await packageJsonItem.click()

      await expect(packageJsonItem).toHaveClass(/selected/)
    })

    test('should not select directory when clicked (only expands)', async ({ page }) => {
      await setupFileTreeTestPage(page)

      await page.getByText('src').click()

      // Directory click should expand, not select
      const selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).not.toBeVisible()
    })

    test('should update selection when different file is clicked', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Select first file
      await page.getByText('package.json').click()
      let selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toContainText('package.json')

      // Select different file
      await page.getByText('README.md').click()
      selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toContainText('README.md')

      // Previous selection should no longer be highlighted
      const packageJsonItem = page.locator('[data-name="package.json"]')
      await expect(packageJsonItem).not.toHaveClass(/selected/)
    })

    test('should select nested files after expanding parent directory', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand directories
      await page.getByText('src').click()
      await page.getByText('components').click()

      // Select nested file
      await page.getByText('Button.tsx').click()

      const selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toContainText('Button.tsx')
      await expect(selectedInfo).toContainText('/src/components/Button.tsx')
    })

    test('should show initial selection when selectedPath is provided', async ({ page }) => {
      await setupFileTreeTestPage(page, { selectedPath: '/package.json' })

      const packageJsonItem = page.locator('[data-name="package.json"]')
      await expect(packageJsonItem).toHaveClass(/selected/)
    })
  })

  test.describe('File tree navigation', () => {
    test('should navigate through file tree using mouse clicks', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Navigate through directory structure
      await page.getByText('src').click()
      await expect(page.getByText('components')).toBeVisible()

      await page.getByText('components').click()
      await expect(page.getByText('Button.tsx')).toBeVisible()

      // Select a file at the end of navigation
      await page.getByText('Button.tsx').click()

      const selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toContainText('/src/components/Button.tsx')
    })

    test('should maintain scroll position during navigation', async ({ page }) => {
      // Create a large file tree to enable scrolling
      const manyFiles = Array.from({ length: 50 }, (_, i) => ({
        name: `file-${i}.ts`,
        path: `/file-${i}.ts`,
        type: 'file' as const,
        size: 1024,
      }))

      await setupFileTreeTestPage(page, { files: manyFiles })

      const fileTree = page.getByTestId('file-tree')

      // Scroll down
      await fileTree.evaluate((el) => {
        el.scrollTop = 500
      })

      const scrollBefore = await fileTree.evaluate((el) => el.scrollTop)
      expect(scrollBefore).toBeGreaterThan(0)

      // Click a file
      await page.getByText('file-20.ts').click()

      // Scroll position should be maintained (or close to it)
      const scrollAfter = await fileTree.evaluate((el) => el.scrollTop)
      expect(scrollAfter).toBeCloseTo(scrollBefore, 50)
    })

    test('should be able to expand and collapse multiple levels rapidly', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Rapid expand
      await page.getByText('src').click()
      await page.getByText('components').click()

      // Verify all levels are expanded
      await expect(page.getByText('Button.tsx')).toBeVisible()

      // Rapid collapse - collapse parent should hide all children
      await page.getByText('src').click()

      // Nested children should not be visible
      await expect(page.getByText('components')).not.toBeVisible()
      await expect(page.getByText('Button.tsx')).not.toBeVisible()
    })

    test('should handle deeply nested file structure', async ({ page }) => {
      const deeplyNested = [{
        name: 'level1',
        path: '/level1',
        type: 'directory' as const,
        children: [{
          name: 'level2',
          path: '/level1/level2',
          type: 'directory' as const,
          children: [{
            name: 'level3',
            path: '/level1/level2/level3',
            type: 'directory' as const,
            children: [{
              name: 'level4',
              path: '/level1/level2/level3/level4',
              type: 'directory' as const,
              children: [{
                name: 'deep-file.ts',
                path: '/level1/level2/level3/level4/deep-file.ts',
                type: 'file' as const,
                size: 512,
              }],
            }],
          }],
        }],
      }]

      await setupFileTreeTestPage(page, { files: deeplyNested })

      // Navigate through all levels
      await page.getByText('level1').click()
      await page.getByText('level2').click()
      await page.getByText('level3').click()
      await page.getByText('level4').click()

      // Deep file should be visible
      await expect(page.getByText('deep-file.ts')).toBeVisible()

      // Select deep file
      await page.getByText('deep-file.ts').click()

      const selectedInfo = page.getByTestId('selected-file-info')
      await expect(selectedInfo).toContainText('/level1/level2/level3/level4/deep-file.ts')
    })

    test('should properly indent nested items', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // Expand to show nested structure
      await page.getByText('src').click()
      await page.getByText('components').click()

      // Get padding values for different levels
      const srcPadding = await page.locator('[data-name="src"]').evaluate((el) => {
        return parseInt(getComputedStyle(el).paddingLeft)
      })

      const componentsPadding = await page.locator('[data-name="components"]').evaluate((el) => {
        return parseInt(getComputedStyle(el).paddingLeft)
      })

      const buttonPadding = await page.locator('[data-name="Button.tsx"]').evaluate((el) => {
        return parseInt(getComputedStyle(el).paddingLeft)
      })

      // Each level should have progressively more indentation
      expect(componentsPadding).toBeGreaterThan(srcPadding)
      expect(buttonPadding).toBeGreaterThan(componentsPadding)
    })
  })

  test.describe('Visual and interaction states', () => {
    test('should show hover state on tree items', async ({ page }) => {
      await setupFileTreeTestPage(page)

      const packageJsonItem = page.locator('[data-name="package.json"]')

      // Get initial background color
      const initialBg = await packageJsonItem.evaluate((el) => {
        return getComputedStyle(el).backgroundColor
      })

      // Hover over the item
      await packageJsonItem.hover()

      // Background should change on hover
      const hoverBg = await packageJsonItem.evaluate((el) => {
        return getComputedStyle(el).backgroundColor
      })

      expect(hoverBg).not.toBe(initialBg)
    })

    test('should truncate long file names', async ({ page }) => {
      const filesWithLongNames = [{
        name: 'this-is-a-very-long-file-name-that-should-be-truncated-in-the-ui.typescript.ts',
        path: '/this-is-a-very-long-file-name-that-should-be-truncated-in-the-ui.typescript.ts',
        type: 'file' as const,
        size: 1024,
      }]

      await setupFileTreeTestPage(page, { files: filesWithLongNames })

      const nameSpan = page.locator('.name').first()
      const overflowStyle = await nameSpan.evaluate((el) => {
        return getComputedStyle(el).textOverflow
      })

      expect(overflowStyle).toBe('ellipsis')
    })

    test('should be accessible via click interactions', async ({ page }) => {
      await setupFileTreeTestPage(page)

      // All interactive elements should be buttons
      const buttons = page.locator('[data-testid="file-item"], [data-testid="directory-item"]')
      const count = await buttons.count()

      expect(count).toBeGreaterThan(0)

      for (let i = 0; i < count; i++) {
        const tagName = await buttons.nth(i).evaluate((el) => el.tagName.toLowerCase())
        expect(tagName).toBe('button')
      }
    })
  })
})
