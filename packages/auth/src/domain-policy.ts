/**
 * Email domain allowlist.
 *
 * This is the single highest-risk function in the auth package: it is the only
 * thing standing between "Team Bespin only" and "anyone on the internet".
 *
 * Deliberately strict:
 * - exact equality against an allowlist Set, never `endsWith`. `endsWith`
 *   would accept `evil-teambespin.us` and `teambespin.us.attacker.com`.
 * - subdomains are NOT allowed (`someone@dev.teambespin.us` is rejected).
 * - the domain is taken from the LAST `@`, and any address containing more
 *   than one `@` is rejected outright rather than parsed heuristically.
 * - exact ASCII matching fails closed against IDN/homoglyph lookalikes: a
 *   Cyrillic-looking `teambespin.us` simply is not in the Set.
 */

export const DEFAULT_ALLOWED_EMAIL_DOMAINS = ["teambespin.us"] as const;

/**
 * True when the string contains an ASCII control character (including CR, LF,
 * TAB, and DEL). Written as an explicit scan rather than a regex so the intent
 * is unambiguous and no lint suppression is needed.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export class EmailDomainPolicy {
  private readonly allowed: ReadonlySet<string>;

  constructor(domains: readonly string[]) {
    const normalized = domains
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter((domain) => domain.length > 0);

    if (normalized.length === 0) {
      // Fail fast and loudly: an empty allowlist would admit nobody, but a
      // future refactor that treats "empty" as "allow all" would admit
      // everybody. Refuse to construct one at all.
      throw new Error("EmailDomainPolicy requires at least one allowed domain");
    }

    this.allowed = new Set(normalized);
  }

  /** Domains this policy admits, for logging and error messages. */
  get domains(): string[] {
    return [...this.allowed].sort();
  }

  /**
   * Extract the domain of an email address, or null when the address is not
   * a single, well-formed `local@domain` pair.
   */
  static extractDomain(rawEmail: string): string | null {
    // Reject control characters outright instead of trimming them away. A
    // trailing "\n" must not be silently normalized into a valid address, and
    // a smuggled newline must never reach an email transport.
    if (hasControlCharacter(rawEmail)) return null;

    const email = rawEmail.trim().toLowerCase();

    // No whitespace anywhere after trimming the ends — this covers the local
    // part ("user @example.com") as well as the domain.
    if (/\s/.test(email)) return null;

    const at = email.lastIndexOf("@");

    // No `@`, leading `@` (empty local part), or trailing `@` (empty domain).
    if (at <= 0 || at === email.length - 1) return null;

    const local = email.slice(0, at);
    const domain = email.slice(at + 1);

    // More than one `@` — refuse rather than guess.
    if (local.includes("@")) return null;

    // A domain must have at least one dot.
    if (!domain.includes(".")) return null;

    // Reject empty labels (`foo..com`, `.com`, `com.`).
    if (domain.split(".").some((label) => label.length === 0)) return null;

    return domain;
  }

  isAllowed(rawEmail: string): boolean {
    const domain = EmailDomainPolicy.extractDomain(rawEmail);
    if (domain === null) return false;
    return this.allowed.has(domain);
  }

  /** Human-readable rejection message. The rule is structural, not secret. */
  rejectionMessage(): string {
    const list = this.domains.map((d) => `@${d}`).join(", ");
    return `Lighthouse is limited to ${list} accounts.`;
  }
}

/**
 * Build the policy from configuration. `AUTH_ALLOWED_EMAIL_DOMAINS` is a
 * comma-separated override; when unset, the built-in default applies.
 */
export function loadEmailDomainPolicy(env: NodeJS.ProcessEnv = process.env): EmailDomainPolicy {
  const configured = env.AUTH_ALLOWED_EMAIL_DOMAINS?.split(",") ?? [];
  const domains = configured.length > 0 ? configured : [...DEFAULT_ALLOWED_EMAIL_DOMAINS];
  return new EmailDomainPolicy(domains);
}
