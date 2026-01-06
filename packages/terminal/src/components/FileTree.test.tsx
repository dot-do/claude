import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileTree, FileNode } from './FileTree'

describe('FileTree', () => {
  const mockFiles: FileNode[] = [
    {
      name: 'src',
      path: '/src',
      type: 'directory',
      children: [
        { name: 'index.ts', path: '/src/index.ts', type: 'file', size: 1024 },
        { name: 'utils.js', path: '/src/utils.js', type: 'file', size: 512 },
      ],
    },
    { name: 'package.json', path: '/package.json', type: 'file', size: 256 },
    { name: 'README.md', path: '/README.md', type: 'file' },
  ]

  describe('rendering file tree structure', () => {
    it('renders root files and directories', () => {
      render(<FileTree files={mockFiles} />)

      expect(screen.getByText('src')).toBeInTheDocument()
      expect(screen.getByText('package.json')).toBeInTheDocument()
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })

    it('renders with tree role and aria-label', () => {
      render(<FileTree files={mockFiles} />)

      const tree = screen.getByRole('tree')
      expect(tree).toHaveAttribute('aria-label', 'File tree')
    })

    it('shows "No files" message when files array is empty', () => {
      render(<FileTree files={[]} />)

      expect(screen.getByText('No files')).toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<FileTree files={mockFiles} className="custom-class" />)

      const tree = screen.getByRole('tree')
      expect(tree).toHaveClass('custom-class')
    })

    it('shows file sizes when showSize is true', () => {
      render(<FileTree files={mockFiles} showSize />)

      expect(screen.getByText('256B')).toBeInTheDocument()
    })
  })

  describe('directory expansion/collapse', () => {
    it('shows collapsed indicator for directories initially', () => {
      render(<FileTree files={mockFiles} />)

      // Directory should show collapse indicator
      expect(screen.getByText('src')).toBeInTheDocument()
    })

    it('expands directory on click to show children', async () => {
      render(<FileTree files={mockFiles} />)

      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument()
        expect(screen.getByText('utils.js')).toBeInTheDocument()
      })
    })

    it('collapses expanded directory on second click', async () => {
      render(<FileTree files={mockFiles} />)

      const srcDir = screen.getByText('src')

      // First click - expand
      fireEvent.click(srcDir)
      await waitFor(() => {
        expect(screen.getByText('index.ts')).toBeInTheDocument()
      })

      // Second click - collapse
      fireEvent.click(srcDir)
      await waitFor(() => {
        expect(screen.queryByText('index.ts')).not.toBeInTheDocument()
      })
    })

    it('calls onExpand when expanding a directory without children', async () => {
      const emptyDir: FileNode[] = [
        { name: 'empty-dir', path: '/empty-dir', type: 'directory' },
      ]
      const loadedChildren: FileNode[] = [
        { name: 'loaded.ts', path: '/empty-dir/loaded.ts', type: 'file' },
      ]

      const onExpand = vi.fn().mockResolvedValue(loadedChildren)

      render(<FileTree files={emptyDir} onExpand={onExpand} />)

      const dir = screen.getByText('empty-dir')
      fireEvent.click(dir)

      await waitFor(() => {
        expect(onExpand).toHaveBeenCalledWith(emptyDir[0])
        expect(screen.getByText('loaded.ts')).toBeInTheDocument()
      })
    })
  })

  describe('file selection callback', () => {
    it('calls onSelect when a file is clicked', () => {
      const onSelect = vi.fn()

      render(<FileTree files={mockFiles} onSelect={onSelect} />)

      const packageJson = screen.getByText('package.json')
      fireEvent.click(packageJson)

      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'package.json',
          path: '/package.json',
          type: 'file',
        })
      )
    })

    it('does not call onSelect when clicking a directory', () => {
      const onSelect = vi.fn()

      render(<FileTree files={mockFiles} onSelect={onSelect} />)

      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      expect(onSelect).not.toHaveBeenCalled()
    })

    it('highlights selected file based on selectedPath', () => {
      render(<FileTree files={mockFiles} selectedPath="/package.json" />)

      const packageJsonButton = screen.getByText('package.json').closest('button')
      expect(packageJsonButton).toHaveClass('bg-slate-200')
    })
  })

  describe('icon display by file type', () => {
    it('displays folder icon for directories', () => {
      const { container } = render(<FileTree files={mockFiles} />)

      // Directory icon is now an SVG with amber color class
      const folderIcons = container.querySelectorAll('svg.text-amber-500')
      expect(folderIcons.length).toBeGreaterThan(0)
    })

    it('displays TypeScript icon for .ts files', async () => {
      const { container } = render(<FileTree files={mockFiles} />)

      // Expand src to see .ts file
      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      await waitFor(() => {
        // TypeScript files have blue icon
        const tsIcons = container.querySelectorAll('svg.text-blue-500')
        expect(tsIcons.length).toBeGreaterThan(0)
      })
    })

    it('displays JavaScript icon for .js files', async () => {
      const { container } = render(<FileTree files={mockFiles} />)

      // Expand src to see .js file
      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      await waitFor(() => {
        // JavaScript files have yellow icon
        const jsIcons = container.querySelectorAll('svg.text-yellow-500')
        expect(jsIcons.length).toBeGreaterThan(0)
      })
    })

    it('displays JSON icon for .json files', () => {
      const { container } = render(<FileTree files={mockFiles} />)

      // JSON files have green icon
      const jsonIcons = container.querySelectorAll('svg.text-green-500')
      expect(jsonIcons.length).toBeGreaterThan(0)
    })

    it('displays markdown icon for .md files', () => {
      const { container } = render(<FileTree files={mockFiles} />)

      // Markdown files have slate icon
      const mdIcons = container.querySelectorAll('svg.text-slate-500')
      expect(mdIcons.length).toBeGreaterThan(0)
    })

    it('displays default icon for unknown file types', () => {
      const unknownFile: FileNode[] = [
        { name: 'unknown.xyz', path: '/unknown.xyz', type: 'file' },
      ]

      const { container } = render(<FileTree files={unknownFile} />)

      // Unknown files get slate-400 icon color
      const defaultIcons = container.querySelectorAll('svg.text-slate-400')
      expect(defaultIcons.length).toBeGreaterThan(0)
    })

    it('displays CSS icon for .css files', () => {
      const cssFile: FileNode[] = [
        { name: 'styles.css', path: '/styles.css', type: 'file' },
      ]

      const { container } = render(<FileTree files={cssFile} />)

      // CSS files have pink icon
      const cssIcons = container.querySelectorAll('svg.text-pink-500')
      expect(cssIcons.length).toBeGreaterThan(0)
    })

    it('displays HTML icon for .html files', () => {
      const htmlFile: FileNode[] = [
        { name: 'index.html', path: '/index.html', type: 'file' },
      ]

      const { container } = render(<FileTree files={htmlFile} />)

      // HTML files have orange icon
      const htmlIcons = container.querySelectorAll('svg.text-orange-500')
      expect(htmlIcons.length).toBeGreaterThan(0)
    })

    it('displays Python icon for .py files', () => {
      const pyFile: FileNode[] = [
        { name: 'script.py', path: '/script.py', type: 'file' },
      ]

      const { container } = render(<FileTree files={pyFile} />)

      // Python files have blue icon
      const pyIcons = container.querySelectorAll('svg.text-blue-500')
      expect(pyIcons.length).toBeGreaterThan(0)
    })

    it('displays Rust icon for .rs files', () => {
      const rsFile: FileNode[] = [
        { name: 'main.rs', path: '/main.rs', type: 'file' },
      ]

      const { container } = render(<FileTree files={rsFile} />)

      // Rust files have orange-600 icon
      const rsIcons = container.querySelectorAll('svg.text-orange-600')
      expect(rsIcons.length).toBeGreaterThan(0)
    })

    it('displays Go icon for .go files', () => {
      const goFile: FileNode[] = [
        { name: 'main.go', path: '/main.go', type: 'file' },
      ]

      const { container } = render(<FileTree files={goFile} />)

      // Go files have cyan icon
      const goIcons = container.querySelectorAll('svg.text-cyan-500')
      expect(goIcons.length).toBeGreaterThan(0)
    })
  })
})
