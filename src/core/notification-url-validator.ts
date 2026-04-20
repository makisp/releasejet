interface Pattern {
  regex: RegExp;
  platform: 'slack' | 'discord' | 'teams';
  legacyConnector?: boolean;
}

const PATTERNS: Pattern[] = [
  { regex: /^https:\/\/hooks\.slack\.com\/services\//i, platform: 'slack' },
  { regex: /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//i, platform: 'discord' },
  { regex: /^https:\/\/prod-[^.]+\.[^.]+\.logic\.azure\.com(:\d+)?\/workflows\//i, platform: 'teams' },
  { regex: /^https:\/\/outlook\.office\.com\/webhook\//i, platform: 'teams', legacyConnector: true },
  { regex: /^https:\/\/[^/]+\.webhook\.office\.com\/webhookb2\//i, platform: 'teams', legacyConnector: true },
];

export function assertNoLiteralWebhookUrls(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const notifications = (raw as Record<string, unknown>).notifications;
  if (!Array.isArray(notifications)) return;

  for (let i = 0; i < notifications.length; i++) {
    const entry = notifications[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const webhookUrl = (entry as Record<string, unknown>).webhookUrl;
    if (typeof webhookUrl !== 'string') continue;

    for (const pat of PATTERNS) {
      if (pat.regex.test(webhookUrl)) {
        const base =
          `Invalid config in .releasejet.yml\n\n` +
          `  notifications[${i}].webhookUrl contains a literal webhook URL. ` +
          `Webhook URLs are secrets — move it to an environment variable and reference it as \${YOUR_VAR_NAME}.`;
        const suffix = pat.legacyConnector
          ? `\n\n  Note: Legacy connectors are being deprecated by Microsoft (retirement 22 May 2026). ` +
            `Create a Power Automate workflow ("Post adaptive card in channel") and use its trigger URL instead.`
          : '';
        throw new Error(base + suffix);
      }
    }
  }
}
