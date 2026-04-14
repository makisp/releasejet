import type { Hook } from './types.js';

export class HookRegistry<T> implements Hook<T> {
  private listeners: Array<(payload: T) => void | Promise<void>> = [];

  on(listener: (payload: T) => void | Promise<void>): void {
    this.listeners.push(listener);
  }

  async run(payload: T): Promise<void> {
    for (const listener of this.listeners) {
      await listener(payload);
    }
  }
}
