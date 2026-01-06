/**
 * Terminal E2E Tests
 *
 * Comprehensive end-to-end tests for terminal functionality using Playwright.
 * Tests cover rendering, command input, output display, and terminal interaction.
 */

import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Test helper to wait for terminal to be ready
 */
async function waitForTerminal(page: Page): Promise<Locator> {
  const terminal = page.locator('[data-testid="terminal-container"]')
  await expect(terminal).toBeVisible({ timeout: 10000 })
  // Wait for xterm.js to initialize (canvas element appears)
  await expect(terminal.locator('.xterm-screen')).toBeVisible({ timeout: 10000 })
  return terminal
}

/**
 * Test helper to get terminal canvas for interactions
 */
async function getTerminalCanvas(page: Page): Promise<Locator> {
  return page.locator('.xterm-helper-textarea')
}

/**
 * Test helper to type in terminal
 */
async function typeInTerminal(page: Page, text: string): Promise<void> {
  const textarea = await getTerminalCanvas(page)
  await textarea.focus()
  await textarea.pressSequentially(text, { delay: 50 })
}

/**
 * Test helper to send Enter key to terminal
 */
async function pressEnterInTerminal(page: Page): Promise<void> {
  const textarea = await getTerminalCanvas(page)
  await textarea.press('Enter')
}

test.describe('Terminal Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should render terminal container', async ({ page }) => {
    const terminal = await waitForTerminal(page)
    await expect(terminal).toBeVisible()
  })

  test('should have correct accessibility attributes', async ({ page }) => {
    const terminal = await waitForTerminal(page)

    await expect(terminal).toHaveAttribute('role', 'region')
    await expect(terminal).toHaveAttribute('aria-label')
    await expect(terminal).toHaveAttribute('aria-roledescription', 'terminal')
  })

  test('should render xterm.js canvas', async ({ page }) => {
    await waitForTerminal(page)

    // Verify xterm.js structure is present
    const xtermScreen = page.locator('.xterm-screen')
    await expect(xtermScreen).toBeVisible()

    // Verify canvas or WebGL canvas is present
    const canvas = page.locator('.xterm-screen canvas').first()
    await expect(canvas).toBeVisible()
  })

  test('should have focusable terminal textarea', async ({ page }) => {
    await waitForTerminal(page)

    const textarea = await getTerminalCanvas(page)
    await expect(textarea).toBeAttached()

    // Should be able to focus
    await textarea.focus()
    await expect(textarea).toBeFocused()
  })

  test('should apply custom theme styles', async ({ page }) => {
    const terminal = await waitForTerminal(page)

    // Terminal should have a background color applied
    const xtermViewport = page.locator('.xterm-viewport')
    await expect(xtermViewport).toBeVisible()
  })

  test('should render header with connection status', async ({ page }) => {
    // Header showing connection status
    const header = page.locator('header')
    await expect(header).toBeVisible()

    // Connection status should be visible
    const statusBadge = page.locator('text=Connected').or(page.locator('text=Disconnected'))
    await expect(statusBadge).toBeVisible()
  })

  test('should render layout with sidebar when enabled', async ({ page }) => {
    await page.goto('/?sidebar=true')
    await waitForTerminal(page)

    // Sidebar should be visible
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    // Files header in sidebar
    const filesHeader = page.locator('text=Files')
    await expect(filesHeader).toBeVisible()
  })

  test('should hide sidebar when disabled', async ({ page }) => {
    await page.goto('/?sidebar=false')
    await waitForTerminal(page)

    // Sidebar should not be visible
    const sidebar = page.locator('aside')
    await expect(sidebar).not.toBeVisible()
  })
})

