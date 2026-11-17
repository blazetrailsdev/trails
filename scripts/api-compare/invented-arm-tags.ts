/**
 * The `@inventedArm <token> — PERMANENT|CONVERGEABLE <story-id>` JSDoc tag: the
 * receipt for a branch or a call a ported body carries that the Rails body
 * does not.
 *
 * `@noRailsEquivalent` receipts an extra MEMBER and `@missingRailsCall` a call
 * Rails makes that the port omits; neither can name an arm added INSIDE Rails'
 * own method. `<token>` is one of the skeleton's control tokens (`if`, `loop`,
 * `try`, `rescue`, `throw`) the arms report files as invented for the pair, or
 * the name of a call only the TS body makes. report-arms.ts drops a receipted
 * control token from the pair's invented arms, and lint-arm-throws.ts reds on a
 * receipt naming a token the body no longer invents.
 *
 * One tag speaks for ONE arm. A body that invents three `if` arms carries three
 * `@inventedArm if` tags, so converging one arm reds the receipt left over and a
 * fourth invented `if` is not discharged without a fourth tag.
 *
 * A receipt carries no prose, like `@missingRailsName`.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import type { JsdocOrigin } from "./missing-rails-call-tags.js";
import { suppressedNamesIn } from "./missing-rails-name-tags.js";

export const TAG = "@inventedArm";

/** The tokens one JSDoc comment receipts, sorted, one entry per tag. */
export function inventedArmsIn(comment: string, origin?: JsdocOrigin): string[] {
  return suppressedNamesIn(comment, origin, TAG, false);
}

/** How many tags receipt each token of `arms`. */
export function receiptCounts(arms: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of arms) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}
