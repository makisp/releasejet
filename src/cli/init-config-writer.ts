import type { ClientConfig } from '../types.js';

export interface InitAnswers {
  providerType: 'github' | 'gitlab';
  providerUrl: string;
  /** Set only when providerType === 'github'. */
  source?: 'issues' | 'pull_requests';
  /** Empty array for single-client repos. */
  clients: ClientConfig[];
  tagFormat: string;
  /** Insertion order is preserved in output. */
  categories: Record<string, string>;
  uncategorized: 'lenient' | 'strict';
  contributors: { enabled: boolean; exclude: string[] };
}

export function buildConfigYaml(_answers: InitAnswers): string {
  throw new Error('not implemented');
}
