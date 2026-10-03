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
 * A receipt carries no prose, like `@missingRailsName`.
 *
 * Hard rules: no node:* imports, no process.* references, async fs.
 */

import type { JsdocOrigin } from "./missing-rails-call-tags.js";
import { suppressedNamesIn } from "./missing-rails-name-tags.js";

export const TAG = "@inventedArm";

/** The tokens one JSDoc comment receipts, sorted and deduplicated. */
export function inventedArmsIn(comment: string, origin?: JsdocOrigin): string[] {
  return suppressedNamesIn(comment, origin, TAG);
}
