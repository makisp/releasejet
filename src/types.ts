export interface ClientConfig {
  prefix: string;
  label: string;
}

export interface ContributorsConfig {
  enabled: boolean;
  exclude: string[];
}

export type WebhookEventName = 'release.generated' | 'release.published';

export interface SlackDiscordTeamsChannelConfig {
  type: 'slack' | 'discord' | 'teams';
  enabled: boolean;
  webhookUrl: string;
  /** Optional Handlebars template for this channel's message body.
   *  When omitted or empty, the default Pro M2 message is used. */
  template?: string;
  /** Suppress the AI release-overview block in this channel's card.
   *  Defaults to true (rendered when data.aiSummary is populated).
   *  Has no effect when data.aiSummary is undefined or empty. (Pro M3.1+) */
  includeAiSummary?: boolean;
}

export interface WebhookChannelConfig {
  type: 'webhook';
  enabled: boolean;
  /** Arbitrary URL — any http(s) endpoint. */
  url: string;
  /** Optional HMAC-SHA256 secret. If present, X-ReleaseJet-Signature header is sent. */
  secret?: string;
  /** Required, non-empty list of events this channel subscribes to. */
  events: WebhookEventName[];
  /** Optional custom HTTP headers to send. ${VAR} expansion supported on values.
   *  X-ReleaseJet-* and Content-Type are reserved and rejected by validation. */
  headers?: Record<string, string>;
}

export type NotificationChannelConfig =
  | SlackDiscordTeamsChannelConfig
  | WebhookChannelConfig;

export interface JiraConfig {
  baseUrl: string;
  projects: string[];
}

export interface Contributor {
  username: string;
  profileUrl: string;
}

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
  /** Additional, older tag-format patterns to recognise alongside `tagFormat`.
   *  Used when migrating to a new `tagFormat`: tags written under a previous
   *  format (e.g. "{prefix}-v{version}-version") are still parsed as full
   *  releases — with `suffix: null` — instead of being mistaken for
   *  pre-releases and skipped during previous-tag detection. Each entry must
   *  contain the {version} placeholder. Only honoured when `tagFormat` is set. */
  legacyTagFormats?: string[];
  notifications?: NotificationChannelConfig[];
  /** Human-readable project name shown in notification cards.
   *  When unset, derived from projectUrl's last path segment. */
  projectName?: string;
  /** Description handling: 'none' (off, default), 'extract' (F4: take cleaned first paragraph), 'ai' (Pro M3a; treated as 'none' in core when egress not allowed). */
  description?: 'none' | 'extract' | 'ai';
  /** AI release-overview paragraph (Pro M3b). Treated as off in core when egress not allowed. */
  aiSummary?: {
    enabled: boolean;
  };
  /** AI consent. `allowDataEgress: true` is required for any AI feature to run. */
  ai?: {
    allowDataEgress: boolean;
  };
  /** Jira ticket linking (F3). When present, detected ticket IDs in issue/PR
   *  text are rendered as inline links beside each issue line. */
  jira?: JiraConfig;
  /** Labels that mark an issue as internal-only. Issues carrying any of these
   *  labels are filtered out before categorization, regardless of other labels.
   *  Always populated (defaults to []) after parseConfig. */
  excludeLabels?: string[];
  /** Project identifier (UUID v4). Optional. Consumed by external integrations
   *  to route per-project payloads. Core treats it as an opaque passthrough
   *  and performs no runtime behavior based on it. */
  projectId?: string;
}

export interface ParsedTag {
  raw: string;
  prefix: string | null;
  version: string;
  suffix: string | null;
}

export type TagDateSource = 'annotated' | 'release' | 'commit';

export interface TagInfo extends ParsedTag {
  createdAt: string;
  commitDate: string;
  dateSource: TagDateSource;
}

export interface Issue {
  number: number;
  title: string;
  labels: string[];
  closedAt: string;
  webUrl: string;
  milestone: { title: string; url: string } | null;
  author: string | null;
  assignee: string | null;
  closedBy: string | null;
  /** Raw body/description from the provider, before extraction. Null when the upstream had no body. */
  rawBody?: string | null;
  /** Cleaned, extracted excerpt (≤ ~200 chars). Undefined when extraction is off or the body yielded nothing after cleaning. */
  description?: string;
  /** Detected Jira ticket IDs (e.g. ["PROJ-123", "PROJ-124"]),
   *  ordered by first appearance in title-then-body, deduped.
   *  Undefined when jira config is unset or no matches found. */
  jiraTickets?: string[];
}

export interface Milestone {
  id: number;
  title: string;
  state: string;
}

export interface CategorizedIssues {
  categorized: Record<string, Issue[]>;
  uncategorized: Issue[];
  /** Issues filtered out by config.excludeLabels before categorization.
   *  Internal to the collector — consumers (formatter, contributors,
   *  milestone, webhook envelope) do not read this bucket. */
  excluded: Issue[];
}

export interface ReleaseNotesData {
  tagName: string;
  version: string;
  clientPrefix: string | null;
  date: string;
  milestone: { title: string; url: string } | null;
  projectUrl: string;
  issues: CategorizedIssues;
  totalCount: number;
  uncategorizedCount: number;
  contributors: Contributor[];
  /** AI-generated release overview (Pro M3b). Undefined when AI is off, declined, or failed. */
  aiSummary?: string;
}
