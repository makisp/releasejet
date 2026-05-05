import { parseDocument, YAMLSeq, YAMLMap, isSeq } from 'yaml';

export interface NotificationEntryInput {
  type: 'slack' | 'discord' | 'teams';
  enabled: boolean;
  /** Bare env-var name, e.g., "SLACK_WEBHOOK_URL". */
  envVarName: string;
}

export interface RawNotification {
  /** Verbatim from YAML; falls back to "" if missing/non-string. */
  type: string;
  /** Verbatim if boolean; defaults to false otherwise. */
  enabled: boolean;
  /** Literal text from YAML (e.g., "${SLACK_WEBHOOK_URL}"). */
  webhookUrl: string;
  /** Optional template field from YAML, undefined when absent or empty. */
  template: string | undefined;
}

/**
 * Same regex set as src/core/notification-url-validator.ts. Duplicated here
 * so this module stays standalone-pure; keep the two lists in sync. The
 * matching command-side validation re-uses this helper for both interactive
 * re-prompts and flag-mode rejection.
 */
const LITERAL_WEBHOOK_PATTERNS: RegExp[] = [
  /^https:\/\/hooks\.slack\.com\/services\//i,
  /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i,
  /^https:\/\/prod-[^.]+\.[^.]+\.logic\.azure\.com(:\d+)?\/workflows\//i,
  /^https:\/\/outlook\.office\.com\/webhook\//i,
  /^https:\/\/[^/]+\.webhook\.office\.com\/webhookb2\//i,
];

export function isLiteralWebhookUrl(value: string): boolean {
  return LITERAL_WEBHOOK_PATTERNS.some((re) => re.test(value));
}

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_REF_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

/**
 * Accepts either a bare name ("SLACK_WEBHOOK_URL") or a `${NAME}` reference
 * and returns the bare name, or `null` if invalid.
 */
export function parseEnvVarReference(input: string): string | null {
  const trimmed = input.trim();
  const refMatch = trimmed.match(ENV_REF_RE);
  if (refMatch) return refMatch[1];
  if (ENV_NAME_RE.test(trimmed)) return trimmed;
  return null;
}

export function appendNotificationEntry(
  yamlSource: string,
  entry: NotificationEntryInput,
): string {
  const doc = parseDocument(yamlSource);
  if (doc.contents === null || doc.contents === undefined) {
    doc.contents = doc.createNode({}) as typeof doc.contents;
  }

  const existing = doc.get('notifications', true);
  let seq: YAMLSeq;
  if (existing && isSeq(existing)) {
    seq = existing;
  } else {
    seq = new YAMLSeq();
    doc.set('notifications', seq);
  }

  const map = new YAMLMap();
  map.set('type', entry.type);
  map.set('enabled', entry.enabled);
  map.set('webhookUrl', `\${${entry.envVarName}}`);
  seq.add(map);

  return doc.toString({ lineWidth: 0 });
}

export function readNotificationsRaw(yamlSource: string): RawNotification[] {
  const doc = parseDocument(yamlSource);
  const node = doc.get('notifications', true);
  if (!node || !isSeq(node)) return [];

  const out: RawNotification[] = [];
  for (const item of node.items) {
    // toJSON gives us a plain object even for partially-broken entries.
    const plain = (item as { toJSON?: () => unknown }).toJSON?.() ?? item;
    if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
      out.push({ type: '', enabled: false, webhookUrl: '', template: undefined });
      continue;
    }
    const e = plain as Record<string, unknown>;
    out.push({
      type: typeof e.type === 'string' ? e.type : '',
      enabled: typeof e.enabled === 'boolean' ? e.enabled : false,
      webhookUrl: typeof e.webhookUrl === 'string' ? e.webhookUrl : '',
      template: typeof e.template === 'string' && e.template !== '' ? e.template : undefined,
    });
  }
  return out;
}
