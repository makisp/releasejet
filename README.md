<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./assets/logo/lockup-dark-2x.png">
  <img width="480" height="120" alt="ReleaseJet" src="./assets/logo/lockup-light-2x.png">
</picture>

**ReleaseJet — the release notes tool for repos with many customers (and for teams that never adopted Conventional Commits).**

![ReleaseJet demo](./assets/demo.gif)

Collects labeled issues (or merged pull requests) between Git tags, categorizes them, and publishes formatted release notes. First-class support for **multi-customer repos** (one codebase, per-customer tag tracks) on **GitHub and GitLab**. No Conventional Commits required — your team already labels issues; that's all we need.

**See it live:** [releasejet-demo-multi-customer](https://github.com/makisp/releasejet-demo-multi-customer/releases) — three customer tracks, real published release pages, zero hand-editing.

**Full documentation: [releasejet.dev/docs](https://releasejet.dev/docs)**

## Features

- GitLab and GitHub support — both providers out of the box
- Issues or Pull Requests — closed issues (default) or merged PRs (GitHub)
- Multi-client repos (e.g., `mobile-v1.0.0`, `web-v2.0.0`)
- Configurable categories — map labels to sections
- CI/CD integration — GitLab CI and GitHub Actions
- Strict/lenient modes, milestone detection, contributors section

## Quick Start

```bash
npm install -g @makispps/releasejet
releasejet init                        # interactive setup
releasejet generate --tag v1.0.0       # preview
releasejet generate --tag v1.0.0 --publish
```

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
  Users were redirected to /login instead of their target after SSO callback…
```

The `description: ai` value is reserved for AI-summarised descriptions in the Pro plugin (M3a) and is treated as `none` in core.

## CI/CD

**GitHub Action on the Marketplace** — [marketplace/actions/releasejet](https://github.com/marketplace/actions/releasejet). Five-line setup:

```yaml
- uses: makisp/releasejet@v1
  with:
    tag: ${{ github.ref_name }}
    token: ${{ secrets.GITHUB_TOKEN }}
```

Raw setup recipes: [GitHub Actions](https://releasejet.dev/docs/recipes/github-issues) · [GitLab CI](https://releasejet.dev/docs/recipes/gitlab-issues)

## Troubleshooting

Common issues:

- **"API token not found"** — set `RELEASEJET_TOKEN` as env or via `releasejet init`. [Full guide](https://releasejet.dev/docs/guides/authentication-tokens).
- **"Tag not found in remote repository"** — push the tag first: `git push origin <tag>`.
- **"Invalid tag format"** — see [tag formats](https://releasejet.dev/docs/guides/tag-formats).

[Full troubleshooting](https://releasejet.dev/docs/troubleshooting) · [All commands](https://releasejet.dev/docs/reference/commands/generate)

## License

MIT
