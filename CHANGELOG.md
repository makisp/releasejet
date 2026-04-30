# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.17.0] - 2026-04-30

### Added

- **auth:** Four new subcommands for managing `~/.releasejet/credentials.yml` from the CLI (F13):
  - `auth list-tokens [--show-tokens]` — inventory of stored entries grouped by host/repo/legacy, masked by default.
  - `auth remove-token [--host | --repo | --legacy <gitlab|github>] [--yes]` — delete a specific entry; mutually exclusive flags; confirmation prompt unless `--yes`.
  - `auth show-token [<repo>] [--show-tokens]` — debug the token lookup chain for a given repo; auto-detects from the current `.releasejet.yml` when no arg is supplied. Prints all six resolution steps with hit/miss/skipped status.
  - `auth migrate-tokens` — interactive walkthrough that moves legacy `gitlab:` / `github:` entries into host-keyed entries. Recommended path off legacy keys after F12.

### Changed

- `src/cli/auth.ts` — `resolveToken` and `writeTokenToCredentials` now delegate to the new `src/cli/credentials-store.ts` module that owns all credentials-file I/O and the resolution chain. Public signatures and resolution behavior unchanged.

## [1.16.0] - 2026-04-30

### Added

- **auth:** Host-scoped credentials in `~/.releasejet/credentials.yml` (F12). The file is now keyed by host (e.g. `gitlab.com:`, `company.gitlab.com:`) with optional per-repo overrides (`gitlab.com/myorg/api:`). Multiple hosts of the same provider type can coexist without overwriting each other.
- **auth:** New `releasejet auth set-token` subcommand to store a token under a host (`--host`) or per-repo (`--repo`) without re-running the full `init` flow.

### Compatibility

- Legacy `gitlab:` / `github:` entries continue to work as a wildcard fallback for any host that doesn't have an explicit host entry. No file migration is required.

## [1.15.0] - 2026-04-29

### Changed

- `init` now generates a self-documenting `.releasejet.yml`. Every non-Pro feature appears in the file with explanatory block comments and inline value hints, even when off by default. New keys surfaced: `description: none`, `contributors: { enabled: false, exclude: [] }`, and a commented `projectName` stub. Existing keys gain inline enum hints (e.g. `uncategorized: lenient    # lenient | strict`). Pro features are not surfaced — see `.releasejet.example.yml` for the canonical full reference.

## [1.14.0] - 2026-04-29

### Added

- New `description: 'none' | 'extract' | 'ai'` top-level config field. When set to `extract`, release notes render a cleaned, ~200-character excerpt of each issue/PR body under its title. Default is `none` (no change in output). The `ai` value is reserved for the Pro M3a plugin and is treated as `none` in core. (F4)

## [1.13.1] - 2026-04-24

### Fixed

