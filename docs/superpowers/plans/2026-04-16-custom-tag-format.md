# Custom Tag Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users configure custom tag formats (`tagFormat` in `.releasejet.yml`) so ReleaseJet works with any tagging convention, not just `v<semver>` and `<prefix>-v<semver>`.

**Architecture:** A new `tagFormatToRegex()` utility converts placeholder strings like `{prefix}-v{version}` into regex patterns with named capture group indices. `parseTag()` accepts an optional `tagFormat` parameter; when absent, legacy dual-try behavior is preserved. The init wizard adds a tag format selection step after client definitions.

**Tech Stack:** TypeScript, vitest, @inquirer/prompts, semver

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/types.ts` | Modify | Add `tagFormat?: string` to `ReleaseJetConfig` |
| `src/core/config.ts` | Modify | Parse + validate `tagFormat` from YAML |
| `src/core/tag-parser.ts` | Modify | Add `tagFormatToRegex()`, update `parseTag()` and `validateTag()` |
| `tests/core/tag-parser.test.ts` | Modify | Tests for custom formats, regex conversion, backwards compat |
| `src/cli/commands/generate.ts` | Modify | Pass `config.tagFormat` to `parseTag()` |
| `src/cli/commands/validate.ts` | No changes | `validateTag()` already receives full config; wiring is internal |
| `src/cli/commands/init.ts` | Modify | Add tag format prompt step |
| `.releasejet.example.yml` | Modify | Add `tagFormat` field with comments |

---

### Task 1: Add `tagFormat` to types and config

**Files:**
- Modify: `src/types.ts:16-27`
- Modify: `src/core/config.ts:19-25` and `src/core/config.ts:45-171`

- [ ] **Step 1: Add `tagFormat` to `ReleaseJetConfig` interface**

In `src/types.ts`, add the optional field after `template`:

```typescript
export interface ReleaseJetConfig {
  provider: {
    type: 'gitlab' | 'github';
    url: string;
  };
  source: 'issues' | 'pull_requests';
  clients: ClientConfig[];
  categories: Record<string, string>;
  uncategorized: 'lenient' | 'strict';
  contributors?: ContributorsConfig;
  template?: string;
  tagFormat?: string;
}
```

- [ ] **Step 2: Parse `tagFormat` in config loader**

In `src/core/config.ts`, inside `mergeWithDefaults()`, add after the `template` extraction (around line 53):

```typescript
const tagFormat = raw.tagFormat as string | undefined;
```

Add validation after the existing uncategorized validation block (around line 95):

```typescript
// Tag format
if (tagFormat !== undefined) {
  if (typeof tagFormat !== 'string') {
    throw new Error(
      'Invalid config in .releasejet.yml\n\n  tagFormat: expected a string (e.g., "v{version}").',
    );
  }
  if (!tagFormat.includes('{version}')) {
    throw new Error(
      'Invalid config in .releasejet.yml\n\n  tagFormat: must contain the {version} placeholder.',
    );
  }
}
```

Add `tagFormat` to the return object at the end of `mergeWithDefaults()`:

```typescript
return {
  provider,
  source: (source as 'issues' | 'pull_requests') ?? 'issues',
  clients,
  categories,
  uncategorized: (uncategorized as 'lenient' | 'strict') ?? 'lenient',
  contributors,
  template,
  tagFormat,
};
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests pass (no behavior change yet).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/core/config.ts
git commit -m "feat(config): add optional tagFormat field to ReleaseJetConfig"
```

---

### Task 2: Add `tagFormatToRegex` utility with tests

**Files:**
- Modify: `src/core/tag-parser.ts:1-3`
- Modify: `tests/core/tag-parser.test.ts`

- [ ] **Step 1: Write failing tests for `tagFormatToRegex`**

Add a new `describe` block at the top of `tests/core/tag-parser.test.ts`, right after the imports. Update the import line first:

```typescript
import { parseTag, findPreviousTag, validateTag, tagFormatToRegex } from '../../src/core/tag-parser.js';
```

Then add the test block:

```typescript
describe('tagFormatToRegex', () => {
  it('converts v{version} to regex with version in group 1', () => {
    const result = tagFormatToRegex('v{version}');
    expect(result.regex.source).toBe('^v(.+)$');
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('converts {prefix}-v{version} to regex with prefix in group 1 and version in group 2', () => {
    const result = tagFormatToRegex('{prefix}-v{version}');
    expect(result.regex.source).toBe('^(.+?)-v(.+)$');
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts bare {version} to regex', () => {
    const result = tagFormatToRegex('{version}');
    expect(result.regex.source).toBe('^(.+)$');
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('converts {prefix}/{version} with slash separator', () => {
    const result = tagFormatToRegex('{prefix}/{version}');
    expect(result.regex.source).toBe('^(.+?)/(.+)$');
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts {prefix}@{version} with at-sign separator', () => {
    const result = tagFormatToRegex('{prefix}@{version}');
    expect(result.regex.source).toBe('^(.+?)@(.+)$');
    expect(result.prefixGroup).toBe(1);
    expect(result.versionGroup).toBe(2);
  });

  it('converts release/v{version} with literal path prefix', () => {
    const result = tagFormatToRegex('release/v{version}');
    expect(result.regex.source).toBe('^release/v(.+)$');
    expect(result.prefixGroup).toBeNull();
    expect(result.versionGroup).toBe(1);
  });

  it('escapes regex special characters in literal parts', () => {
    const result = tagFormatToRegex('release.{version}');
    expect(result.regex.source).toBe('^release\\.(.+)$');
  });

  it('throws when {version} placeholder is missing', () => {
    expect(() => tagFormatToRegex('{prefix}-release')).toThrow(
      'Tag format must contain {version}',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: FAIL — `tagFormatToRegex` is not exported / does not exist.

- [ ] **Step 3: Implement `tagFormatToRegex`**

In `src/core/tag-parser.ts`, add after the imports (line 2) and before `parseTag`:

```typescript
export interface TagFormatRegex {
  regex: RegExp;
  prefixGroup: number | null;
  versionGroup: number;
}

export function tagFormatToRegex(format: string): TagFormatRegex {
  let prefixGroup: number | null = null;
  let versionGroup = 0;
  let groupIndex = 0;

  const parts = format.split(/(\{prefix\}|\{version\})/);
  let pattern = '';

  for (const part of parts) {
    if (part === '{prefix}') {
      groupIndex++;
      prefixGroup = groupIndex;
      pattern += '(.+?)';
    } else if (part === '{version}') {
      groupIndex++;
      versionGroup = groupIndex;
      pattern += '(.+)';
    } else {
      pattern += part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  if (versionGroup === 0) {
    throw new Error('Tag format must contain {version} placeholder.');
  }

  return {
    regex: new RegExp(`^${pattern}$`),
    prefixGroup,
    versionGroup,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: All `tagFormatToRegex` tests PASS. All existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): add tagFormatToRegex utility for custom tag patterns"
```

---

### Task 3: Update `parseTag` to accept custom tag format

**Files:**
- Modify: `src/core/tag-parser.ts:4-31` (the `parseTag` function)
- Modify: `tests/core/tag-parser.test.ts`

- [ ] **Step 1: Write failing tests for `parseTag` with `tagFormat`**

Add a new `describe` block in `tests/core/tag-parser.test.ts` after the existing `parseTag` block:

```typescript
describe('parseTag with tagFormat', () => {
  it('parses v-prefixed tag with v{version} format', () => {
    expect(parseTag('v1.0.0', 'v{version}')).toEqual({
      raw: 'v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses bare version with {version} format', () => {
    expect(parseTag('1.0.0', '{version}')).toEqual({
      raw: '1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses multi-client tag with {prefix}-v{version} format', () => {
    expect(parseTag('mobile-v1.0.0', '{prefix}-v{version}')).toEqual({
      raw: 'mobile-v1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with slash separator {prefix}/{version}', () => {
    expect(parseTag('mobile/1.0.0', '{prefix}/{version}')).toEqual({
      raw: 'mobile/1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with at-sign separator {prefix}@{version}', () => {
    expect(parseTag('mobile@1.0.0', '{prefix}@{version}')).toEqual({
      raw: 'mobile@1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });

  it('parses tag with literal path prefix release/v{version}', () => {
    expect(parseTag('release/v1.0.0', 'release/v{version}')).toEqual({
      raw: 'release/v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
  });

  it('preserves suffix with custom format', () => {
    expect(parseTag('v1.0.0-beta.1', 'v{version}')).toEqual({
      raw: 'v1.0.0-beta.1',
      prefix: null,
      version: '1.0.0',
      suffix: '-beta.1',
    });
  });

  it('preserves suffix with prefix format', () => {
    expect(parseTag('mobile-v0.12.0-hotfix', '{prefix}-v{version}')).toEqual({
      raw: 'mobile-v0.12.0-hotfix',
      prefix: 'mobile',
      version: '0.12.0',
      suffix: '-hotfix',
    });
  });

  it('throws when tag does not match custom format', () => {
    expect(() => parseTag('badtag', 'v{version}')).toThrow(
      'Expected format: v{version}',
    );
  });

  it('throws when version part is not valid semver', () => {
    expect(() => parseTag('v-notaversion', 'v{version}')).toThrow(
      'Expected format: v{version}',
    );
  });

  it('parses hyphenated prefix with custom format', () => {
    expect(parseTag('my-app-v2.0.0', '{prefix}-v{version}')).toEqual({
      raw: 'my-app-v2.0.0',
      prefix: 'my-app',
      version: '2.0.0',
      suffix: null,
    });
  });

  it('falls back to legacy behavior when tagFormat is undefined', () => {
    expect(parseTag('v1.0.0')).toEqual({
      raw: 'v1.0.0',
      prefix: null,
      version: '1.0.0',
      suffix: null,
    });
    expect(parseTag('mobile-v1.0.0')).toEqual({
      raw: 'mobile-v1.0.0',
      prefix: 'mobile',
      version: '1.0.0',
      suffix: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: FAIL — `parseTag` does not accept a second parameter (tests pass but produce wrong results, or TypeScript compilation errors).

- [ ] **Step 3: Update `parseTag` to accept optional `tagFormat`**

Replace the entire `parseTag` function in `src/core/tag-parser.ts`:

```typescript
export function parseTag(tag: string, tagFormat?: string): ParsedTag {
  if (tagFormat) {
    const { regex, prefixGroup, versionGroup } = tagFormatToRegex(tagFormat);
    const match = tag.match(regex);
    if (match) {
      const prefix = prefixGroup ? match[prefixGroup] : null;
      const versionPart = match[versionGroup];
      const coerced = semver.coerce(versionPart);
      if (coerced) {
        const suffix = versionPart.slice(coerced.version.length) || null;
        return { raw: tag, prefix, version: coerced.version, suffix };
      }
    }
    throw new Error(
      `Invalid tag format: "${tag}". Expected format: ${tagFormat}`,
    );
  }

  // Legacy behavior: try multi-client then single-client
  const multiMatch = tag.match(/^(.+?)-v(.+)$/);
  if (multiMatch) {
    const [, prefix, versionPart] = multiMatch;
    const coerced = semver.coerce(versionPart);
    if (coerced) {
      const suffix = versionPart.slice(coerced.version.length) || null;
      return { raw: tag, prefix, version: coerced.version, suffix };
    }
  }

  const singleMatch = tag.match(/^v(.+)$/);
  if (singleMatch) {
    const [, versionPart] = singleMatch;
    const coerced = semver.coerce(versionPart);
    if (coerced) {
      const suffix = versionPart.slice(coerced.version.length) || null;
      return { raw: tag, prefix: null, version: coerced.version, suffix };
    }
  }

  throw new Error(
    `Invalid tag format: "${tag}". Expected <prefix>-v<semver> or v<semver>.`,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: ALL tests pass — new custom format tests and all existing legacy tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): support custom tagFormat in parseTag"
```

---

### Task 4: Update `validateTag` to use `tagFormat` from config

**Files:**
- Modify: `src/core/tag-parser.ts:58-78` (the `validateTag` function)
- Modify: `tests/core/tag-parser.test.ts`

- [ ] **Step 1: Write failing tests for `validateTag` with `tagFormat`**

Add tests to the existing `validateTag` describe block in `tests/core/tag-parser.test.ts`:

```typescript
  it('validates tag against custom tagFormat', () => {
    const config: ReleaseJetConfig = {
      ...singleClientConfig,
      tagFormat: '{version}',
    };
    const result = validateTag('1.0.0', config);
    expect(result).toEqual({ tag: '1.0.0', valid: true });
  });

  it('rejects tag that does not match custom tagFormat', () => {
    const config: ReleaseJetConfig = {
      ...singleClientConfig,
      tagFormat: '{version}',
    };
    const result = validateTag('v1.0.0', config);
    expect(result).toEqual({
      tag: 'v1.0.0',
      valid: false,
      reason: 'does not match expected format',
    });
  });

  it('validates multi-client tag with custom format and known prefix', () => {
    const config: ReleaseJetConfig = {
      ...multiClientConfig,
      tagFormat: '{prefix}/{version}',
    };
    const result = validateTag('mobile/1.0.0', config);
    expect(result).toEqual({ tag: 'mobile/1.0.0', valid: true });
  });

  it('rejects multi-client tag with custom format and unknown prefix', () => {
    const config: ReleaseJetConfig = {
      ...multiClientConfig,
      tagFormat: '{prefix}/{version}',
    };
    const result = validateTag('desktop/1.0.0', config);
    expect(result).toEqual({
      tag: 'desktop/1.0.0',
      valid: false,
      reason: 'unknown prefix "desktop" (expected: mobile, web)',
    });
  });

  it('falls back to legacy validation when tagFormat is undefined', () => {
    const result = validateTag('v1.2.3', singleClientConfig);
    expect(result).toEqual({ tag: 'v1.2.3', valid: true });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: FAIL — `validateTag('1.0.0', configWithTagFormat)` returns invalid because `parseTag('1.0.0')` throws with legacy behavior (tagFormat is not being passed through).

- [ ] **Step 3: Update `validateTag` to pass `tagFormat` to `parseTag`**

Replace `validateTag` in `src/core/tag-parser.ts`:

```typescript
export function validateTag(tagName: string, config: ReleaseJetConfig): TagValidationResult {
  try {
    const parsed = parseTag(tagName, config.tagFormat);

    // In multi-client mode, check that the prefix matches a configured client
    if (config.clients.length > 0 && parsed.prefix !== null) {
      const knownPrefixes = config.clients.map((c) => c.prefix);
      if (!knownPrefixes.includes(parsed.prefix)) {
        return {
          tag: tagName,
          valid: false,
          reason: `unknown prefix "${parsed.prefix}" (expected: ${knownPrefixes.join(', ')})`,
        };
      }
    }

    return { tag: tagName, valid: true };
  } catch {
    return { tag: tagName, valid: false, reason: 'does not match expected format' };
  }
}
```

The only change is `parseTag(tagName)` → `parseTag(tagName, config.tagFormat)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/tag-parser.test.ts`
Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/tag-parser.ts tests/core/tag-parser.test.ts
git commit -m "feat(tag-parser): pass tagFormat through validateTag"
```

---

### Task 5: Wire up generate command to pass `tagFormat`

**Files:**
- Modify: `src/cli/commands/generate.ts:91` and `src/cli/commands/generate.ts:108`

- [ ] **Step 1: Pass `config.tagFormat` to `parseTag` calls in generate command**

In `src/cli/commands/generate.ts`, update line 91:

```typescript
  const currentParsed = parseTag(options.tag, config.tagFormat);
```

Update line 108 (inside the `.map()` callback):

```typescript
        const parsed = parseTag(t.name, config.tagFormat);
```

- [ ] **Step 2: Update help text to reflect configurable format**

In `src/cli/commands/generate.ts`, replace the `Tag format:` section in the help text (lines 56-58):

```typescript
Tag format:
  Configured via tagFormat in .releasejet.yml (default: v<semver> or <prefix>-v<semver>)
`)
```

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: ALL tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/generate.ts
git commit -m "feat(generate): pass tagFormat from config to tag parser"
```

---

### Task 6: Add tag format step to init wizard

**Files:**
- Modify: `src/cli/commands/init.ts:104-117` (insert new step between client definitions and uncategorized mode)

- [ ] **Step 1: Add tag format prompt after client definitions**

In `src/cli/commands/init.ts`, add the following block after the client definitions loop (after line 102, before the uncategorized mode prompt):

```typescript
  // 6. Tag format
  const defaultFormat = isMultiClient ? '{prefix}-v{version}' : 'v{version}';
  const examplePrefix = clients.length > 0 ? clients[0].prefix : 'app';

  const singleChoices = [
    { name: `v{version}              (e.g. v1.0.0)`, value: 'v{version}' },
    { name: `{version}                (e.g. 1.0.0)`, value: '{version}' },
    { name: `release/v{version}       (e.g. release/v1.0.0)`, value: 'release/v{version}' },
    { name: 'Custom...', value: '__custom__' },
  ];

  const multiChoices = [
    { name: `{prefix}-v{version}     (e.g. ${examplePrefix}-v1.0.0)`, value: '{prefix}-v{version}' },
    { name: `{prefix}/{version}       (e.g. ${examplePrefix}/1.0.0)`, value: '{prefix}/{version}' },
    { name: `{prefix}@{version}       (e.g. ${examplePrefix}@1.0.0)`, value: '{prefix}@{version}' },
    { name: 'Custom...', value: '__custom__' },
  ];

  let tagFormat = await select({
    message: 'Tag format for your releases:',
    choices: isMultiClient ? multiChoices : singleChoices,
    default: defaultFormat,
  });

  if (tagFormat === '__custom__') {
    console.log('');
    console.log('Use placeholders to define your tag format:');
    console.log('  {version}  → semver version (e.g. 1.0.0)');
    if (isMultiClient) {
      console.log('  {prefix}   → client prefix (for multi-client repos)');
    }
    console.log('');
    console.log('Examples:');
    if (isMultiClient) {
      console.log(`  {prefix}/v{version}    → ${examplePrefix}/v1.0.0`);
      console.log(`  release/{prefix}-{version} → release/${examplePrefix}-1.0.0`);
    } else {
      console.log('  release-{version}      → release-1.0.0');
      console.log('  release/v{version}     → release/v1.0.0');
    }
    console.log('');

    const customFormat = await input({
      message: 'Your tag pattern:',
    });

    if (customFormat.trim()) {
      tagFormat = customFormat.trim();
    } else {
      tagFormat = defaultFormat;
    }

    // Validate custom format
    if (!tagFormat.includes('{version}')) {
      console.log(`  ⚠ Pattern must contain {version}. Using default: ${defaultFormat}`);
      tagFormat = defaultFormat;
    }
    if (!isMultiClient && tagFormat.includes('{prefix}')) {
      console.log('  ⚠ {prefix} is only valid for multi-client repos. Using default: ' + defaultFormat);
      tagFormat = defaultFormat;
    }

    // Show preview
    const preview = tagFormat
      .replace('{prefix}', examplePrefix)
      .replace('{version}', '1.0.0');
    console.log(`  → e.g. ${preview}`);
  }
```

- [ ] **Step 2: Write `tagFormat` to the config YAML**

In the config object construction (around line 192), add `tagFormat` right after `provider`:

```typescript
  const config: Record<string, unknown> = {
    provider: { type: providerType, url: providerUrl },
    tagFormat,
    categories,
    uncategorized,
  };
```

- [ ] **Step 3: Manually test the init wizard**

Run: `npm run dev -- init`
Expected:
1. After client definitions, a tag format selection appears
2. Selecting a preset writes the correct `tagFormat` to `.releasejet.yml`
3. Selecting "Custom..." shows the placeholder guide, accepts input, shows preview
4. Empty custom input falls back to default
5. Invalid patterns (missing `{version}`) show a warning and use the default

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/init.ts
git commit -m "feat(init): add tag format selection step to wizard"
```

---

### Task 7: Update example config, version, changelog, docs

**Files:**
- Modify: `.releasejet.example.yml`
- Modify: `package.json:3`
- Modify: `CHANGELOG.md:1-10`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `tagFormat` to example config**

Replace the full content of `.releasejet.example.yml`:

```yaml
# ReleaseJet Configuration
# Copy to .releasejet.yml and customize for your project.
# Or run: releasejet init

# Provider settings
# provider:
#   type: github          # or "gitlab"
#   url: https://github.com

# Tag format — how your git tags are structured
# Use {version} for the semver part and {prefix} for multi-client prefixes.
# Default: "v{version}" (single-client) or "{prefix}-v{version}" (multi-client)
# Examples: "{version}", "release/v{version}", "{prefix}/{version}", "{prefix}@{version}"
tagFormat: "v{version}"

# Client definitions (omit for single-client repos)
# clients:
#   - prefix: mobile
#     label: MOBILE
#   - prefix: web
#     label: WEB

# Category label mappings
# Key: the label name in your provider
# Value: the section heading in release notes
categories:
  feature: "New Features"
  bug: "Bug Fixes"
  improvement: "Improvements"
  breaking-change: "Breaking Changes"

# How to handle uncategorized issues
# "lenient" — include under "Other" with a warning (default)
# "strict" — fail release generation
uncategorized: lenient

# Contributors section in release notes (disabled by default)
# contributors:
#   enabled: true
#   exclude:
#     - dependabot
#     - renovate
```

- [ ] **Step 2: Bump version to 1.9.0**

In `package.json`, update line 3:

```json
"version": "1.9.0",
```

- [ ] **Step 3: Add changelog entry**

Add a new section at the top of `CHANGELOG.md` (after line 2):

```markdown
## [1.9.0] - 2026-04-16

### Added

- **Custom tag format support** — new `tagFormat` field in `.releasejet.yml` lets you define how your git tags are structured using `{version}` and `{prefix}` placeholders (e.g., `{version}`, `release/v{version}`, `{prefix}@{version}`)
- `init` wizard now includes a tag format selection step with common presets and a custom pattern option
- Tags like `1.0.0` (no `v` prefix), `release/v1.0.0`, and `app@1.0.0` are now supported when configured

### Changed

- `parseTag()` and `validateTag()` now respect the `tagFormat` config field
- `generate` command passes `tagFormat` to the tag parser for all tag operations
- Existing configs without `tagFormat` continue to work with the default `v{version}` / `{prefix}-v{version}` behavior
```

- [ ] **Step 4: Update CLAUDE.md tag parser description**

In `CLAUDE.md`, update the `src/core/tag-parser.ts` bullet under **Key modules** to mention custom formats:

```markdown
- `src/core/tag-parser.ts` — Parses tags using configurable `tagFormat` patterns; supports `{prefix}` and `{version}` placeholders with legacy fallback for `<prefix>-v<semver>` and `v<semver>`
```

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL tests pass.

- [ ] **Step 6: Commit**

```bash
git add .releasejet.example.yml package.json CHANGELOG.md CLAUDE.md
git commit -m "chore: bump version to 1.9.0 with changelog for custom tag format"
```
