#!/usr/bin/env node
/**
 * Phase 13 — secret / credential scanner (zero dependencies).
 *
 * Scans every GIT-TRACKED file for credential patterns and fails the build
 * with a clear report if any real-looking secret is committed. Designed for
 * the CI security lane (`node scripts/security-scan.mjs`).
 *
 * Guarantees:
 *  - never PRINTS a matched secret value (only pattern name + file:line);
 *  - ignores untracked files (local `.env` stays local by design);
 *  - knows about deliberate placeholder forms used in .env.example and in
 *    log-masking code so documentation is not flagged as a leak;
 *  - exits 1 on any finding, 0 when clean.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();

/** Binary-ish or generated trees that are never meaningfully scannable. */
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".pdf", ".zip",
  ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".mp3", ".wav",
]);
const SKIP_DIRS = /(^|[/\\])(node_modules|\.git|dist|build|coverage|\.expo)([/\\]|$)/;

/**
 * `audit/` holds THIRD-PARTY reference snapshots (zip comparisons of other
 * projects, see docs/ZIP_COMPARISON.md). It is never built or deployed and
 * contains no Business OS credentials, so it is out of scope for this
 * repository's leak scan.
 */
const SKIP_PREFIXES = ["audit/"];

/**
 * Credential patterns. Each entry: [rule name, regex].
 * Keep patterns CONSERVATIVE — a secret scanner that cries wolf gets ignored.
 */
const RULES = [
  [
    "MongoDB URI with embedded credentials",
    /mongodb(\+srv)?:\/\/[^\s"'`<>]*:[^\s"'`<>@]+@/i,
  ],
  ["PostgreSQL/MySQL URI with credentials", /postgres(ql)?:\/\/[^\s"'`<>]*:[^\s"'`<>@]+@|mysql:\/\/[^\s"'`<>]*:[^\s"'`<>@]+@/i],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["Private key block", /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
  ["Google API key", /\bAIza[0-9A-Za-z\-_]{35}\b/],
  ["Firebase service-account private key in JSON", /"private_key"\s*:\s*"-----BEGIN/],
  ["Slack token", /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/],
  ["GitHub personal access token", /\bgh[pousr]_[0-9A-Za-z]{36}\b/],
  ["Stripe live key", /\bsk_live_[0-9A-Za-z]{16,}\b/],
  ["JWT literal with three base64url segments labelled secret", /jwt[_-]?secret\s*[:=]\s*["'][A-Za-z0-9+/=_-]{40,}["']/i],
];

/**
 * Placeholder markers. A line containing any of these is treated as
 * documentation/template rather than a live credential.
 */
/**
 * Placeholder markers. A line containing any of these is treated as
 * documentation/template rather than a live credential.
 *
 * Contract: any test fixture or doc sample that deliberately embeds a
 * REALISTIC-LOOKING credential (e.g. to prove log redaction works) MUST
 * carry one of these markers on the same line. Real secrets never do.
 */
const PLACEHOLDER_MARKERS = [
  "<user>", "<password>", "<password>", "username:password", "user:pass",
  "***:***", "your-", "changeme", "change-me", "example.com", "example.org",
  "xxxxxx", "****", "REDACTED", "placeholder", "fixture", "not-real",
];

function isPlaceholderLine(line) {
  const lower = line.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

function listTrackedFiles() {
  const out = execSync("git ls-files -z", { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function main() {
  const findings = [];
  const files = listTrackedFiles();

  // Gate 1: no environment files may ever be tracked (except examples).
  for (const f of files) {
    if (SKIP_PREFIXES.some((p) => f === p || f.startsWith(p))) continue;
    const base = path.basename(f);
    if (/^\.env(\..+)?$/.test(base) && base !== ".env.example") {
      findings.push({ rule: "Environment file tracked in git", location: `${f}:0`, redacted: "" });
    }
  }

  // Gate 2: content scan of tracked text files.
  for (const f of files) {
    if (SKIP_DIRS.test(f)) continue;
    if (SKIP_PREFIXES.some((p) => f === p || f.startsWith(p))) continue;
    if (SKIP_EXTENSIONS.has(path.extname(f).toLowerCase())) continue;

    let content;
    try {
      content = readFileSync(path.join(REPO_ROOT, f), "utf8");
    } catch {
      continue; // unreadable (permissions/encoding) — not a finding
    }
    if (content.includes("\u0000")) continue; // binary

    const lines = content.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (isPlaceholderLine(line)) return;
      for (const [rule, rx] of RULES) {
        if (rx.test(line)) {
          // Report ONLY the pattern match presence, never the value itself.
          findings.push({ rule, location: `${f}:${idx + 1}`, redacted: "" });
        }
      }
    });
  }

  if (findings.length > 0) {
    console.error("❌ SECRET SCAN FAILED — potential credentials found:\n");
    for (const fnd of findings) {
      console.error(`  [${fnd.rule}] ${fnd.location}`);
    }
    console.error(
      `\n${findings.length} finding(s). Remove the secret, rotate it if it was ` +
      "ever pushed, and keep credentials in .env (gitignored) or your deployment " +
      "secret store. Matched VALUES are intentionally not displayed."
    );
    process.exit(1);
  }

  console.log(`✅ Secret scan clean — ${files.length} tracked files scanned, 0 findings.`);
}

main();
