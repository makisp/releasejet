# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
