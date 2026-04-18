<img width="480" height="120" alt="lockup-light-1x" src="https://github.com/user-attachments/assets/1fd84e91-86f3-4f62-bad7-8bf4b72b517f" />

Automated release notes generator for GitLab and GitHub. Collects closed issues (or merged pull requests) between Git tags, categorizes them by label, and publishes formatted release notes.

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

## CI/CD

- [GitHub Actions setup](https://releasejet.dev/docs/recipes/github-issues)
- [GitLab CI setup](https://releasejet.dev/docs/recipes/gitlab-issues)

## Troubleshooting

Common issues:

- **"API token not found"** — set `RELEASEJET_TOKEN` as env or via `releasejet init`. [Full guide](https://releasejet.dev/docs/guides/authentication-tokens).
- **"Tag not found in remote repository"** — push the tag first: `git push origin <tag>`.
- **"Invalid tag format"** — see [tag formats](https://releasejet.dev/docs/guides/tag-formats).

[Full troubleshooting](https://releasejet.dev/docs/troubleshooting) · [All commands](https://releasejet.dev/docs/reference/commands/generate)

## License

MIT
