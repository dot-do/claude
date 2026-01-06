/**
 * Simple async mutex for serializing access to resources.
 */
export class AsyncMutex {
  private locked = false
  private queue: Array<() => void> = []

  /**
   * Acquire the lock. Returns a release function.
   * If lock is held, waits until it becomes available.
   */
  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true
      return () => this.release()
    }

    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        this.locked = true
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.locked = false
    }
  }
}
