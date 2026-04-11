# Validate Command Enhancements

**Date:** 2026-04-11
**Status:** Approved
**Scope:** v1.1.0 — Polish & DX (free tier, core CLI)

## Overview

Enhance `releasejet validate` from a single-purpose label checker into a release-readiness check that validates three concerns: issue labeling (with milestone/state/recency scoping), and tag format compliance. All checks run by default on every invocation. New flags scope the issue checks by milestone, state, and recency.

## CLI Interface

```
releasejet validate [options]

Options:
  --config <path>        Config file path (default: .releasejet.yml)
  --milestone <title>    Only check issues in this milestone
  --state <state>        Issue state to check: opened|closed|all (default: opened)
  --recent <days>        Only check issues updated in last N days
  --debug                Show debug information
```

### Flag Rules

- `--state opened` (default) — no `--recent` required, same behavior as today
- `--state closed` or `--state all` — `--recent` is **required** to prevent unbounded queries. CLI exits with an error if omitted.
- `--milestone` can combine with any `--state`/`--recent` combination
- `--recent` is optional when `--state opened` (issues are naturally bounded)

## Check 1: Issue Label Validation (enhanced existing)

Same core logic as today, with scoping additions:

- **Milestone filter:** when `--milestone` is provided, only issues assigned to that milestone are checked. Use provider API milestone filter if available, otherwise client-side filter.
- **State filter:** `--state opened|closed|all` controls which issues are fetched (default: `opened`).
- **Recency filter:** `--recent <days>` filters to issues updated within the last N days. Applied client-side after fetch.
- **Label checks (unchanged):**
  - Category label present (from `config.categories` keys)
  - Client label present if multi-client mode (from `config.clients[].label`)

## Check 2: Tag Format Compliance (new)

Runs on every `validate` invocation with no additional flags needed. Fetches all tags from the provider and checks:

- **Format match:** each tag must match `v<semver>` (single-client) or `<prefix>-v<semver>` (multi-client)
- **Semver validity:** the version portion must be valid/coercible semver (consistent with existing `tag-parser.ts` behavior)
- **Prefix match:** in multi-client mode, the tag prefix must match a configured client prefix from `config.clients[].prefix`
- Tags that don't match any expected pattern are flagged as **warnings**, not errors

### Why Warnings, Not Errors

Repos often have legacy tags, CI-generated tags, or tags from other tools. These shouldn't block releases. Only issue label problems produce a non-zero exit code.

## Output Format

Structured text with clear section headers and a summary line:

```
Tag Format
  ✓ 12 tags OK
  ⚠ 2 tags with issues:
    release-2024  — does not match expected format
    mobile-vbad   — invalid semver "bad"

Issue Labels (opened)
  ✓ 18 issues properly labeled
  ⚠ 3 issues with missing labels:
    #42 - Add dark mode
      Missing: category label
    #55 - Fix login crash
      Missing: client label
    #61 - Update docs
      Missing: category label, client label

Summary: 2 tag warnings, 3 label problems
```

When `--milestone` is active, the issue section header reflects it:

```
Issue Labels (opened, milestone: v1.2.0)
```

### Exit Code

- **Exit 0:** all checks pass, or only tag warnings (no label problems)
- **Exit 1:** one or more issue label problems found

## Architecture

No new files. Changes stay within existing modules:

### `src/cli/commands/validate.ts`

- Add `--milestone`, `--state`, `--recent` options to Commander definition
- Validate flag combinations (error if `--state closed|all` without `--recent`)
- Orchestrate both checks (tag format + issue labels)
- Format output with sections and summary line
- Extract issue-checking logic into a helper function for clarity

### `src/core/tag-parser.ts`

- Add a `validateTag(tagName, config)` function that returns a structured result:
  ```ts
  interface TagValidationResult {
    tag: string;
    valid: boolean;
    reason?: string; // e.g., "does not match expected format", "invalid semver"
  }
  ```
- Reuses existing `parseTag()` logic internally

### `tests/cli/validate.test.ts`

Extend with tests for:
- `--milestone` filtering
- `--state closed` with `--recent`
- `--state closed` without `--recent` (error case)
- Tag format validation (valid tags, invalid format, invalid semver, unknown prefix)
- Combined scenarios (tag warnings + label problems)
- Summary line content and exit code behavior

### `tests/core/tag-parser.test.ts`

Add tests for the new `validateTag()` function.

## Non-Goals

- JSON output format (future enhancement if needed)
- Auto-fixing labels (out of scope)
- Tag validation flags to control which tags are checked (all tags are checked)
