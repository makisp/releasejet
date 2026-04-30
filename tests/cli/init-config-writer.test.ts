import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { buildConfigYaml, categoriesSection, clientsSection, contributorsSection, descriptionSection, jiraSection, projectNameSection, providerSection, sourceSection, tagFormatSection, templateSection, uncategorizedSection, type InitAnswers } from '../../src/cli/init-config-writer.js';

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

# Jira ticket linking — append [PROJ-123] links next to each issue/PR
# when a configured project key is detected in the title or body.
#
# jira:
#   baseUrl: https://acme.atlassian.net
#   projects: [PROJ, BUG]
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

describe('tagFormatSection', () => {
  it('emits the default single-client format with hint examples', () => {
    expect(tagFormatSection('v{version}')).toBe(
`# How your git tags are structured. {version} is required; {prefix} is multi-client only.
tagFormat: v{version}     # e.g. v{version}, {version}, {prefix}-v{version}`,
    );
  });

  it('emits a custom multi-client format unchanged', () => {
    expect(tagFormatSection('{prefix}/v{version}')).toBe(
`# How your git tags are structured. {version} is required; {prefix} is multi-client only.
tagFormat: {prefix}/v{version}  # e.g. v{version}, {version}, {prefix}-v{version}`,
    );
  });
});

describe('categoriesSection', () => {
  it('emits the default categories with quoted headings, in input order', () => {
    expect(categoriesSection({
      feature: 'New Features',
      bug: 'Bug Fixes',
      improvement: 'Improvements',
      'breaking-change': 'Breaking Changes',
    })).toBe(
`# Map issue/PR labels to release-note section headings. Output order matches this map.
categories:
  feature: "New Features"
  bug: "Bug Fixes"
  improvement: "Improvements"
  breaking-change: "Breaking Changes"`,
    );
  });

  it('escapes embedded double quotes in headings', () => {
    expect(categoriesSection({ docs: 'Docs "extras"' })).toBe(
`# Map issue/PR labels to release-note section headings. Output order matches this map.
categories:
  docs: "Docs \\"extras\\""`,
    );
  });
});

describe('uncategorizedSection', () => {
  it('emits lenient with enum hint', () => {
    expect(uncategorizedSection('lenient')).toBe(
`# How to handle issues with no matching label.
uncategorized: lenient    # lenient | strict`,
    );
  });

  it('emits strict with enum hint', () => {
    expect(uncategorizedSection('strict')).toBe(
`# How to handle issues with no matching label.
uncategorized: strict     # lenient | strict`,
    );
  });
});

describe('descriptionSection', () => {
  it('emits none with enum hint', () => {
    expect(descriptionSection()).toBe(
`# Issue/PR description rendering. Renders cleaned body as a sub-bullet under each item.
description: none         # none | extract`,
    );
  });
});

describe('templateSection', () => {
  it('emits the default template with explanation', () => {
    expect(templateSection()).toBe(
`# Release notes template. "default" is built-in; named/path values require @releasejet/pro.
template: default`,
    );
  });
});

describe('contributorsSection', () => {
  it('emits enabled: false with empty exclude list and aligned inline comments', () => {
    expect(contributorsSection({ enabled: false, exclude: [] })).toBe(
`# Contributors section in release notes.
contributors:
  enabled: false          # true | false
  exclude: []             # usernames to skip (e.g. dependabot, renovate)`,
    );
  });

  it('emits enabled: true while keeping exclude empty', () => {
    expect(contributorsSection({ enabled: true, exclude: [] })).toBe(
`# Contributors section in release notes.
contributors:
  enabled: true           # true | false
  exclude: []             # usernames to skip (e.g. dependabot, renovate)`,
    );
  });

  it('emits a populated exclude list as a flow-style array', () => {
    expect(contributorsSection({
      enabled: false,
      exclude: ['dependabot', 'renovate'],
    })).toBe(
`# Contributors section in release notes.
contributors:
  enabled: false                       # true | false
  exclude: [dependabot, renovate]      # usernames to skip (e.g. dependabot, renovate)`,
    );
  });
});

