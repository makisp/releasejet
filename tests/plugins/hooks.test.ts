import { describe, it, expect, vi } from 'vitest';
import { HookRegistry } from '../../src/plugins/hooks.js';

describe('HookRegistry', () => {
  it('fires a registered listener with the payload', async () => {
    const hook = new HookRegistry<{ value: number }>();
    const listener = vi.fn();

    hook.on(listener);
    await hook.run({ value: 42 });

    expect(listener).toHaveBeenCalledWith({ value: 42 });
  });

  it('fires multiple listeners in registration order', async () => {
    const hook = new HookRegistry<{ value: number }>();
    const order: number[] = [];

    hook.on(async () => { order.push(1); });
    hook.on(async () => { order.push(2); });
    hook.on(async () => { order.push(3); });

    await hook.run({ value: 0 });

    expect(order).toEqual([1, 2, 3]);
  });

  it('does nothing when no listeners are registered', async () => {
    const hook = new HookRegistry<{ value: number }>();
    await hook.run({ value: 0 });
  });

  it('awaits async listeners sequentially', async () => {
    const hook = new HookRegistry<{ value: string }>();
    const order: string[] = [];

    hook.on(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('slow');
    });
    hook.on(async () => {
      order.push('fast');
    });

    await hook.run({ value: '' });

    expect(order).toEqual(['slow', 'fast']);
  });
});
