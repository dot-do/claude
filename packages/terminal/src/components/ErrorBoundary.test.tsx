import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from './ErrorBoundary'

// Suppress React error logging in tests
const originalError = console.error
beforeAll(() => {
  console.error = vi.fn()
})
afterAll(() => {
  console.error = originalError
})

const ThrowingComponent = () => {
  throw new Error('Test error')
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary fallback={<div>Error</div>}>
        <div>Working component</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Working component')).toBeInTheDocument()
  })

  it('renders fallback when error occurs', () => {
    render(
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('calls onError when error occurs', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary fallback={<div>Error</div>} onError={onError}>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    expect(onError).toHaveBeenCalled()
  })

  it('provides reset function in fallback render prop', () => {
    let shouldThrow = true
    const MaybeThrow = () => {
      if (shouldThrow) throw new Error('Error')
      return <div>Recovered</div>
    }

    render(
      <ErrorBoundary
        fallback={({ reset }) => (
          <button onClick={() => { shouldThrow = false; reset() }}>
            Retry
          </button>
        )}
      >
        <MaybeThrow />
      </ErrorBoundary>
    )

    expect(screen.getByText('Retry')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Retry'))

    expect(screen.getByText('Recovered')).toBeInTheDocument()
  })
})
