import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReconnectionPolicy } from './reconnect'

describe('ReconnectionPolicy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates increasing delays', () => {
    const policy = new ReconnectionPolicy()

    expect(policy.getNextDelay()).toBeLessThanOrEqual(2000) // ~1s + jitter
    policy.recordAttempt()
    expect(policy.getNextDelay()).toBeLessThanOrEqual(3000) // ~2s + jitter
    policy.recordAttempt()
    expect(policy.getNextDelay()).toBeLessThanOrEqual(5000) // ~4s + jitter
  })

  it('caps delay at maximum', () => {
    const policy = new ReconnectionPolicy({ maxDelay: 5000 })

    // Make many attempts
    for (let i = 0; i < 10; i++) {
      policy.recordAttempt()
    }

    expect(policy.getNextDelay()).toBeLessThanOrEqual(6000) // max + jitter
  })

  it('resets after success', () => {
    const policy = new ReconnectionPolicy()

    policy.recordAttempt()
    policy.recordAttempt()
    policy.recordAttempt()

    policy.reset()

    expect(policy.getNextDelay()).toBeLessThanOrEqual(2000) // Back to ~1s
  })

  it('tracks attempt count', () => {
    const policy = new ReconnectionPolicy()

    expect(policy.attempts).toBe(0)
    policy.recordAttempt()
    expect(policy.attempts).toBe(1)
    policy.recordAttempt()
    expect(policy.attempts).toBe(2)
  })

  it('shouldRetry respects maxAttempts', () => {
    const policy = new ReconnectionPolicy({ maxAttempts: 3 })

    expect(policy.shouldRetry()).toBe(true)
    policy.recordAttempt()
    expect(policy.shouldRetry()).toBe(true)
    policy.recordAttempt()
    expect(policy.shouldRetry()).toBe(true)
    policy.recordAttempt()
    expect(policy.shouldRetry()).toBe(false)
  })
})
