# Custom Tag Format Support

**Date:** 2026-04-16
**Status:** Approved

## Problem

After running `releasejet init`, there is no guidance about the expected tag format. The tag parser hardcodes two patterns (`v<semver>` and `<prefix>-v<semver>`) with no way to customize them. Developers whose projects use different tag conventions (e.g., `1.0.0`, `release/v1.0.0`, `app@1.0.0`) cannot use ReleaseJet without changing their tagging strategy.

## Solution

Add a tag format step to the init wizard and a `tagFormat` config field that lets users pick from common conventions or define a custom pattern using `{version}` and `{prefix}` placeholders.

## Init Wizard Changes

### New Step: Tag Format (Step 6)

Inserted after client definitions (or after the multi-client question if they said no). This placement ensures we have the prefix context needed for previews.

**Single-client repos:**

```
? Tag format for your releases:
  > v{version}              (e.g. v1.0.0)
    {version}                (e.g. 1.0.0)
    release/v{version}       (e.g. release/v1.0.0)
    Custom...
```

**Multi-client repos** (using the first configured prefix for examples):

```
? Tag format for your releases:
  > {prefix}-v{version}     (e.g. mobile-v1.0.0)
    {prefix}/{version}       (e.g. mobile/1.0.0)
    {prefix}@{version}       (e.g. mobile@1.0.0)
    Custom...
```

### Custom Pattern Input

If the user selects "Custom...":

```
Use placeholders to define your tag format:
  {version}  -> semver version (e.g. 1.0.0)
  {prefix}   -> client prefix (for multi-client repos)

Examples:
  release-{version}
  {prefix}/v{version}

? Your tag pattern: _
```

After input, show a preview using the first client prefix and `1.0.0`:

```
? Your tag pattern: build/{prefix}-{version}
  -> e.g. build/mobile-1.0.0
```

### Validation Rules

- Pattern must contain `{version}`
- `{prefix}` is only valid in multi-client mode; error if used in single-client
- Empty input falls back to the default (`v{version}` for single, `{prefix}-v{version}` for multi)

### Updated Init Flow

1. Provider (github/gitlab)
2. Provider URL
3. Source (issues/PRs) -- GitHub only
4. Multi-client? (yes/no)
5. Client definitions (if multi-client)
6. **Tag format** (new)
7. Uncategorized mode
8. Categories
9. Contributors
10. CI setup
11. API token

## Config Changes

### New Field: `tagFormat`

Root-level string field in `.releasejet.yml`:

```yaml
provider:
  type: github
  url: https://github.com

tagFormat: "v{version}"

categories:
  feature: "New Features"
  bug: "Bug Fixes"
```

**Behavior:**

- Always written by init, even when choosing the default -- makes it visible and editable
- If the field is missing or deleted, fall back to `v{version}` (single-client) or `{prefix}-v{version}` (multi-client)
- Added to `.releasejet.example.yml` with comments explaining the placeholders

### Config Loading

`src/core/config.ts` adds `tagFormat` as an optional string field. The default merge logic applies the fallback when the field is absent.

## Tag Parser Changes

### `parseTag(tag, tagFormat, clients?)`

Currently uses two hardcoded regexes. Changes:

1. Accept `tagFormat` parameter (e.g., `v{version}`, `{prefix}-v{version}`)
2. Convert the format to a regex:
   - `{version}` becomes a capture group matching the version part: `(.+)`
   - `{prefix}` becomes a capture group matching the prefix: `(.+?)`
   - All other characters are treated as literal (escaped for regex)
3. Match the tag against the generated regex
4. Extract prefix (if `{prefix}` was in the format) and version from capture groups
5. Apply `semver.coerce()` to the version part, same as today

Example: `tagFormat: "release/{prefix}-{version}"` becomes regex `^release/(.+?)-(.+)$`

### `findPreviousTag(currentTag, allTags, tagFormat, clients?)`

Uses the same format-derived regex to:

1. Parse all candidate tags using the format
2. Filter to matching prefix (or null prefix for single-client)
3. Exclude suffixed tags
4. Sort by semver descending, date tiebreaker
5. Return highest version below current

No change to the sorting/filtering logic itself -- only the parsing step changes.

### `validateTag(tag, tagFormat, clients?)`

Uses the format-derived regex instead of hardcoded patterns. Validates that multi-client tags use a configured prefix.

### Backwards Compatibility

When `tagFormat` is absent from config, the parser uses the current defaults:
- Single-client: `v{version}` (produces `^v(.+)$`)
- Multi-client: `{prefix}-v{version}` (produces `^(.+?)-v(.+)$`)

These generate identical regexes to the current hardcoded ones, so existing behavior is preserved.

## What Stays The Same

- Semver coercion and suffix handling
- Previous tag sorting logic (semver comparison, date tiebreaker)
- Everything downstream of parsing: issue collection, formatting, publishing
- The `ParsedTag` interface returned by `parseTag()`

## Files Changed

| File | Change |
|------|--------|
| `src/cli/commands/init.ts` | Add tag format prompt step after client definitions |
| `src/core/config.ts` | Add optional `tagFormat` field, default fallback |
| `src/types.ts` | Add `tagFormat` to `ReleaseJetConfig` interface |
| `src/core/tag-parser.ts` | Accept `tagFormat`, convert to regex, replace hardcoded patterns |
| `src/cli/commands/generate.ts` | Pass `tagFormat` from config to parser |
| `src/cli/commands/validate.ts` | Pass `tagFormat` from config to parser |
| `.releasejet.example.yml` | Add `tagFormat` field with comments |
| `tests/core/tag-parser.test.ts` | Add tests for custom formats, default fallback, edge cases |

## Edge Cases

- **Format with no `{version}`**: Rejected at init time and at config load time with a clear error
- **Format with `{prefix}` in single-client mode**: Rejected at init time; at config load time, warn and strip `{prefix}` from the pattern
- **Ambiguous patterns**: `{prefix}{version}` (no separator) -- technically valid but hard to parse. We allow it; the regex will do its best with non-greedy matching. The preview helps the user see if it works.
- **Special regex characters in format**: Characters like `.`, `(`, `[` in the user's literal parts are escaped before regex compilation
