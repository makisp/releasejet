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
- `src/cli/init-config-writer.ts` — Renders `.releasejet.yml` for the `init` command via per-section helpers (`projectNameSection`, `providerSection`, etc.) joined by blank lines. Each non-Pro feature is surfaced with a block comment and inline value hint, even when off, for in-file discoverability.
- `src/cli/credentials-store.ts` — single-source-of-truth module for `~/.releasejet/credentials.yml`. Handles read/write/classify (`Entry`, `EntryKind`) and exposes the six-step resolution chain as `resolveTokenChain` returning `ChainStep[]`. Used by `src/cli/auth.ts` (thin wrappers) and the `auth list-tokens` / `remove-token` / `show-token` / `migrate-tokens` commands.
- `src/core/config.ts` — YAML config loading with default merging
- `src/core/tag-parser.ts` — Parses tags using configurable `tagFormat` patterns; supports `{prefix}` and `{version}` placeholders with legacy fallback for `<prefix>-v<semver>` and `v<semver>`
- `src/core/issue-collector.ts` — Fetches and filters issues client-side by `closedAt` (API `updatedAfter` is unreliable)
- `src/core/formatter.ts` — Markdown generation with category sections in config-defined order
- `src/github/client.ts` / `src/gitlab/client.ts` — Provider implementations using Octokit and Gitbeaker

## Key Design Decisions

- **ESM-only** (`"type": "module"`) — all internal imports use `.js` extensions
- **Client-side date filtering** — APIs only support `updatedAfter`, so issues are fetched broadly then filtered by `closedAt` for accuracy
- **Non-greedy prefix parsing** — `(.+?)-v` handles hyphenated prefixes like `my-app-v1.0.0`
- **`legacyTagFormats` for format migration** — `parseTag(tag, tagFormat, legacyTagFormats?)` tries the current format first, then each legacy pattern; a *clean* parse (no leftover suffix) under any configured format wins, so tags written under an old format (e.g. `{prefix}-v{version}-version`) are recognised as full releases (`suffix: null`) instead of being treated as pre-releases and filtered out by `findPreviousTag`. If only suffixed matches exist, the current format's interpretation is kept — genuine pre-releases (`-beta`, `-rc`) are still skipped. Config field validated in `config.schema.ts` (array of strings, each containing `{version}`); only honoured when `tagFormat` is set. Both `parseTag` call sites in `generate.ts` and `validateTag` thread it through.
- **Semver coercion** — tags like `v1.2.3-beta` are coerced to core semver for comparison
- **Category order preserved** — output sections follow the order defined in the YAML config, not alphabetical
- **`__VERSION__`** — tsup injects this global from package.json at build time
- **Env-var expansion in config** — string values in `.releasejet.yml` can contain `${VAR_NAME}` references that expand to `process.env.VAR_NAME ?? ''` at load time. Only the exact `${VAR}` form is recognised (no shell-style defaulting). Applied recursively across objects and arrays; non-string values pass through. This is the canonical mechanism for keeping secrets (webhook URLs, tokens) out of YAML.
- **Literal webhook URLs are rejected** — `loadConfig` runs a pre-expansion scan of `notifications[*].webhookUrl` and throws if any value matches Slack/Discord/Teams URL patterns. Users must store webhook URLs in env vars.
- `projectName` on `ReleaseJetConfig` is optional; at publish time it is resolved as `config.projectName ?? deriveProjectName(projectUrl)` and flows through as `AfterPublishPayload.projectName`. Plugin layer renders it; core never does.
- **Token resolution is a 6-step lookup** — `RELEASEJET_TOKEN` env → provider-specific env (`GITHUB_TOKEN`/`GITLAB_API_TOKEN`) → repo-keyed entry in credentials.yml (`<host>/<projectPath>`) → host-keyed entry (`<host>`) → legacy provider-type entry (`gitlab:`/`github:`, fires only when no host entry matches) → bare-text legacy `~/.releasejet/credentials` file → throw. Host keys are case-insensitive lowercase; default ports (80/443) are stripped. `resolveToken(providerType, hostUrl, projectPath)` is the single entry point; `deriveHost` and `deriveRepoKey` (in `src/cli/credentials-store.ts`, re-exported by `src/cli/auth.ts`) are the only key-normalization functions — do not reimplement them in callers. The chain is implemented as a single function in `src/cli/credentials-store.ts` (`resolveTokenChain`), and `resolveToken` / `writeTokenToCredentials` in `src/cli/auth.ts` are thin wrappers over that module. New token-management commands (`auth list-tokens`, `auth remove-token`, `auth show-token`, `auth migrate-tokens`) all consume `credentials-store` rather than re-reading the YAML themselves.
- **`afterGenerate` plugin hook** — additive to the API (still v1). Fires after notes are produced successfully on `generate`, with or without `--publish`, *before* the publish step. `--dry-run` fires neither hook. Pro's webhook adapter listens to both `afterGenerate` and `afterPublish` and emits the `release.generated` / `release.published` event names accordingly.
- **Webhook envelope** — the M4 channel POSTs a versioned JSON envelope (`version: 1`, additive-only). Schema lives in `docs/superpowers/specs/2026-05-05-m4-generic-webhook-design.md`. Signing is optional HMAC-SHA256 of the raw body.
- **Reserved header namespace** — `X-ReleaseJet-*` and `Content-Type` are reserved on `notifications[*].headers`. Validation rejects user attempts to override.
- **M2 retry policy is named, not inline** — `releasejet-pro` has `src/notifications/retry/m2-policy.ts` and `webhook-policy.ts`. Slack/Discord/Teams use `m2Policy`; webhooks use `webhookPolicy`. Behavior of M2 channels is preserved exactly; `tests/notifications/regression-m2.test.ts` is the gate.
- **`description: 'ai'`, `aiSummary.enabled`, and `ai.allowDataEgress`** — schema fields landed in core v1.21.0 for upcoming Pro M3. Core treats `'ai'` as `'none'` and ignores `aiSummary` when `ai.allowDataEgress` is unset, emitting a single warning on `loadConfig`. Runtime (HTTP to `releasejet.dev`, consent prompt, KV cache, model fallback) lives entirely in `@releasejet/pro` v1.7.0+. Spec: `docs/superpowers/specs/2026-05-06-m3-ai-summaries-design.md`.
- **`aiConsent` in credentials.yml** — `~/.releasejet/credentials.yml` may contain a top-level `aiConsent: { acknowledgedAt, version }` object. `credentials-store.ts` exposes `getAiConsent` / `setAiConsent` / `clearAiConsent`. `readEntries` skips this reserved key (via `RESERVED_NON_TOKEN_KEYS`) so it doesn't get classified as a malformed token. Core's `auth ai-consent show|grant|revoke` subcommand is a thin wrapper over these.
- **`extractDescription` re-export** — published from core via the `@makispps/releasejet/plugin/extract` subpath so the Pro AI plugin can use the same F4 cleaner without forking. tsup config has a dedicated entry for this.

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

## Repo Hygiene

- `docs/` is gitignored and must stay that way. Never commit anything under `docs/` — including `docs/superpowers/specs/` and `docs/superpowers/plans/`. These are local working artifacts.
- Do not use `git add -f` to bypass the `docs/` ignore. If a document genuinely belongs in the repo, place it outside `docs/` (e.g. `README.md`, `CHANGELOG.md`) rather than force-adding.
- Before any `git add` / `git commit`, verify no staged paths fall under `docs/`.
