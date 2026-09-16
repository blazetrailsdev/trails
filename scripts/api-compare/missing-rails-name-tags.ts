/**
 * The `@missingRailsName <ruby_identifier> — PERMANENT|CONVERGEABLE <story-id>`
 * JSDoc tag: the call-site receipt for one `naming` row of the call-argument
 * artifact (RFC 0153 §1).
 *
 * `@missingRailsArgs` keys the Ruby CALL, but a `naming` row's unit is one
 * identifier inside that call's argument list: one call can carry a permanent
 * `js-reserved-word` identifier beside a convergeable `burndown` one. So this
 * tag keys the Ruby-side identifier of the differing `ref:` pair, and a receipt
 * for one identifier never speaks for another on the same call.
 *
 * A receipt carries no prose — the per-class reason lives once, in
 * `NAMING_CLASSES`. It is `PERMANENT` alone or `CONVERGEABLE <story-id>`; a
 * reason claiming neither, and a bare `CONVERGEABLE`, are errors. Whether the
 * row it names may be receipted at all is the gate's call (lint-call-args.ts),
 * since only `classifyRow` knows.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import { type JsdocOrigin, classifyReason, parseJsdoc } from "./missing-rails-call-tags.js";

export const TAG = "@missingRailsName";

/** The Ruby identifiers one JSDoc comment receipts, sorted and deduplicated. */
export function suppressedNamesIn(comment: string, origin?: JsdocOrigin): string[] {
  const { entries } = parseJsdoc(comment, origin, TAG);
  const where = origin ? ` in ${origin.fileName}` : "";
  for (const entry of entries) {
    const permanence = classifyReason(entry.reason);
    if (permanence === "unclassified") {
      throw new Error(
        `${TAG} needs a permanence claim${where} — the receipt for \`${entry.call}\` is ` +
          "`PERMANENT` or `CONVERGEABLE <story-id>`.",
      );
    }
    if (permanence === "convergeable" && !/^\s*CONVERGEABLE\W+\S/.test(entry.reason)) {
      throw new Error(
        `${TAG} needs a story id${where} — \`CONVERGEABLE\` alone is half a receipt; name ` +
          `the story that converges \`${entry.call}\`.`,
      );
    }
  }
  return [...new Set(entries.map((e) => e.call))].sort();
}