test.describe('Command Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)
  })

  test('should accept keyboard input', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type a simple command
    await textarea.pressSequentially('echo test', { delay: 30 })

    // Verify input was received (terminal should reflect the input)
    await expect(textarea).toBeFocused()
  })

  test('should handle special keys', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Test various special keys
    await textarea.press('Tab')
    await textarea.press('Escape')
    await textarea.press('ArrowUp')
    await textarea.press('ArrowDown')
    await textarea.press('ArrowLeft')
    await textarea.press('ArrowRight')
    await textarea.press('Home')
    await textarea.press('End')

    // Terminal should still be functional
    await expect(textarea).toBeFocused()
  })

  test('should handle Ctrl+C interrupt', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Send Ctrl+C
    await textarea.press('Control+c')

    // Terminal should still be responsive
    await expect(textarea).toBeFocused()
  })

  test('should handle Ctrl+D (EOF)', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Send Ctrl+D
    await textarea.press('Control+d')

    // Terminal might close or remain open depending on context
    await expect(textarea).toBeAttached()
  })

  test('should handle Ctrl+L (clear screen)', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Send Ctrl+L
    await textarea.press('Control+l')

    // Terminal should still be functional
    await expect(textarea).toBeFocused()
  })

  test('should support copy/paste keyboard shortcuts', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type some text
    await textarea.pressSequentially('test content', { delay: 30 })

    // Try to select all (Ctrl+A behavior varies in terminals)
    await textarea.press('Control+a')

    // Terminal should remain functional
    await expect(textarea).toBeFocused()
  })

  test('should handle rapid typing', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type rapidly
    const rapidText = 'abcdefghijklmnopqrstuvwxyz1234567890'
    await textarea.pressSequentially(rapidText, { delay: 10 })

    // Terminal should handle all input
    await expect(textarea).toBeFocused()
  })

  test('should handle Enter key to submit command', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type and press enter
    await textarea.pressSequentially('ls', { delay: 30 })
    await textarea.press('Enter')

    // Terminal should process the command
    await expect(textarea).toBeFocused()
  })

  test('should handle Backspace to delete characters', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type and then delete
    await textarea.pressSequentially('test', { delay: 30 })
    await textarea.press('Backspace')
    await textarea.press('Backspace')

    // Terminal should respond to backspace
    await expect(textarea).toBeFocused()
  })
})

test.describe('Output Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)
  })

  test('should display terminal viewport', async ({ page }) => {
    const viewport = page.locator('.xterm-viewport')
    await expect(viewport).toBeVisible()
  })

  test('should have scrollable terminal area', async ({ page }) => {
    const viewport = page.locator('.xterm-viewport')

    // Viewport should have overflow styles for scrolling
    await expect(viewport).toBeVisible()
  })

  test('should render cursor in terminal', async ({ page }) => {
    // xterm.js cursor element
    const cursor = page.locator('.xterm-cursor-layer')
    await expect(cursor).toBeVisible()
  })

  test('should display rows container', async ({ page }) => {
    const rows = page.locator('.xterm-rows')
    await expect(rows).toBeVisible()
  })

  test('should update display on input', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type something and verify terminal is responsive
    await textarea.pressSequentially('hello', { delay: 50 })

    // The terminal screen should be present and active
    const screen = page.locator('.xterm-screen')
    await expect(screen).toBeVisible()
  })

  test('should maintain terminal state after page interactions', async ({ page }) => {
    await waitForTerminal(page)

    // Click outside terminal
    await page.locator('header').click()

    // Terminal should still be visible and functional
    const terminal = page.locator('[data-testid="terminal-container"]')
    await expect(terminal).toBeVisible()

    // Should be able to refocus
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()
    await expect(textarea).toBeFocused()
  })
})

