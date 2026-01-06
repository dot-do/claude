import { Component, ErrorInfo, ReactNode } from 'react'

interface FallbackProps {
  error: Error
  reset: () => void
}

interface Props {
  children: ReactNode
  fallback: ReactNode | ((props: FallbackProps) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches errors in child components
 * and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props
      if (typeof fallback === 'function') {
        return fallback({ error: this.state.error, reset: this.reset })
      }
      return fallback
    }
    return this.props.children
  }
}
