<img width="480" height="120" alt="lockup-light-1x" src="https://github.com/user-attachments/assets/1fd84e91-86f3-4f62-bad7-8bf4b72b517f" />

Automated release notes generator for GitLab and GitHub. Collects closed issues (or merged pull requests) between Git tags, categorizes them by label, and publishes formatted release notes.

## Features

- **GitLab and GitHub support** — works with both providers out of the box
- **Issues or Pull Requests** — generate notes from closed issues (default) or merged PRs (GitHub)
- **Multi-client repos** — filter by client label (e.g., `mobile-v1.0.0`, `web-v2.0.0`)
- **Single-client repos** — just use `v<semver>` tags
- **Configurable categories** — map labels to sections (features, bugs, improvements, etc.)
- **CI/CD integration** — runs automatically on tag push via GitLab CI or GitHub Actions
- **Strict/lenient modes** — enforce labeling or allow uncategorized issues under "Other"
- **Milestone detection** — automatically links the most common milestone in release notes
- **Contributors section** — optionally list who contributed to each release, with linked profiles

## Quick Start

```bash
npm i -g @makispps/releasejet

# Interactive setup (detects provider from git remote)
releasejet init

# Preview release notes
releasejet generate --tag v1.0.0

# Generate and publish
releasejet generate --tag v1.0.0 --publish
```

## Configuration

Create `.releasejet.yml` in your project root (or run `releasejet init`):

```yaml
provider:
  type: github       # 'gitlab' or 'github'
  url: https://github.com

# GitHub-only: generate notes from issues or pull requests
source: issues       # 'issues' (default) or 'pull_requests'

# For multi-client repos (omit for single-client)
clients:
  - prefix: mobile
    label: MOBILE
  - prefix: web
    label: WEB

categories:
  feature: "New Features"
  bug: "Bug Fixes"
  improvement: "Improvements"
  breaking-change: "Breaking Changes"

uncategorized: lenient  # or "strict" to enforce labeling

# Optional: list contributors in release notes
contributors:
  enabled: true
  exclude:
    - dependabot
    - renovate
```

## CI/CD Integration

### GitHub Actions

Run `releasejet init` and select CI setup, or add `.github/workflows/release-notes.yml`:

```yaml
name: Release Notes
on:
  push:
    tags:
      - '**'
jobs:
  release-notes:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm i -g @makispps/releasejet
      - run: releasejet generate --tag "${{ github.ref_name }}" --publish
        env:
          RELEASEJET_TOKEN: ${{ secrets.RELEASEJET_TOKEN }}
```

Set `RELEASEJET_TOKEN` as a repository secret (Settings > Secrets > Actions).

### GitLab CI

Add to your `.gitlab-ci.yml` (or run `releasejet ci enable`):

```yaml
release-notes:
  stage: deploy
  image: node:20-alpine
  rules:
    - if: $CI_COMMIT_TAG
  before_script:
    - npm i -g @makispps/releasejet
  script:
    - releasejet generate --tag "$CI_COMMIT_TAG" --publish
```

Set `GITLAB_API_TOKEN` (or `RELEASEJET_TOKEN`) as a CI/CD variable with `api` scope.

## Authentication

Token resolution order:

1. `RELEASEJET_TOKEN` env var (works for both providers)
2. Provider-specific env var: `GITLAB_API_TOKEN` or `GITHUB_TOKEN`
3. Stored credentials from `~/.releasejet/credentials.yml`

## Tag Format

| Repo type | Format | Example |
|-----------|--------|---------|
| Multi-client | `<prefix>-v<semver>` | `mobile-v1.2.0` |
| Single-client | `v<semver>` | `v1.2.0` |

## Commands

| Command | Description |
|---------|-------------|
| `releasejet init` | Interactive setup wizard |
| `releasejet generate --tag <tag>` | Generate release notes |
| `releasejet generate --tag <tag> --publish` | Generate and publish release |
| `releasejet validate` | Check issues and tags for release readiness |
| `releasejet ci enable` | Add CI configuration to `.gitlab-ci.yml` |
| `releasejet ci disable` | Remove CI configuration |

### Generate Flags

| Flag | Description |
|------|-------------|
| `--publish` | Publish as a release on the provider |
| `--dry-run` | Preview without publishing |
| `--format <format>` | Output format: `markdown` (default) or `json` |
| `--output <file>` | Write release notes to a file instead of stdout |
| `--since <tag>` | Use this tag as the starting point instead of auto-detecting |
| `--config <path>` | Custom config file path |
| `--debug` | Show debug information |

### Validate Flags

| Flag | Description |
|------|-------------|
| `--milestone <title>` | Only check issues in this milestone |
| `--state <state>` | Issue state: `opened` (default), `closed`, or `all` |
| `--recent <days>` | Only check issues updated in last N days |
| `--config <path>` | Custom config file path |
| `--debug` | Show debug information |

## Troubleshooting

### "API token not found"

ReleaseJet checks three sources in order: `RELEASEJET_TOKEN` env var, provider-specific env var (`GITLAB_API_TOKEN` or `GITHUB_TOKEN`), and `~/.releasejet/credentials.yml`. Verify your token is set:

```bash
echo $RELEASEJET_TOKEN
```

To reconfigure, run `releasejet init`.

### "Tag not found in remote repository"

The tag exists locally but hasn't been pushed. Push it first:

```bash
git push origin <tag>
```

### "Invalid tag format"

Tags must match `v<semver>` (e.g., `v1.2.0`) or `<prefix>-v<semver>` (e.g., `mobile-v1.2.0`). Suffixes like `v1.2.0-beta` are supported but the core version must be valid semver.

### Issues missing from release notes

ReleaseJet includes issues closed *between* the previous tag and the current tag (by `closedAt` timestamp, not `updatedAt`). Check that:

- The issue is **closed** (not just merged)
- The close date falls within the tag window
- The issue has the correct **client label** (multi-client repos)

Use `--debug` to see the date range and which issues were filtered.

### "Request failed with status 401" or "403"

The API token doesn't have the required permissions. GitLab tokens need `api` scope. GitHub tokens need `repo` scope. Regenerate the token with the correct scope and update it via `releasejet init` or the `RELEASEJET_TOKEN` env var.

### `source: pull_requests` not working

Pull request source is only supported for GitHub. GitLab projects must use `source: issues` (the default).

### Config changes not taking effect

Run with `--debug` to see the loaded config:

```bash
releasejet generate --tag <tag> --debug
```

Invalid values (e.g., `uncategorized: "strictt"`) now produce clear error messages instead of being silently ignored.

## License

MIT
