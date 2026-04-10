# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
