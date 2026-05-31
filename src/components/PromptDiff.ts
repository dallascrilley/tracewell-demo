import { diff_match_patch } from 'diff-match-patch';

const dmp = new diff_match_patch();

export interface DiffResult {
  html: string;
  insertedTokens: number;
  deletedTokens: number;
}

// Rough token estimate: words / 0.75
function estimateTokens(text: string): number {
  return Math.round(text.split(/\s+/).filter(Boolean).length / 0.75);
}

export function renderDiff(textA: string, textB: string): DiffResult {
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);

  let insertedChars = 0;
  let deletedChars = 0;
  const lines: string[] = [];

  // Break diffs into display lines
  for (const [op, text] of diffs) {
    const textLines = text.split('\n');
    for (let i = 0; i < textLines.length; i++) {
      const chunk = textLines[i];
      if (op === 0) {
        // Equal — show trimmed context lines
        if (chunk.trim()) {
          lines.push(`<div class="tw-diff-line tw-diff-equal"><span class="tw-diff-sign"> </span><span>${escHtml(chunk)}</span></div>`);
        }
      } else if (op === 1) {
        insertedChars += chunk.length;
        if (chunk.trim()) {
          lines.push(`<div class="tw-diff-line tw-diff-insert"><span class="tw-diff-sign">+</span><span>${escHtml(chunk)}</span></div>`);
        }
      } else if (op === -1) {
        deletedChars += chunk.length;
        if (chunk.trim()) {
          lines.push(`<div class="tw-diff-line tw-diff-delete"><span class="tw-diff-sign">−</span><span>${escHtml(chunk)}</span></div>`);
        }
      }
    }
  }

  return {
    html: lines.join(''),
    insertedTokens: estimateTokens(textB.slice(0, insertedChars + 200).substring(0, insertedChars)),
    deletedTokens: estimateTokens(textA.slice(0, deletedChars + 200).substring(0, deletedChars)),
  };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The canonical v3→v4 diff for the signature moment
// Returns pre-built diff HTML so the tab renders immediately
export function buildCanonicalDiff(): { html: string; annotation: string } {
  const v3Block = `[COMPLIANCE POLICY — v3 — 410 tokens]
# Compliance Policy v3
## Data Handling
All contracts must include GDPR-compliant data handling clauses (Art. 13-14).
Verify DPA is attached or referenced in Exhibit A.
Maximum liability cap: 2× annual contract value.
Auto-renewal notice window: minimum 60 days.`;

  const v4Block = `[COMPLIANCE POLICY — v4 — 4,400 tokens]
# Compliance Policy v4 — COMPREHENSIVE EDITION
## Data Handling (GDPR, CCPA, HIPAA Cross-Reference)
All contracts must include GDPR-compliant data handling clauses (Art. 13-14).
Verify DPA is attached or referenced in Exhibit A.
Maximum liability cap: 2× annual contract value.
Auto-renewal notice window: minimum 60 days.

### CCPA Addendum (Added 2026-05-27)
California Consumer Privacy Act compliance required for all customers with California operations.
Must include: right to deletion clauses, data portability provisions, opt-out mechanisms.
Reference: CCPA § 1798.100-1798.199 (full statutory text appended below)
[... 1,800 tokens of statutory CCPA text ...]

### HIPAA Safe Harbor Provisions (Added 2026-05-27)
For healthcare-adjacent customers, BAA must be executed prior to data processing.
PHI handling: minimum necessary standard, access logging, breach notification <60 days.
[... 900 tokens of HIPAA provisions ...]

### SOC 2 Type II Attestation Requirements
Annual audit required. Report must be less than 12 months old at time of contract execution.
[... 600 tokens of SOC 2 requirements ...]

### PCI-DSS Scope Determination
If payment card data transits through Customer systems...
[... 500 tokens of PCI requirements ...]`;

  const result = renderDiff(v3Block, v4Block);

  const annotation = `+4,390 tokens added at step inject_context. Source: compliance_policy_v3 → v4 on 2026-05-27. This is the regression.`;

  return { html: result.html, annotation };
}
