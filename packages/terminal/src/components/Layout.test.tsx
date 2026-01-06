import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Layout } from './Layout'

describe('Layout', () => {
  describe('rendering with header, sidebar, main, and bottom panels', () => {
    it('renders header content when provided', () => {
      render(<Layout header={<div>Header Content</div>} />)

      expect(screen.getByText('Header Content')).toBeInTheDocument()
    })

    it('renders sidebar content when provided', () => {
      render(<Layout sidebar={<div>Sidebar Content</div>} />)

      expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
    })

    it('renders main content when provided', () => {
      render(<Layout main={<div>Main Content</div>} />)

      expect(screen.getByText('Main Content')).toBeInTheDocument()
    })

    it('renders bottom panel content when provided', () => {
      render(<Layout bottom={<div>Bottom Content</div>} />)

      expect(screen.getByText('Bottom Content')).toBeInTheDocument()
    })

    it('renders all panels together', () => {
      render(
        <Layout
          header={<div>Header</div>}
          sidebar={<div>Sidebar</div>}
          main={<div>Main</div>}
          bottom={<div>Bottom</div>}
        />
      )

      expect(screen.getByText('Header')).toBeInTheDocument()
      expect(screen.getByText('Sidebar')).toBeInTheDocument()
      expect(screen.getByText('Main')).toBeInTheDocument()
      expect(screen.getByText('Bottom')).toBeInTheDocument()
    })
  })

  describe('panel visibility based on props', () => {
    it('hides sidebar when showSidebar is false', () => {
      render(
        <Layout
          sidebar={<div>Sidebar Content</div>}
          showSidebar={false}
        />
      )

      expect(screen.queryByText('Sidebar Content')).not.toBeInTheDocument()
    })

    it('shows sidebar by default when sidebar content is provided', () => {
      render(<Layout sidebar={<div>Sidebar Content</div>} />)

      expect(screen.getByText('Sidebar Content')).toBeInTheDocument()
    })

    it('hides bottom panel when showBottom is false', () => {
      render(
        <Layout
          bottom={<div>Bottom Content</div>}
          showBottom={false}
        />
      )

      expect(screen.queryByText('Bottom Content')).not.toBeInTheDocument()
    })

    it('shows bottom panel by default when bottom content is provided', () => {
      render(<Layout bottom={<div>Bottom Content</div>} />)

      expect(screen.getByText('Bottom Content')).toBeInTheDocument()
    })

    it('does not render sidebar even with showSidebar=true if no sidebar content', () => {
      const { container } = render(<Layout showSidebar={true} />)

      // aside element should not exist
      expect(container.querySelector('aside')).not.toBeInTheDocument()
    })

    it('does not render header if no header content is provided', () => {
      const { container } = render(<Layout />)

      expect(container.querySelector('header')).not.toBeInTheDocument()
    })
  })

  describe('CSS classes are applied correctly', () => {
    it('applies custom className to container', () => {
      const { container } = render(<Layout className="custom-layout" />)

      const layoutDiv = container.firstChild as HTMLElement
      expect(layoutDiv).toHaveClass('custom-layout')
    })

    it('applies base layout classes', () => {
      const { container } = render(<Layout />)

      const layoutDiv = container.firstChild as HTMLElement
      expect(layoutDiv).toHaveClass('flex')
      expect(layoutDiv).toHaveClass('flex-col')
      expect(layoutDiv).toHaveClass('h-full')
      expect(layoutDiv).toHaveClass('bg-white')
      expect(layoutDiv).toHaveClass('dark:bg-slate-900')
    })

    it('applies border class to header', () => {
      const { container } = render(<Layout header={<div>Header</div>} />)

      const header = container.querySelector('header')
      expect(header).toHaveClass('border-b')
      expect(header).toHaveClass('border-slate-200')
    })

    it('applies border class to sidebar', () => {
      const { container } = render(<Layout sidebar={<div>Sidebar</div>} />)

      const aside = container.querySelector('aside')
      expect(aside).toHaveClass('border-r')
      expect(aside).toHaveClass('border-slate-200')
    })

    it('applies correct width style to sidebar', () => {
      const { container } = render(
        <Layout sidebar={<div>Sidebar</div>} sidebarWidth={300} />
      )

      const aside = container.querySelector('aside')
      expect(aside).toHaveStyle({ width: '300px' })
    })

    it('applies correct height style to bottom panel', () => {
      const { container } = render(
        <Layout bottom={<div>Bottom</div>} bottomHeight={150} />
      )

      // Find the bottom panel (last child with height style)
      const bottomPanel = container.querySelector('.border-t.border-slate-200')
      expect(bottomPanel).toHaveStyle({ height: '150px' })
    })

    it('main section has correct structure', () => {
      const { container } = render(<Layout main={<div>Main</div>} />)

      const main = container.querySelector('main')
      expect(main).toHaveClass('flex-1')
      expect(main).toHaveClass('overflow-hidden')
    })
  })

  describe('initial dimensions', () => {
    it('uses default sidebar width of 256px', () => {
      const { container } = render(<Layout sidebar={<div>Sidebar</div>} />)

      const aside = container.querySelector('aside')
      expect(aside).toHaveStyle({ width: '256px' })
    })

    it('uses default bottom height of 200px', () => {
      const { container } = render(<Layout bottom={<div>Bottom</div>} />)

      const bottomPanel = container.querySelector('.border-t.border-slate-200')
      expect(bottomPanel).toHaveStyle({ height: '200px' })
    })

    it('respects custom initial sidebar width', () => {
      const { container } = render(
        <Layout sidebar={<div>Sidebar</div>} sidebarWidth={400} />
      )

      const aside = container.querySelector('aside')
      expect(aside).toHaveStyle({ width: '400px' })
    })

    it('respects custom initial bottom height', () => {
      const { container } = render(
        <Layout bottom={<div>Bottom</div>} bottomHeight={300} />
      )

      const bottomPanel = container.querySelector('.border-t.border-slate-200')
      expect(bottomPanel).toHaveStyle({ height: '300px' })
    })
  })

  describe('resize handles', () => {
    it('renders sidebar resize handle when sidebar is visible', () => {
      const { container } = render(<Layout sidebar={<div>Sidebar</div>} />)

      const resizeHandle = container.querySelector('.cursor-col-resize')
      expect(resizeHandle).toBeInTheDocument()
    })

    it('does not render sidebar resize handle when sidebar is hidden', () => {
      const { container } = render(
        <Layout sidebar={<div>Sidebar</div>} showSidebar={false} />
      )

      const resizeHandle = container.querySelector('.cursor-col-resize')
      expect(resizeHandle).not.toBeInTheDocument()
    })

    it('renders bottom resize handle when bottom panel is visible', () => {
      const { container } = render(<Layout bottom={<div>Bottom</div>} />)

      const resizeHandle = container.querySelector('.cursor-row-resize')
      expect(resizeHandle).toBeInTheDocument()
    })

    it('does not render bottom resize handle when bottom panel is hidden', () => {
      const { container } = render(
        <Layout bottom={<div>Bottom</div>} showBottom={false} />
      )

      const resizeHandle = container.querySelector('.cursor-row-resize')
      expect(resizeHandle).not.toBeInTheDocument()
    })
  })
})
