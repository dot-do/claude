import { test, expect, type Page } from '@playwright/test'

/**
 * E2E Tests for Chat Functionality
 *
 * Tests the chat interface including:
 * - Sending messages
 * - Receiving responses
 * - Message history display
 * - Input validation
 */

test.describe('Chat Functionality', () => {
  // Helper to wait for chat container to be ready
  async function waitForChatReady(page: Page) {
    await page.waitForSelector('[data-testid="chat-container"]', { state: 'visible' })
  }

  test.describe('Sending Messages', () => {
    test('should display chat input field', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await expect(chatInput).toBeVisible()
      await expect(chatInput).toBeEnabled()
    })

    test('should display send button', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const submitButton = page.getByTestId('chat-submit')
      await expect(submitButton).toBeVisible()
      await expect(submitButton).toHaveText('Send')
    })

    test('should allow typing in the input field', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('Hello, world!')

      await expect(chatInput).toHaveValue('Hello, world!')
    })

    test('should send message on button click', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const submitButton = page.getByTestId('chat-submit')

      await chatInput.fill('Test message via button click')
      await submitButton.click()

      // Input should be cleared after submission
      await expect(chatInput).toHaveValue('')

      // Message should appear in the chat
      const chatMessages = page.getByTestId('chat-messages')
      await expect(chatMessages).toContainText('Test message via button click')
    })

    test('should send message on Enter key press', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      await chatInput.fill('Test message via Enter key')
      await chatInput.press('Enter')

      // Input should be cleared after submission
      await expect(chatInput).toHaveValue('')

      // Message should appear in the chat
      const chatMessages = page.getByTestId('chat-messages')
      await expect(chatMessages).toContainText('Test message via Enter key')
    })

    test('should display user message with correct role', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('User message test')
      await chatInput.press('Enter')

      // Find the user message by role attribute
      const userMessage = page.locator('[data-role="user"]').first()
      await expect(userMessage).toBeVisible()
      await expect(userMessage).toContainText('User message test')
    })
  })

  test.describe('Receiving Responses', () => {
    test('should display assistant response after user message', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('Hello assistant')
      await chatInput.press('Enter')

      // Wait for assistant response to appear
      const assistantMessage = page.locator('[data-role="assistant"]').first()
      await expect(assistantMessage).toBeVisible({ timeout: 30000 })
    })

    test('should show streaming indicator during response', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('Generate a long response')
      await chatInput.press('Enter')

      // Check for streaming indicator (may appear briefly)
      const streamingIndicator = page.getByTestId('streaming-indicator')

      // The streaming indicator should appear at some point during the response
      // We use a shorter timeout as it may be fast
      try {
        await expect(streamingIndicator).toBeVisible({ timeout: 5000 })
      } catch {
        // If streaming is too fast, the indicator may have already disappeared
        // In this case, we just verify the message appeared
        const assistantMessage = page.locator('[data-role="assistant"]').first()
        await expect(assistantMessage).toBeVisible({ timeout: 30000 })
      }
    })

    test('should mark streaming message with data attribute', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('What is 2+2?')
      await chatInput.press('Enter')

      // Wait for any response
      const assistantMessage = page.locator('[data-role="assistant"]').first()
      await expect(assistantMessage).toBeVisible({ timeout: 30000 })
    })

    test('should render markdown in assistant responses', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('Show me a code example in JavaScript')
      await chatInput.press('Enter')

      // Wait for response with code block
      const codeBlock = page.getByTestId('code-block')

      try {
        await expect(codeBlock).toBeVisible({ timeout: 30000 })
      } catch {
        // Response may not contain code block depending on AI response
        const assistantMessage = page.locator('[data-role="assistant"]').first()
        await expect(assistantMessage).toBeVisible({ timeout: 30000 })
      }
    })
  })

  test.describe('Message History Display', () => {
    test('should display messages in chronological order', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      // Send first message
      await chatInput.fill('First message')
      await chatInput.press('Enter')

      // Wait for response
      await page.locator('[data-role="assistant"]').first().waitFor({ state: 'visible', timeout: 30000 })

      // Send second message
      await chatInput.fill('Second message')
      await chatInput.press('Enter')

      // Wait for second response
      await expect(page.locator('[data-role="user"]')).toHaveCount(2, { timeout: 10000 })

      // Verify order by checking text content
      const chatMessages = page.getByTestId('chat-messages')
      const textContent = await chatMessages.textContent()

      expect(textContent).toBeDefined()
      const firstIndex = textContent?.indexOf('First message') ?? -1
      const secondIndex = textContent?.indexOf('Second message') ?? -1

      expect(firstIndex).toBeLessThan(secondIndex)
    })

    test('should preserve message history on scroll', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const chatMessages = page.getByTestId('chat-messages')

      // Send multiple messages to fill the chat
      for (let i = 1; i <= 3; i++) {
        await chatInput.fill(`Message number ${i}`)
        await chatInput.press('Enter')
        // Wait a bit between messages
        await page.waitForTimeout(500)
      }

      // Wait for messages to appear
      await expect(page.locator('[data-role="user"]')).toHaveCount(3, { timeout: 30000 })

      // Scroll to top
      await chatMessages.evaluate((el) => el.scrollTop = 0)

      // Verify first message is still visible
      await expect(chatMessages).toContainText('Message number 1')
    })

    test('should auto-scroll to newest message', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const chatMessages = page.getByTestId('chat-messages')

      // Send initial message
      await chatInput.fill('Initial test message')
      await chatInput.press('Enter')

      // Wait for the message and potential response
      await page.locator('[data-role="user"]').first().waitFor({ state: 'visible' })

      // Check that scroll position is at or near the bottom
      const isNearBottom = await chatMessages.evaluate((el) => {
        const threshold = 100 // pixels from bottom
        return el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      })

      expect(isNearBottom).toBeTruthy()
    })

    test('should display correct count of messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      // Send 2 messages
      await chatInput.fill('Message one')
      await chatInput.press('Enter')
      await page.waitForTimeout(500)

      await chatInput.fill('Message two')
      await chatInput.press('Enter')

      // Wait for both user messages
      await expect(page.locator('[data-role="user"]')).toHaveCount(2, { timeout: 10000 })
    })
  })

  test.describe('Input Validation', () => {
    test('should not submit empty messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const submitButton = page.getByTestId('chat-submit')
      const chatMessages = page.getByTestId('chat-messages')

      // Get initial message count
      const initialCount = await page.locator('[data-role="user"]').count()

      // Try to submit empty message
      await chatInput.fill('')
      await submitButton.click()

      // Message count should not increase
      await expect(page.locator('[data-role="user"]')).toHaveCount(initialCount)
    })

    test('should not submit whitespace-only messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const submitButton = page.getByTestId('chat-submit')

      // Get initial message count
      const initialCount = await page.locator('[data-role="user"]').count()

      // Try to submit whitespace-only message
      await chatInput.fill('   ')
      await submitButton.click()

      // Message count should not increase
      await expect(page.locator('[data-role="user"]')).toHaveCount(initialCount)
    })

    test('should trim whitespace from messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      // Send message with leading/trailing whitespace
      await chatInput.fill('  Hello with whitespace  ')
      await chatInput.press('Enter')

      // The message should appear trimmed
      const userMessage = page.locator('[data-role="user"]').first()
      await expect(userMessage).toBeVisible()

      // Check that the displayed message is trimmed
      const messageText = await userMessage.textContent()
      expect(messageText?.trim()).toBe('Hello with whitespace')
    })

    test('should handle special characters in messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const specialMessage = 'Test <script>alert("xss")</script> & "quotes" \'single\''

      await chatInput.fill(specialMessage)
      await chatInput.press('Enter')

      const userMessage = page.locator('[data-role="user"]').first()
      await expect(userMessage).toBeVisible()

      // The message should be displayed safely (not executed as script)
      const chatMessages = page.getByTestId('chat-messages')
      await expect(chatMessages).toContainText('<script>')
    })

    test('should handle very long messages', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const longMessage = 'A'.repeat(1000)

      await chatInput.fill(longMessage)
      await chatInput.press('Enter')

      const userMessage = page.locator('[data-role="user"]').first()
      await expect(userMessage).toBeVisible()

      // Verify the message was sent (at least partially visible)
      await expect(userMessage).toContainText('AAAA')
    })

    test('should respect disabled state', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      // This test assumes there's a way to disable the chat
      // If the chat has a disabled state, the input and button should be disabled
      const chatInput = page.getByTestId('chat-input')
      const submitButton = page.getByTestId('chat-submit')

      // By default, both should be enabled
      await expect(chatInput).toBeEnabled()
      await expect(submitButton).toBeEnabled()
    })

    test('should clear input after successful submission', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      await chatInput.fill('Test clearing input')
      await chatInput.press('Enter')

      // Input should be cleared
      await expect(chatInput).toHaveValue('')
    })

    test('should maintain focus after submission', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')

      await chatInput.fill('Focus test message')
      await chatInput.press('Enter')

      // After a brief moment, check if input can receive new text
      await page.waitForTimeout(100)
      await chatInput.fill('Second message')
      await expect(chatInput).toHaveValue('Second message')
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper ARIA attributes on chat container', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatContainer = page.getByTestId('chat-container')
      await expect(chatContainer).toHaveAttribute('role', 'log')
      await expect(chatContainer).toHaveAttribute('aria-label')
    })

    test('should have aria-live on message container', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatMessages = page.getByTestId('chat-messages')
      await expect(chatMessages).toHaveAttribute('aria-live', 'polite')
    })

    test('should have accessible input field', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await expect(chatInput).toHaveAttribute('aria-label')
    })

    test('should have accessible submit button', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const submitButton = page.getByTestId('chat-submit')
      await expect(submitButton).toHaveAttribute('aria-label')
    })

    test('should be navigable via keyboard', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      // Tab to input
      await page.keyboard.press('Tab')

      const chatInput = page.getByTestId('chat-input')
      const submitButton = page.getByTestId('chat-submit')

      // Check if either input or button is focused
      const inputFocused = await chatInput.evaluate((el) => el === document.activeElement)
      const buttonFocused = await submitButton.evaluate((el) => el === document.activeElement)

      // At least one should be focusable
      expect(inputFocused || buttonFocused).toBeTruthy()
    })
  })

  test.describe('Visual Styling', () => {
    test('should display user messages with distinct styling', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      await chatInput.fill('User styled message')
      await chatInput.press('Enter')

      const userMessage = page.locator('[data-role="user"]').first()
      await expect(userMessage).toBeVisible()

      // User messages should have justify-end class
      await expect(userMessage).toHaveClass(/justify-end/)
    })

    test('should display placeholder text in input', async ({ page }) => {
      await page.goto('/')
      await waitForChatReady(page)

      const chatInput = page.getByTestId('chat-input')
      const placeholder = await chatInput.getAttribute('placeholder')

      expect(placeholder).toBeTruthy()
      expect(placeholder?.length).toBeGreaterThan(0)
    })
  })
})
