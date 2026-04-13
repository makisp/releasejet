# ReleaseJet Roadmap

## Shipped

- [x] GitLab provider with Gitbeaker
- [x] GitHub provider with Octokit
- [x] Multi-client tag parsing (`<prefix>-v<semver>`)
- [x] Single-client tag parsing (`v<semver>`)
- [x] Issue-based release notes with label categories
- [x] Pull request source support (GitHub)
- [x] Markdown formatter with config-defined category order
- [x] `generate` command with `--publish`, `--dry-run`, `--format`, `--debug`
- [x] `init` command — interactive setup wizard
- [x] `validate` command — check issues for proper labeling
- [x] `validate` enhancements — `--milestone`, `--state`, `--recent` flags, tag format check, structured output
- [x] `ci enable/disable` — GitLab CI / GitHub Actions integration
- [x] Strict/lenient uncategorized mode
- [x] Milestone detection
- [x] Auth token resolution (env var, provider-specific, credentials file)
- [x] Error handler with debug mode
- [x] npm publish with OIDC provenance

## Free (open-source)

- [x] F1. `--output <file>` flag to write release notes to a file
- [x] F2. `--since <tag>` flag to override automatic previous tag detection
- [ ] F3. Jira issue linking (cross-reference Jira ticket IDs in commits)
- [ ] F4. Issue description in notes — extract first line/paragraph from issue body (`description: extract`)
- [x] F5. Config validation with actionable error messages on `init`
- [x] F6. Contributors section — list authors who closed issues in the range
- [ ] F7. Bitbucket provider support
- [ ] F8. Azure DevOps provider support

## Pro Infrastructure (Phase 1 — core repo)

- [x] P1. Plugin API contract (ReleaseJetPlugin, PluginContext, hooks, formatter registry)
- [x] P2. Plugin discovery and loading (dynamic import, shape validation, API version check)
- [x] P3. RS256 JWT license validation (offline, jose library)
- [x] P4. License credential storage in `~/.releasejet/credentials.yml`
- [x] P5. `auth` command (activate, status, refresh, deactivate)
- [x] P6. `--template` flag on `generate` for plugin-provided formatters
- [x] P7. `beforeFormat` and `afterPublish` pipeline hooks
- [x] P8. Core update checklist for plugin API compatibility

## Pro Infrastructure (Phase 2 — separate repos)

- [ ] P9. License server API endpoints on releasejet.dev (Vercel serverless)
- [ ] P10. `@releasejet/pro` private package repo
- [ ] P11. Private npm registry (npm.releasejet.dev)

## Monetized (paid tier)

- [ ] M1. Custom release notes templates (Handlebars/Mustache)
- [ ] M2. Slack/Discord/Teams webhook notifications on publish
- [ ] M3. AI-powered summaries
  - [ ] M3a. Per-issue AI descriptions — LLM summary of each issue body (`description: ai`)
  - [ ] M3b. Release overview — LLM-generated summary paragraph at the top of release notes
- [ ] M4. Webhook/API — external tools subscribe to release events and consume data programmatically
- [ ] M5. Jira/Linear integration — for teams tracking issues outside GitLab/GitHub
- [ ] M6. Multi-project aggregation — combined "meta release" across repos in a group/org
- [ ] M7. Web dashboard — hosted UI for release history, search, and filtering
  - [ ] M7a. Release comparison — diff view between any two releases
  - [ ] M7b. Release metrics — release frequency, time-to-release, issue throughput, label compliance
- [ ] M8. Monorepo/workspace support — scoped tags (`@scope/package@version`), per-package config inheritance, aggregate notes

## Website — releasejet.dev

- [x] W1. Landing page (Deep Violet design, Vercel hosting, separate repo)
- [ ] W2. Interactive demo / playground
- [ ] W3. Documentation site with config reference