- Export `NotificationChannelConfig` from `@makispps/releasejet/plugin`. Consumers importing it as a type (e.g. `@releasejet/pro`'s dispatcher) now typecheck cleanly under `tsc --noEmit`. Runtime behaviour unchanged. `PLUGIN_API_VERSION` remains `1`.

### Infrastructure

- Added `npm run typecheck` (`tsc --noEmit -p tsconfig.typecheck.json`) and wired it into CI. Guards the plugin public surface via `tests/types/plugin-exports.test-d.ts` so missing re-exports from the plugin barrel fail CI instead of silently shipping.

## [1.13.0] - 2026-04-21

### Added

- Optional `projectName` field on `ReleaseJetConfig`. Resolved at publish time with precedence `config.projectName → deriveProjectName(projectUrl) → undefined` and exposed on the additive `AfterPublishPayload.projectName` field.
- `validate` now reports the resolved `Project:` line at the top of its output.

### Changed

- No breaking changes. `PLUGIN_API_VERSION` remains `1`.

## [1.12.0] - 2026-04-20

### Added
- `${VAR}` env-var expansion in `.releasejet.yml`. Applied recursively across all string values at load time; unset vars expand to empty strings.
- `notifications` config section with `type` / `enabled` / `webhookUrl` fields. Webhook URLs must be env-var references — literal webhook URLs for Slack, Discord, and Teams (including legacy Office 365 connectors, which Microsoft is retiring on 22 May 2026) are rejected at config load.
- `generate --no-notify` flag that propagates to the `afterPublish` plugin hook so Pro can skip notifications for a single run.
- `AfterPublishPayload` now additionally carries `data` (the full `ReleaseNotesData`), `releaseUrl` (provider-aware URL to the release page), and `notifyDisabled`. Additive; no plugin API version bump.
- `validate` command now reports each configured notifications channel and warns on enabled channels whose `webhookUrl` expands to empty.

### Infrastructure
- This release introduces no user-visible behaviour on its own. It prepares the core for the `@releasejet/pro` v1.x update that ships Slack webhook notifications (part of roadmap item M2).

## [1.11.1] - 2026-04-19

### Changed
- README header logo swapped to the finalized ReleaseJet brand lockup. Uses a `<picture>` element so GitHub renders `lockup-dark-2x.png` for dark-mode viewers and `lockup-light-2x.png` otherwise. New brand assets committed under `assets/logo/` (outside the npm tarball).

## [1.11.0] - 2026-04-18

### Added
- **GitHub Action on the Marketplace** — `uses: makisp/releasejet@v1` for one-line CI integration. Composite action wraps the CLI, installs on Ubuntu runners, reads `.releasejet.yml`, publishes releases by default.
- `action.yml` with Marketplace metadata (inputs: `tag`, `publish`, `config`, `token`, `version`).

### Changed
- README leads with the multi-customer wedge hook: "the release notes tool for repos with many customers (and for teams that never adopted Conventional Commits)."
- README `## CI/CD` section surfaces the 5-line Marketplace snippet above the raw framework recipes.
- README links to the public demo repo (`releasejet-demo-multi-customer`) for a live multi-customer example.

## [1.10.0] - 2026-04-18

### Added
- `./docs/config-schema.json` and `./docs/commands.json` package exports, consumed by releasejet.dev/docs (W3).
- Full documentation site live at https://releasejet.dev/docs.

### Changed
- README refocused on quickstart + links to full docs.
- Config loading now routes through a Zod schema (behavior-preserving refactor).
- Default release-notes template relocated from `src/core/templates/default.hbs` to `src/core/templates/default-template.ts` (embedded TS constant) so the docs emitter can run under tsx without a custom loader.

## [1.9.4] - 2026-04-17

### Added
- `generate` now detects tag-format migrations and filtered suffix tags. When no previous tag is found under the current `tagFormat` but same-prefix orphans exist in the repository (either unparseable under the new format, or parseable but with a suffix), the command aborts with an actionable error that names the most recent orphan and suggests `--since <tag>` or re-tagging. This prevents CI runs from silently publishing release notes covering every issue since the beginning of history after a `tagFormat` change. Genuine first releases (no orphans) are unaffected and still proceed as before. `--since` continues to bypass the check.

## [1.9.3] - 2026-04-17

### Added
- `init` now writes `template: default` into the generated `.releasejet.yml` so the field is visible and editable without consulting the docs.
- Documented the `template` field in `.releasejet.example.yml` with its three valid forms: `default` (built-in), `<pro-name>` (named template from `@releasejet/pro`), and `./path.hbs` (custom Handlebars file, requires `@releasejet/pro`).

### Fixed
- `generate` now treats `template: default` (config) and `--template default` (CLI) as the built-in path, routing to the default formatter instead of throwing the Pro-guard error.

## [1.9.2] - 2026-04-17

### Added
- `validate` now shows a "Tag Timestamps" section that reports annotated tags, tags resolved via release object, and flags lightweight tags without a release.
- `init` prints a tip at the end of the setup wizard explaining how to create tags that produce precise release notes (annotated tag, web UI, or `--publish`).
- New "Tag Timestamps" section in the README, with a troubleshooting entry.

### Changed
- The lightweight-tag warning in `generate` now mentions both the annotated-tag workflow and the release-object workflow, and links to the README.

## [1.9.1] - 2026-04-17

### Fixed

- **Lightweight tags no longer drop issues from release notes.** When a tag was created after its target commit (common with GitLab UI tagging and CI auto-tag workflows), issues closed between the commit and the tag's real creation time were silently excluded. The tool now resolves annotated tag dates and existing release dates when available, and falls back to the current time for the latest lightweight tag so recently closed issues are captured.
- Emit a stderr warning when the current tag's date can't be resolved authoritatively, pointing users at annotated tags or `--publish` as the robust fix.

## [1.9.0] - 2026-04-16

### Added

- **Custom tag format support** — new `tagFormat` field in `.releasejet.yml` lets you define how your git tags are structured using `{version}` and `{prefix}` placeholders (e.g., `{version}`, `release/v{version}`, `{prefix}@{version}`)
- `init` wizard now includes a tag format selection step with common presets and a custom pattern option
- Tags like `1.0.0` (no `v` prefix), `release/v1.0.0`, and `app@1.0.0` are now supported when configured

### Changed

- `parseTag()` and `validateTag()` now respect the `tagFormat` config field
- `generate` command passes `tagFormat` to the tag parser for all tag operations
- Existing configs without `tagFormat` continue to work with the default `v{version}` / `{prefix}-v{version}` behavior

## [1.8.2] - 2026-04-16

### Fixed

- `--publish` now updates an existing release instead of failing when one already exists (GitHub and GitLab)

## [1.8.1] - 2026-04-16

### Fixed

- GitHub API calls now correctly translate issue state `"opened"` to `"open"` — fixes `validate` command 422 errors on GitHub repos

## [1.8.0] - 2026-04-16

### Added

- **Pro auto-activation from environment variable** — When the Pro plugin is installed and `RELEASEJET_PRO_TOKEN` is set, the license activates automatically without needing `releasejet auth activate` in CI. Hard-fails with a clear error if the env var is set but activation fails.
- GitHub Actions Pro template now passes `RELEASEJET_PRO_TOKEN` to the `generate` step for auto-activation

### Changed

- Simplified CI setup instructions in `auth activate` — manual `auth activate` step no longer needed in workflows

## [1.7.0] - 2026-04-16

### Added

- `auth activate` auto-detects existing CI workflows and prompts to upgrade them with Pro registry setup
- `auth deactivate` offers to downgrade Pro CI workflows back to the free version
- `ci enable --pro` flag to generate Pro CI templates with private registry configuration
- `ci enable` now auto-detects active Pro license and generates Pro templates automatically
- `ci enable` now supports GitHub Actions (auto-detected from git remote), not just GitLab CI
- `init` wizard generates Pro CI templates when an active Pro license is detected
- `src/license/detect.ts` — shared `hasActivePro()` helper for Pro license detection
- Pro setup instructions added as comments to static CI template files (`ci/`)

## [1.6.0] - 2026-04-16

### Added

- `.npmrc` management for private npm registry (`npm.releasejet.dev`)
- `releasejet auth activate` now prompts to configure npm for Pro package installation
- `releasejet auth deactivate` removes registry config from `~/.npmrc`
- `releasejet auth status` shows npm registry configuration status
- `src/license/npmrc.ts` — read/write/remove helpers for `@releasejet` scoped registry entries

## [1.5.0] - 2026-04-14

### Added

- `template` field in `.releasejet.yml` config for default template selection
- Custom `.hbs` file path support via `--template ./path/to/template.hbs`
- `./plugin/templates` subpath export exposing template engine API for Pro plugin
- Issue URLs in template context (`categoryEntries[].issues[].url`, `uncategorizedEntries[].url`)
- `uncategorizedEntries` array in template context for direct iteration in templates

### Changed

- `--template` flag now falls back to `config.template` when not specified on CLI
- `default.hbs` template uses `uncategorizedEntries` instead of raw `data.issues.uncategorized`
- `tsup.config.ts` adds separate build entry for `plugins/template-api` with `.hbs` loader

### Removed

- `packages/pro/` development scaffold — Pro plugin moved to its own repository

## [1.4.0] - 2026-04-14

### Added

- Handlebars template engine — release notes are now rendered through `.hbs` templates
- `src/core/template-engine.ts` with `renderTemplate()`, `renderCustomTemplate()`, and `registerBuiltinTemplate()` API
- Built-in `default.hbs` template producing identical output to the previous string-based formatter
- Plugin subpath export (`@makispps/releasejet/plugin`) for type imports from `@releasejet/pro`

### Changed

- `src/core/formatter.ts` now delegates to the template engine instead of building strings directly
- `tsup.config.ts` updated to bundle `.hbs` files as inlined text and emit plugin type declarations
- `vitest.config.ts` updated with Vite plugin to handle `.hbs` imports in tests

## [1.3.0] - 2026-04-13

### Added

- Plugin system — extensible architecture for `@releasejet/pro` integration via dynamic import
- Plugin API contract (`ReleaseJetPlugin`, `PluginContext`, `PluginRuntime`) with versioned API (`PLUGIN_API_VERSION = 1`)
- `HookRegistry` for sequential async pipeline hooks (`beforeFormat`, `afterPublish`)
- `FormatterRegistry` for named custom template lookup
- RS256 JWT license validation using `jose` (offline, no network calls during normal use)
- License credential storage (`license` block in `~/.releasejet/credentials.yml`)
- `releasejet auth activate <key>` — activate a Pro license key
- `releasejet auth status` — show current license status (local, no network)
- `releasejet auth refresh` — refresh the license token
- `releasejet auth deactivate` — remove the license key
- `--template <name>` flag on `generate` — use a custom formatter from `@releasejet/pro`
- Core update checklist (`docs/CORE-UPDATE-CHECKLIST.md`) for plugin API compatibility

### Changed

- Version bump to 2.0.0 — the plugin API contract is a new semver-significant public interface
- Milestone value passed to `createRelease` now uses the title string (fixes type mismatch)

## [1.2.0] - 2026-04-13

### Added

- Contributors section in release notes — lists users who contributed to the release with linked profiles
- `contributors` config block with `enabled` and `exclude` fields
- Default bot filtering (dependabot, renovate, gitlab-bot, github-actions) plus automatic `[bot]` suffix detection
- Contributors prompt in `init` wizard
- `author`, `assignee`, `closedBy` fields populated from provider APIs

## [1.1.0] - 2026-04-13

### Added

- `--output <file>` flag for `generate` — write release notes to a file instead of stdout
- `--since <tag>` flag for `generate` — override automatic previous tag detection to specify a custom starting point

## [1.0.3] - 2026-04-12

### Added

- `--milestone <title>` flag for `validate` — scope checks to a specific milestone
- `--state <state>` flag for `validate` — check opened (default), closed, or all issues
- `--recent <days>` flag for `validate` — filter to recently updated issues (required with `--state closed` or `--state all`)
- Tag format compliance check — runs on every `validate` invocation, reports non-conforming tags as warnings
- Structured output with Tag Format and Issue Labels sections plus a summary line

### Changed

- `validate` command description updated to "Check issues and tags for release readiness"
- Exit code 1 now only triggered by label problems (tag warnings are informational)

## [1.0.0] - 2026-04-10

### Added

- CLI commands: `generate`, `validate`, `init`, `ci enable`, `ci disable`
- GitLab provider support using `@gitbeaker/rest`
- GitHub provider support using `@octokit/rest`
- Generate release notes from closed issues or merged pull requests
- Multi-client repo support with client prefix tags (e.g., `mobile-v1.0.0`)
- Single-client repo support with simple version tags (e.g., `v1.0.0`)
- Configurable category labels mapped to release note sections
- Strict mode (fail on uncategorized issues) and lenient mode (include under "Other")
- Automatic milestone detection with clickable links in release notes
- Interactive init wizard with provider auto-detection from git remote
- GitLab CI template (`ci/release-notes-gitlab.yml`)
- GitHub Actions template (`ci/release-notes-github.yml`)
- CI setup step in init wizard for both providers
- Provider-keyed credential storage (`~/.releasejet/credentials.yml`)
- Token resolution: `RELEASEJET_TOKEN` > provider-specific env var > stored credentials
- `--publish`, `--dry-run`, `--format`, `--config`, `--debug` flags for generate
- Silent config migration from legacy `gitlab:` format to `provider:` block