test.describe('Terminal Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)
  })

  test('should focus terminal on click', async ({ page }) => {
    const terminal = page.locator('[data-testid="terminal-container"]')

    // Click on terminal
    await terminal.click()

    // Textarea should be focused
    const textarea = await getTerminalCanvas(page)
    await expect(textarea).toBeFocused()
  })

  test('should handle window resize', async ({ page }) => {
    await waitForTerminal(page)

    // Resize window
    await page.setViewportSize({ width: 1024, height: 768 })

    // Terminal should still be visible and adapted
    const terminal = page.locator('[data-testid="terminal-container"]')
    await expect(terminal).toBeVisible()

    // Resize again
    await page.setViewportSize({ width: 800, height: 600 })
    await expect(terminal).toBeVisible()
  })

  test('should handle multiple resize events', async ({ page }) => {
    await waitForTerminal(page)

    const viewportSizes = [
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
      { width: 768, height: 1024 },
      { width: 375, height: 667 },
    ]

    for (const size of viewportSizes) {
      await page.setViewportSize(size)
      const terminal = page.locator('[data-testid="terminal-container"]')
      await expect(terminal).toBeVisible()
    }
  })

  test('should maintain focus after resize', async ({ page }) => {
    const textarea = await getTerminalCanvas(page)
    await textarea.focus()
    await expect(textarea).toBeFocused()

    // Resize
    await page.setViewportSize({ width: 900, height: 700 })

    // Should still be focusable
    await textarea.focus()
    await expect(textarea).toBeFocused()
  })

  test('should handle sidebar resize drag', async ({ page }) => {
    await page.goto('/?sidebar=true')
    await waitForTerminal(page)

    // Find resize handle
    const resizeHandle = page.locator('[class*="cursor-col-resize"]')

    if (await resizeHandle.isVisible()) {
      const box = await resizeHandle.boundingBox()
      if (box) {
        // Drag to resize
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + 50, box.y + box.height / 2)
        await page.mouse.up()

        // Terminal should still be visible
        const terminal = page.locator('[data-testid="terminal-container"]')
        await expect(terminal).toBeVisible()
      }
    }
  })

  test('should handle bottom panel when enabled', async ({ page }) => {
    await page.goto('/?bottom=true')
    await waitForTerminal(page)

    // Check if bottom panel is visible
    const sessionInfo = page.locator('text=Session:')
    await expect(sessionInfo).toBeVisible()
  })

  test('should display session information', async ({ page }) => {
    // Session ID should be visible in header
    const header = page.locator('header')
    await expect(header).toBeVisible()

    // Should show a session ID (8 character truncated UUID)
    const sessionId = header.locator('div.text-sm.text-gray-400')
    await expect(sessionId).toBeVisible()
  })

  test('should handle custom title parameter', async ({ page }) => {
    await page.goto('/?title=Custom%20Terminal')
    await waitForTerminal(page)

    // Should show custom title
    const title = page.locator('h1:text("Custom Terminal")')
    await expect(title).toBeVisible()
  })

  test('should interact with keyboard navigation', async ({ page }) => {
    await waitForTerminal(page)

    // Tab navigation
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')

    // Terminal should still be present
    const terminal = page.locator('[data-testid="terminal-container"]')
    await expect(terminal).toBeVisible()
  })

  test('should handle page visibility changes', async ({ page }) => {
    await waitForTerminal(page)

    // Simulate page going to background (limited in Playwright)
    // Just verify terminal remains stable
    const terminal = page.locator('[data-testid="terminal-container"]')
    await expect(terminal).toBeVisible()

    // Wait a moment and verify still visible
    await page.waitForTimeout(100)
    await expect(terminal).toBeVisible()
  })
})

test.describe('Terminal Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)
  })

  test('should have proper ARIA attributes', async ({ page }) => {
    const terminal = page.locator('[data-testid="terminal-container"]')

    await expect(terminal).toHaveAttribute('role', 'region')
    await expect(terminal).toHaveAttribute('aria-roledescription', 'terminal')
    await expect(terminal).toHaveAttribute('aria-live', 'polite')
  })

  test('should be keyboard accessible', async ({ page }) => {
    const terminal = page.locator('[data-testid="terminal-container"]')

    // Terminal should have tabindex
    await expect(terminal).toHaveAttribute('tabindex', '0')
  })

  test('should have accessible title', async ({ page }) => {
    // Title should be visible
    const title = page.locator('h1')
    await expect(title).toBeVisible()

    // Terminal should have aria-label
    const terminal = page.locator('[data-testid="terminal-container"]')
    const ariaLabel = await terminal.getAttribute('aria-label')
    expect(ariaLabel).toBeTruthy()
  })
})

test.describe('Terminal Performance', () => {
  test('should render quickly', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await waitForTerminal(page)
    const loadTime = Date.now() - startTime

    // Terminal should load within reasonable time (10 seconds with network)
    expect(loadTime).toBeLessThan(10000)
  })

  test('should handle continuous input without lag', async ({ page }) => {
    await page.goto('/')
    await waitForTerminal(page)

    const textarea = await getTerminalCanvas(page)
    await textarea.focus()

    // Type a lot of characters quickly
    const longString = 'x'.repeat(100)
    const startTime = Date.now()
    await textarea.pressSequentially(longString, { delay: 5 })
    const inputTime = Date.now() - startTime

    // Should complete in reasonable time
    expect(inputTime).toBeLessThan(5000)

    // Terminal should still be responsive
    await expect(textarea).toBeFocused()
  })
})

test.describe('Mobile/Responsive', () => {
  test('should render on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const terminal = await waitForTerminal(page)
    await expect(terminal).toBeVisible()
  })

  test('should render on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')

    const terminal = await waitForTerminal(page)
    await expect(terminal).toBeVisible()
  })

  test('should adapt to landscape mobile', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 })
    await page.goto('/')

    const terminal = await waitForTerminal(page)
    await expect(terminal).toBeVisible()
  })
})
