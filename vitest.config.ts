import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  plugins: [
    {
      name: 'hbs-loader',
      transform(_code: string, id: string) {
        if (id.endsWith('.hbs')) {
          const content = readFileSync(id, 'utf-8');
          return { code: `export default ${JSON.stringify(content)};` };
        }
      },
    },
  ],
  test: {
    globals: true,
  },
});
