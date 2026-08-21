/**
 * The `@missingRailsArgs <ruby_call> — <reason>` JSDoc tag: the call-ARGUMENT
 * half of the call-site receipt family (RFC 0099).
 *
 * The call-SET gate has honoured a call-site receipt since RFC 0083 — a
 * `@missingRailsCall` tag suppresses the flag for one call, so a single
 * justified omission needs no baseline row and its reason is reviewed in the
 * diff where the code is. The call-ARGUMENT gate had no equivalent, so every
 * argument-shape deviation could only be recorded as a row in
 * call-mismatches-exclude/**, however permanent it was. That matters for the
 * debt metric: row COUNT is the measure for that baseline and rows converge by
 * deletion, so a genuinely permanent deviation (a JS `Map` has no
 * `initial_capacity`; `queueMicrotask` has no thread pool to size) sat in the
 * count forever, indistinguishable from unfinished work.
 *
 * The tag names the RUBY call whose argument list is not mirrored — the same
 * key `@missingRailsCall` uses — and is read by the TS extractor, which records
 * it so compare.ts's `checkCallArgs` can drop the mismatch before it reaches
 * output/call-arg-mismatches.json.
 *
 * It is deliberately NOT cheaper than converging:
 *   - the shared parser rejects a bare tag and an empty reason
 *     (missing-rails-call-tags.ts, the family's empty-reason contract), and
 *   - the reason must open with a permanence token, PERMANENT or CONVERGEABLE,
 *     the discipline `parity:api:extra` already enforces on
 *     `@noRailsEquivalent`. A reason that claims neither is an error, not an
 *     assumed PERMANENT.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import {
  type JsdocOrigin,
  classifyReason,
  justifies,
  parseJsdoc,
} from "./missing-rails-call-tags.js";

export const TAG = "@missingRailsArgs";

/**
 * The Ruby call names one JSDoc comment JUSTIFIES as deliberately called with a
 * different argument list, sorted and deduplicated. Throws on a bare tag, an
 * empty reason, or a reason making no permanence claim.
 */
export function suppressedArgCallsIn(comment: string, origin?: JsdocOrigin): string[] {
  const { entries } = parseJsdoc(comment, origin, TAG);
  for (const entry of entries) {
    if (classifyReason(entry.reason) !== "unclassified") continue;
    throw new Error(
      `${TAG} needs a permanence claim${origin ? ` in ${origin.fileName}` : ""} — open the ` +
        `reason for \`${entry.call}\` with PERMANENT (a language- or runtime-level fact no ` +
        `port can remove) or CONVERGEABLE (work not done yet; name its story).`,
    );
  }
  return [...new Set(entries.filter((e) => justifies(e.reason)).map((e) => e.call))].sort();
}
