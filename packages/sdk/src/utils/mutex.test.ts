import { describe, it, expect } from 'vitest'
import { AsyncMutex } from './mutex'

describe('AsyncMutex', () => {
  it('allows single acquisition', async () => {
    const mutex = new AsyncMutex()
    const release = await mutex.acquire()
    expect(release).toBeInstanceOf(Function)
    release()
  })

  it('serializes concurrent acquisitions', async () => {
    const mutex = new AsyncMutex()
    const order: number[] = []

    const task1 = mutex.acquire().then(release => {
      order.push(1)
      return new Promise<void>(resolve => {
        setTimeout(() => {
          order.push(2)
          release()
          resolve()
        }, 10)
      })
    })

    const task2 = mutex.acquire().then(release => {
      order.push(3)
      release()
    })

    await Promise.all([task1, task2])

    // Task 2 should wait for task 1 to complete
    expect(order).toEqual([1, 2, 3])
  })

  it('handles multiple waiters', async () => {
    const mutex = new AsyncMutex()
    const results: number[] = []

    const tasks = [1, 2, 3, 4, 5].map(async (n) => {
      const release = await mutex.acquire()
      results.push(n)
      await new Promise(r => setTimeout(r, 5))
      release()
    })

    await Promise.all(tasks)

    // All tasks should complete
    expect(results.length).toBe(5)
  })

  it('allows reacquisition after release', async () => {
    const mutex = new AsyncMutex()

    const release1 = await mutex.acquire()
    release1()

    const release2 = await mutex.acquire()
    release2()

    expect(true).toBe(true) // If we get here, it works
  })
})
