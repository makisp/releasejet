# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ReleaseJet is a CLI tool that generates categorized release notes from GitLab/GitHub issues or pull requests. It parses git tags to determine version ranges, fetches closed issues between tags, categorizes them by label mappings from a YAML config, and publishes formatted markdown release notes.

## Commands

```bash
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npx vitest run tests/core/tag-parser.test.ts  # Single test file
npm run build         # Bundle with tsup → dist/cli.js
npm run dev           # Run CLI in dev mode via tsx
npm run dev -- generate --tag v1.0.0  # Run a specific command in dev
```

## Architecture

**Provider pattern** — `ProviderClient` interface (`src/providers/types.ts`) abstracts GitHub and GitLab APIs. Factory in `src/providers/factory.ts` selects the implementation.

**Pipeline flow:** CLI command → parse tag → find previous tag (same prefix, lower semver) → fetch issues closed between tags → categorize by label → format markdown → optionally publish release.

**Key modules:**
- `src/cli/` — Commander commands (generate, init, validate, ci) and auth token resolution
- `src/core/config.ts` — YAML config loading with default merging
- `src/core/tag-parser.ts` — Parses tags using configurable `tagFormat` patterns; supports `{prefix}` and `{version}` placeholders with legacy fallback for `<prefix>-v<semver>` and `v<semver>`
- `src/core/issue-collector.ts` — Fetches and filters issues client-side by `closedAt` (API `updatedAfter` is unreliable)
- `src/core/formatter.ts` — Markdown generation with category sections in config-defined order
- `src/github/client.ts` / `src/gitlab/client.ts` — Provider implementations using Octokit and Gitbeaker

## Key Design Decisions

- **ESM-only** (`"type": "module"`) — all internal imports use `.js` extensions
- **Client-side date filtering** — APIs only support `updatedAfter`, so issues are fetched broadly then filtered by `closedAt` for accuracy
- **Non-greedy prefix parsing** — `(.+?)-v` handles hyphenated prefixes like `my-app-v1.0.0`
- **Semver coercion** — tags like `v1.2.3-beta` are coerced to core semver for comparison
- **Category order preserved** — output sections follow the order defined in the YAML config, not alphabetical
- **`__VERSION__`** — tsup injects this global from package.json at build time

## Config

The tool reads `.releasejet.yml` in the project root. See `.releasejet.example.yml` for the schema. Key fields: `provider.type` (gitlab/github), `source` (issues/pull_requests), `clients[]` (prefix + label), `categories` (label→heading map), `uncategorized` (strict/lenient).

## CI/CD

- **CI** (`.github/workflows/ci.yml`): test + build on push/PR to main
- **Publish** (`.github/workflows/publish.yml`): npm publish with OIDC provenance on GitHub Release
- Node 20, npm with package cache

## Post Implementation Steps

- Do not auto commit changes
- Update application version accordinly
- Update CLAUDE.MD / README.MD / CHANGELOG.MD as needed
