import type { FormatterFn } from './types.js';
import type { ReleaseNotesData, ReleaseJetConfig } from '../types.js';

export class FormatterRegistry {
  private formatters = new Map<string, FormatterFn>();

  register(name: string, fn: FormatterFn): void {
    this.formatters.set(name, fn);
  }

  has(name: string): boolean {
    return this.formatters.has(name);
  }

  run(name: string, data: ReleaseNotesData, config: ReleaseJetConfig): string {
    const fn = this.formatters.get(name);
    if (!fn) {
      throw new Error(`Template "${name}" not found.`);
    }
    return fn(data, config);
  }
}
