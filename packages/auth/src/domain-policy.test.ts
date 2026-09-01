import { describe, expect, it } from "vitest";
import { EmailDomainPolicy, loadEmailDomainPolicy } from "./domain-policy";

const policy = new EmailDomainPolicy(["teambespin.us"]);

describe("EmailDomainPolicy — allowed addresses", () => {
  it.each([
    "peyton@teambespin.us",
    "first.last@teambespin.us",
    "user+tag@teambespin.us",
    "UPPER@TEAMBESPIN.US",
    "  padded@teambespin.us  ",
    "MiXeD.CaSe@TeamBespin.us",
  ])("admits %j", (email) => {
    expect(policy.isAllowed(email)).toBe(true);
  });
});

describe("EmailDomainPolicy — suffix and prefix attacks", () => {
  it.each([
    // The classic `endsWith` bug: a different domain that ends with ours.
    "attacker@evil-teambespin.us",
    "attacker@notteambespin.us",
    // Our domain as a prefix of a longer attacker-controlled domain.
    "attacker@teambespin.us.attacker.com",
    "attacker@teambespin.username.com",
    // Subdomains are explicitly not allowed.
    "user@dev.teambespin.us",
    "user@mail.teambespin.us",
    // Domain embedded in the local part.
    "teambespin.us@gmail.com",
    "user@teambespin.us@gmail.com",
  ])("rejects %j", (email) => {
    expect(policy.isAllowed(email)).toBe(false);
  });
});

describe("EmailDomainPolicy — malformed input", () => {
  it.each([
    "",
    "   ",
    "no-at-sign",
    "@teambespin.us",
    "user@",
    "user@@teambespin.us",
    "user@teambespin",
    "user@.teambespin.us",
    "user@teambespin..us",
    "user@teambespin.us.",
    "user @teambespin.us",
    "user@team bespin.us",
    "user@teambespin.us\n",
  ])("rejects %j", (email) => {
    expect(policy.isAllowed(email)).toBe(false);
  });

  it("rejects a newline-smuggled second address", () => {
    expect(policy.isAllowed("user@evil.com\nuser@teambespin.us")).toBe(false);
  });
});

describe("EmailDomainPolicy — homoglyph and unicode lookalikes", () => {
  it("rejects a Cyrillic-e lookalike domain", () => {
    // U+0435 CYRILLIC SMALL LETTER IE in place of the second ASCII "e".
    const lookalike = "user@t\u0435ambespin.us";
    expect(lookalike).not.toBe("user@teambespin.us");
    expect(policy.isAllowed(lookalike)).toBe(false);
  });

  it("rejects a punycode-encoded lookalike", () => {
    expect(policy.isAllowed("user@xn--tambespin-6cf.us")).toBe(false);
  });
});

describe("EmailDomainPolicy — extractDomain", () => {
  it("takes the domain after the last @ for well-formed input", () => {
    expect(EmailDomainPolicy.extractDomain("a@teambespin.us")).toBe("teambespin.us");
  });

  it("returns null rather than guessing on multiple @", () => {
    expect(EmailDomainPolicy.extractDomain("a@b@teambespin.us")).toBeNull();
  });

  it("lowercases the extracted domain", () => {
    expect(EmailDomainPolicy.extractDomain("a@TeamBespin.US")).toBe("teambespin.us");
  });
});

describe("EmailDomainPolicy — construction", () => {
  it("refuses an empty allowlist rather than defaulting to allow-all", () => {
    expect(() => new EmailDomainPolicy([])).toThrow(/at least one allowed domain/);
    expect(() => new EmailDomainPolicy(["", "  "])).toThrow(/at least one allowed domain/);
  });

  it("normalizes a leading @ and surrounding whitespace", () => {
    const normalized = new EmailDomainPolicy([" @TeamBespin.us "]);
    expect(normalized.domains).toEqual(["teambespin.us"]);
    expect(normalized.isAllowed("user@teambespin.us")).toBe(true);
  });

  it("supports multiple domains", () => {
    const multi = new EmailDomainPolicy(["teambespin.us", "example.mil"]);
    expect(multi.isAllowed("user@teambespin.us")).toBe(true);
    expect(multi.isAllowed("user@example.mil")).toBe(true);
    expect(multi.isAllowed("user@other.com")).toBe(false);
  });

  it("produces a rejection message naming the allowed domains", () => {
    expect(policy.rejectionMessage()).toContain("@teambespin.us");
  });
});

describe("loadEmailDomainPolicy", () => {
  it("defaults to teambespin.us when unset", () => {
    expect(loadEmailDomainPolicy({}).domains).toEqual(["teambespin.us"]);
  });

  it("honors a comma-separated override", () => {
    const loaded = loadEmailDomainPolicy({
      AUTH_ALLOWED_EMAIL_DOMAINS: "teambespin.us, staging.example.com",
    } as NodeJS.ProcessEnv);
    expect(loaded.domains).toEqual(["staging.example.com", "teambespin.us"]);
  });

  it("throws when the override is present but empty", () => {
    expect(() =>
      loadEmailDomainPolicy({ AUTH_ALLOWED_EMAIL_DOMAINS: " , " } as NodeJS.ProcessEnv),
    ).toThrow(/at least one allowed domain/);
  });
});
