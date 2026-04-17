# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0-rc.0] - 2026-04-17 (prerelease)

### Added
- Docs surface: `./docs/config-schema.json` and `./docs/commands.json` exports consumed by releasejet.dev/docs (W3).
- Internal: Zod schema at `src/core/config.schema.ts` as the single source of truth for runtime validation and docs generation.

### Changed
- Config loading now routes through the Zod schema. Behavior is unchanged — all existing error messages and legacy `gitlab:` migration are preserved.
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