describe('buildConfigYaml — variants', () => {
  it('omits the source section for GitLab', () => {
    const out = buildConfigYaml({
      providerType: 'gitlab',
      providerUrl: 'https://gitlab.example.com',
      clients: [],
      tagFormat: 'v{version}',
      categories: { ...DEFAULT_CATEGORIES },
      uncategorized: 'lenient',
      contributors: { enabled: false, exclude: [] },
    });
    expect(out).not.toContain('source:');
    expect(out).toContain('type: gitlab');
  });

  it('emits an active clients block in input order for multi-client repos', () => {
    const out = buildConfigYaml({
      ...defaultsGithub(),
      clients: [
        { prefix: 'mobile', label: 'MOBILE' },
        { prefix: 'web', label: 'WEB' },
      ],
    });
    expect(out).toContain(
`# Define tag prefixes and labels for each client.
clients:
  - prefix: mobile
    label: MOBILE
  - prefix: web
    label: WEB`,
    );
    expect(out).not.toContain('# clients:');
  });

  it('emits custom categories in input order with quoted headings', () => {
    const out = buildConfigYaml({
      ...defaultsGithub(),
      categories: { docs: 'Documentation', chore: 'Chores' },
    });
    const parsed = parseYaml(out) as { categories: Record<string, string> };
    expect(Object.keys(parsed.categories)).toEqual(['docs', 'chore']);
    expect(parsed.categories).toEqual({ docs: 'Documentation', chore: 'Chores' });
  });

  it('emits contributors.enabled: true when wizard enables contributors', () => {
    const out = buildConfigYaml({
      ...defaultsGithub(),
      contributors: { enabled: true, exclude: [] },
    });
    const parsed = parseYaml(out) as { contributors: unknown };
    expect(parsed.contributors).toEqual({ enabled: true, exclude: [] });
  });

  it('emits a custom tagFormat verbatim', () => {
    const out = buildConfigYaml({
      ...defaultsGithub(),
      tagFormat: 'release/v{version}',
    });
    const parsed = parseYaml(out) as { tagFormat: string };
    expect(parsed.tagFormat).toBe('release/v{version}');
  });
});

describe('jiraSection', () => {
  it('emits a commented placeholder when jira is undefined', () => {
    const out = jiraSection(undefined);
    expect(out).toBe(
`# Jira ticket linking — append [PROJ-123] links next to each issue/PR
# when a configured project key is detected in the title or body.
#
# jira:
#   baseUrl: https://acme.atlassian.net
#   projects: [PROJ, BUG]`,
    );
  });

  it('emits a populated block when jira is set', () => {
    const out = jiraSection({
      baseUrl: 'https://acme.atlassian.net',
      projects: ['PROJ', 'BUG'],
    });
    expect(out).toBe(
`# Jira ticket linking — append [PROJ-123] links next to each issue/PR
# when a configured project key is detected in the title or body.
jira:
  baseUrl: https://acme.atlassian.net
  projects: [PROJ, BUG]`,
    );
  });
});

describe('buildConfigYaml — jira', () => {
  it('includes the commented jira placeholder when jira is omitted', () => {
    const out = buildConfigYaml({
      providerType: 'github',
      providerUrl: 'https://github.com',
      source: 'issues',
      clients: [],
      tagFormat: 'v{version}',
      categories: { feature: 'New Features' },
      uncategorized: 'lenient',
      contributors: { enabled: false, exclude: [] },
    });
    expect(out).toContain('# Jira ticket linking — append [PROJ-123] links');
    expect(out).toContain('# jira:');
    expect(out).not.toMatch(/^jira:/m);
  });

  it('includes a populated jira block when jira is set', () => {
    const out = buildConfigYaml({
      providerType: 'github',
      providerUrl: 'https://github.com',
      source: 'issues',
      clients: [],
      tagFormat: 'v{version}',
      categories: { feature: 'New Features' },
      uncategorized: 'lenient',
      contributors: { enabled: false, exclude: [] },
      jira: { baseUrl: 'https://acme.atlassian.net', projects: ['PROJ'] },
    });
    expect(out).toMatch(/^jira:$/m);
    expect(out).toContain('  baseUrl: https://acme.atlassian.net');
    expect(out).toContain('  projects: [PROJ]');
  });
});
