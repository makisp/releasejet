<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo/lockup-dark-2x.png">
  <img width="480" height="120" alt="ReleaseJet" src="./assets/logo/lockup-light-2x.png">
</picture>

**ReleaseJet — the release notes tool for repos with many customers (and for teams that never adopted Conventional Commits).**

<video src="https://github.com/makisp/releasejet/raw/main/assets/demo-mp4.mp4" controls muted playsinline width="100%">
  <img src="https://github.com/makisp/releasejet/raw/main/assets/demo.gif" alt="ReleaseJet demo">
</video>

Collects labeled issues (or merged pull requests) between Git tags, categorizes them, and publishes formatted release notes. First-class support for **multi-customer repos** (one codebase, per-customer tag tracks) on **GitHub and GitLab**. No Conventional Commits required — your team already labels issues; that's all we need.

**See it live:** [releasejet-demo-multi-customer](https://github.com/makisp/releasejet-demo-multi-customer/releases) — three customer tracks, real published release pages, zero hand-editing.

**Full documentation: [releasejet.dev/docs](https://releasejet.dev/docs)**

## Features

- GitLab and GitHub support — both providers out of the box
- Issues or Pull Requests — closed issues (default) or merged PRs (GitHub)
- Multi-client repos (e.g., `mobile-v1.0.0`, `web-v2.0.0`)
- Configurable categories — map labels to sections
- Issue/PR description extraction — render the first paragraph beneath each title
- Jira ticket linking — inline links to PROJ-123 IDs detected in titles/bodies, no API calls
- CI/CD integration — GitLab CI and GitHub Actions
- Strict/lenient modes, milestone detection, contributors section

ReleaseJet has a paid tier with additional features (notifications, AI-powered summaries, custom templates). See [releasejet.dev](https://releasejet.dev) for details.

## Quick Start

```bash
npm install -g @makispps/releasejet
releasejet init                        # interactive setup
releasejet generate --tag v1.0.0       # preview
releasejet generate --tag v1.0.0 --publish
```

### Notification channels

Manage notification channels in `.releasejet.yml` without hand-editing:

```bash
releasejet notifications add                              # interactive wizard
releasejet notifications add --type slack --env SLACK_WEBHOOK_URL --enabled
releasejet notifications list                             # table of configured channels
```

`add` only ever writes the env-var reference (e.g. `${SLACK_WEBHOOK_URL}`) — never a literal webhook URL. `list` resolves each referenced var at runtime and shows `set` / `unset` / `n/a` in the `ENV` column. Both commands work in core; channel delivery requires the paid tier — see [releasejet.dev](https://releasejet.dev) for details.

## Configuration

See the [configuration reference](https://releasejet.dev/docs/reference/configuration) for every field. Minimal `.releasejet.yml`:

```yaml
provider:
  type: github
categories:
  feature: "New Features"
  bug: "Bug Fixes"
```

Optional top-level `projectName:` overrides the project name shown in notification cards. Defaults to the last path segment of `projectUrl`.

### Issue / PR descriptions

By default, release notes show only issue/PR titles. To also render the first paragraph of each item's body underneath its title, set:

```yaml
description: extract
```

in `.releasejet.yml`. The cleaner strips leading HTML comments and `## Description`-style headers, takes the first paragraph, collapses whitespace, and truncates to ~200 characters with an ellipsis. Items with empty bodies (or bodies that contain only headers/comments) render as before — title only, no placeholder.

**Before** (default, `description: none`):

```
- Fix login redirect bug (#142)
```

**After** (`description: extract`):

```
- Fix login redirect bug (#142)
  - Users were redirected to /login instead of their target after SSO callback…
```

The `description: ai` value is reserved for AI-summarised descriptions on the paid tier and is treated as `none` in core. See [releasejet.dev](https://releasejet.dev) for details.

### Jira ticket linking

When your team puts Jira ticket IDs in PR/issue titles or descriptions
(e.g., "Fix login PROJ-123"), ReleaseJet can detect them and render
clickable links beside each issue line in the release notes — without
calling the Jira API.

```yaml
jira:
  baseUrl: https://acme.atlassian.net
  projects: [PROJ, BUG]
```

Output line:

```
- Fix login (#42) — [PROJ-123](https://acme.atlassian.net/browse/PROJ-123)
```

`baseUrl` accepts `${ENV_VAR}` references for self-hosted Jira instances.
`projects` is a required allowlist that prevents false positives like
`HTTP-2` or `IPV-6`.

## CI/CD

**GitHub Action on the Marketplace** — [marketplace/actions/releasejet](https://github.com/marketplace/actions/releasejet). Five-line setup:

```yaml
- uses: makisp/releasejet@v1
  with:
    tag: ${{ github.ref_name }}
    token: ${{ secrets.GITHUB_TOKEN }}
```

Raw setup recipes: [GitHub Actions](https://releasejet.dev/docs/recipes/github-issues) · [GitLab CI](https://releasejet.dev/docs/recipes/gitlab-issues)

## Authentication

ReleaseJet looks up your provider API token in this order. The **first** match wins:

1. `RELEASEJET_TOKEN` environment variable (universal — works for both GitLab and GitHub).
2. Provider-specific environment variable: `GITHUB_TOKEN` (for GitHub) or `GITLAB_API_TOKEN` (for GitLab).
3. **Per-repo entry** in `~/.releasejet/credentials.yml`, keyed as `<host>/<projectPath>` (e.g. `gitlab.com/myorg/api`).
4. **Host entry** in `~/.releasejet/credentials.yml`, keyed by host (e.g. `gitlab.com`, `company.gitlab.com`).
5. **Legacy provider-type entry** (`gitlab:` or `github:`) — kept indefinitely as a fallback for hosts that don't have an explicit host entry.
6. The pre-YAML bare-text file `~/.releasejet/credentials` (legacy format, still supported).

Host keys are case-insensitive and default ports (`80`, `443`) are stripped. Non-default ports are preserved (e.g. `gitlab.example.com:8443`).

### Example credentials.yml

```yaml
gitlab.com: glpat-aaaaaaaaaaaaaaaaaaaa             # default for gitlab.com repos
company.gitlab.com: glpat-bbbbbbbbbbbbbbbb         # different host
github.com: ghp_cccccccccccccccccccc               # default for github.com
gitlab.com/personal/sideproject: glpat-dddd        # per-repo override
```

### Managing tokens

The interactive `releasejet init` flow stores a token under the configured host. Once set, manage tokens directly with the `auth` subcommands:

```bash
releasejet auth set-token              # prompts; uses the current repo's host
releasejet auth set-token --host company.gitlab.com
releasejet auth set-token --repo gitlab.com/myorg/api

releasejet auth list-tokens            # show every stored token (masked)
releasejet auth list-tokens --show-tokens

releasejet auth show-token             # explain which token resolves for the current repo
releasejet auth show-token gitlab.com/myorg/api

releasejet auth remove-token --host gitlab.com
releasejet auth remove-token --repo gitlab.com/myorg/api
releasejet auth remove-token --legacy gitlab    # remove a legacy provider-type entry

releasejet auth migrate-tokens         # interactive: move legacy gitlab/github keys to host keys
```

`show-token` is the diagnostic to reach for when "the wrong token is being used." It prints every step in the lookup chain — env vars, repo key, host key, legacy key, bare-text file — and marks which one was used.

For CI, set `RELEASEJET_TOKEN`, `GITHUB_TOKEN`, or `GITLAB_API_TOKEN` as a secret — env vars always win over the file.

## Troubleshooting

Common issues:

- **"API token not found"** — set `RELEASEJET_TOKEN` as env or via `releasejet init`. [Full guide](https://releasejet.dev/docs/guides/authentication-tokens).
- **"Tag not found in remote repository"** — push the tag first: `git push origin <tag>`.
- **"Invalid tag format"** — see [tag formats](https://releasejet.dev/docs/guides/tag-formats).

[Full troubleshooting](https://releasejet.dev/docs/troubleshooting) · [All commands](https://releasejet.dev/docs/reference/commands/generate)

## License

MIT
