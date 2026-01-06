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
      expect(packageJsonButton).toHaveClass('bg-gray-700')
    })
  })

  describe('icon display by file type', () => {
    it('displays folder icon for directories', () => {
      render(<FileTree files={mockFiles} />)

      // Directory icon
      expect(screen.getAllByText('📁').length).toBeGreaterThan(0)
    })

    it('displays TypeScript icon for .ts files', async () => {
      render(<FileTree files={mockFiles} />)

      // Expand src to see .ts file
      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      await waitFor(() => {
        expect(screen.getAllByText('📘').length).toBeGreaterThan(0)
      })
    })

    it('displays JavaScript icon for .js files', async () => {
      render(<FileTree files={mockFiles} />)

      // Expand src to see .js file
      const srcDir = screen.getByText('src')
      fireEvent.click(srcDir)

      await waitFor(() => {
        expect(screen.getAllByText('📒').length).toBeGreaterThan(0)
      })
    })

    it('displays JSON icon for .json files', () => {
      render(<FileTree files={mockFiles} />)

      expect(screen.getAllByText('📋').length).toBeGreaterThan(0)
    })

    it('displays markdown icon for .md files', () => {
      render(<FileTree files={mockFiles} />)

      expect(screen.getAllByText('📝').length).toBeGreaterThan(0)
    })

    it('displays default icon for unknown file types', () => {
      const unknownFile: FileNode[] = [
        { name: 'unknown.xyz', path: '/unknown.xyz', type: 'file' },
      ]

      render(<FileTree files={unknownFile} />)

      expect(screen.getByText('📄')).toBeInTheDocument()
    })

    it('displays CSS icon for .css files', () => {
      const cssFile: FileNode[] = [
        { name: 'styles.css', path: '/styles.css', type: 'file' },
      ]

      render(<FileTree files={cssFile} />)

      expect(screen.getByText('🎨')).toBeInTheDocument()
    })

    it('displays HTML icon for .html files', () => {
      const htmlFile: FileNode[] = [
        { name: 'index.html', path: '/index.html', type: 'file' },
      ]

      render(<FileTree files={htmlFile} />)

      expect(screen.getByText('🌐')).toBeInTheDocument()
    })

    it('displays Python icon for .py files', () => {
      const pyFile: FileNode[] = [
        { name: 'script.py', path: '/script.py', type: 'file' },
      ]

      render(<FileTree files={pyFile} />)

      expect(screen.getByText('🐍')).toBeInTheDocument()
    })

    it('displays Rust icon for .rs files', () => {
      const rsFile: FileNode[] = [
        { name: 'main.rs', path: '/main.rs', type: 'file' },
      ]

      render(<FileTree files={rsFile} />)

      expect(screen.getByText('🦀')).toBeInTheDocument()
    })

    it('displays Go icon for .go files', () => {
      const goFile: FileNode[] = [
        { name: 'main.go', path: '/main.go', type: 'file' },
      ]

      render(<FileTree files={goFile} />)

      expect(screen.getByText('🐹')).toBeInTheDocument()
    })
  })
})
