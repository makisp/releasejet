import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildConfigYaml, clientsSection, projectNameSection, providerSection, sourceSection, type InitAnswers } from '../../src/cli/init-config-writer.js';

const DEFAULT_CATEGORIES = {
  feature: 'New Features',
  bug: 'Bug Fixes',
  improvement: 'Improvements',
  'breaking-change': 'Breaking Changes',
} as const;

function defaultsGithub(): InitAnswers {
  return {
    providerType: 'github',
    providerUrl: 'https://github.com',
    source: 'issues',
    clients: [],
    tagFormat: 'v{version}',
    categories: { ...DEFAULT_CATEGORIES },
    uncategorized: 'lenient',
    contributors: { enabled: false, exclude: [] },
  };
}

describe('buildConfigYaml', () => {
  it('emits the canonical single-client GitHub default file', () => {
    const out = buildConfigYaml(defaultsGithub());
    expect(out).toBe(
`# Optional. Overrides the project name shown in notifications.
# Defaults to the last path segment of projectUrl.
# projectName: "My Project"

# Which provider hosts your repository.
provider:
  type: github            # github | gitlab
  url: https://github.com

# What to summarise in release notes.
source: issues            # issues | pull_requests

# Multi-client repos: define tag prefixes and labels.
# clients:
#   - prefix: mobile
#     label: MOBILE

# How your git tags are structured. {version} is required; {prefix} is multi-client only.
tagFormat: v{version}     # e.g. v{version}, {version}, {prefix}-v{version}

# Map issue/PR labels to release-note section headings. Output order matches this map.
categories:
  feature: "New Features"
  bug: "Bug Fixes"
  improvement: "Improvements"
  breaking-change: "Breaking Changes"

# How to handle issues with no matching label.
uncategorized: lenient    # lenient | strict

# Issue/PR description rendering. Renders cleaned body as a sub-bullet under each item.
description: none         # none | extract

# Release notes template. "default" is built-in; named/path values require @releasejet/pro.
template: default

# Contributors section in release notes.
contributors:
  enabled: false          # true | false
  exclude: []             # usernames to skip (e.g. dependabot, renovate)
`);
  });

  it('the emitted YAML round-trips through parseYaml without error', () => {
    const out = buildConfigYaml(defaultsGithub());
    const parsed = parseYaml(out) as Record<string, unknown>;
    expect(parsed.tagFormat).toBe('v{version}');
    expect(parsed.uncategorized).toBe('lenient');
    expect(parsed.description).toBe('none');
    expect(parsed.template).toBe('default');
    expect(parsed.contributors).toEqual({ enabled: false, exclude: [] });
  });
});

describe('projectNameSection', () => {
  it('returns a commented-out stub with explanation', () => {
    expect(projectNameSection()).toBe(
`# Optional. Overrides the project name shown in notifications.
# Defaults to the last path segment of projectUrl.
# projectName: "My Project"`,
    );
  });
});

describe('providerSection', () => {
  it('emits github with inline enum hint and unannotated url', () => {
    expect(providerSection('github', 'https://github.com')).toBe(
`# Which provider hosts your repository.
provider:
  type: github            # github | gitlab
  url: https://github.com`,
    );
  });

  it('emits gitlab with the provided URL', () => {
    expect(providerSection('gitlab', 'https://gitlab.example.com')).toBe(
`# Which provider hosts your repository.
provider:
  type: gitlab            # github | gitlab
  url: https://gitlab.example.com`,
    );
  });
});

describe('clientsSection', () => {
  it('emits a commented stub when no clients are provided', () => {
    expect(clientsSection([])).toBe(
`# Multi-client repos: define tag prefixes and labels.
# clients:
#   - prefix: mobile
#     label: MOBILE`,
    );
  });

  it('emits an active list with multiple clients in input order', () => {
    expect(clientsSection([
      { prefix: 'mobile', label: 'MOBILE' },
      { prefix: 'web', label: 'WEB' },
    ])).toBe(
`# Define tag prefixes and labels for each client.
clients:
  - prefix: mobile
    label: MOBILE
  - prefix: web
    label: WEB`,
    );
  });
});

describe('sourceSection', () => {
  it('emits issues with enum hint', () => {
    expect(sourceSection('issues')).toBe(
`# What to summarise in release notes.
source: issues            # issues | pull_requests`,
    );
  });

  it('emits pull_requests with enum hint', () => {
    expect(sourceSection('pull_requests')).toBe(
`# What to summarise in release notes.
source: pull_requests     # issues | pull_requests`,
    );
  });
});
