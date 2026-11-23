export interface TaskContext {
  signal: AbortSignal;
  taskId: string;
}

export interface TaskHandler<T> {
  (context: TaskContext): Promise<T>;
}

export interface TaskLock {
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export class InMemoryTaskLock implements TaskLock {
  private readonly held = new Set<string>();
  async acquire(key: string) {
    if (this.held.has(key)) return false;
    this.held.add(key);
    return true;
  }
  async release(key: string) {
    this.held.delete(key);
  }
  isLocked(key: string) {
    return this.held.has(key);
  }
}

export interface ExecuteOptions {
  taskId: string;
  lockKey?: string;
  lockKeys?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Runs one task with cancellation, timeout, and pluggable resource locks. */
export class TaskExecutor {
  private readonly active = new Map<string, AbortController>();
  constructor(private readonly lock: TaskLock = new InMemoryTaskLock()) {}

  async execute<T>(handler: TaskHandler<T>, options: ExecuteOptions): Promise<T> {
    const keys = [
      ...new Set(
        options.lockKeys?.length
          ? options.lockKeys
          : [options.lockKey ?? options.taskId]
      ),
    ].sort();

    const acquired: string[] = [];
    for (const key of keys) {
      if (!(await this.lock.acquire(key))) {
        for (const heldKey of acquired.reverse()) {
          await this.lock.release(heldKey);
        }
        throw new Error(`task lock is held: ${key}`);
      }
      acquired.push(key);
    }

    const controller = new AbortController();
    this.active.set(options.taskId, controller);
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal;
    const timeout = options.timeoutMs
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : undefined;

    try {
      return await handler({ signal, taskId: options.taskId });
    } catch (error) {
      if (signal.aborted) {
        throw new Error(`task ${options.taskId} cancelled or timed out`);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      this.active.delete(options.taskId);
      for (const heldKey of acquired.reverse()) {
        await this.lock.release(heldKey);
      }
    }
  }

  cancel(taskId: string): boolean {
    const controller = this.active.get(taskId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  cancelAll(): void {
    for (const controller of this.active.values()) {
      controller.abort();
    }
  }

  isRunning(taskId: string): boolean {
    return this.active.has(taskId);
  }

  activeCount(): number {
    return this.active.size;
  }
}
