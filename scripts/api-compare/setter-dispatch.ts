/**
 * Report-only (RFC 0156): a Rails body that dispatches through a dynamically
 * named SETTER where the port writes the attribute directly.
 *
 * Rails' `update_attribute` is `public_send("#{name}=", value)`
 * (`activerecord/lib/active_record/persistence.rb:533`), so an overridden
 * writer or a non-column `attr_accessor` runs. A port that calls
 * `writeAttribute(name, value)` bypasses both. The call gate cannot see it:
 * `send` / `public_send` are not scored call names (see the note under
 * `NO_JS_CALL_FORM` in compare.ts), because their faithful port,
 * `this[name] = value`, has no callee at all.
 *
 * So the check is keyed on the two skeleton marks instead: the Ruby extractor's
 * `send:setter` (`extract-ruby-api.rb#setter_send?`) and the TS extractor's
 * `assign:computed` (`extract-ts-api.ts#extractSkeleton`).
 * Constraints: no `node:` specifiers, no `process` references.
 */
import type { CallSkeleton } from "./compare.js";

export const RUBY_SETTER_SEND_TOKEN = "send:setter";
export const TS_COMPUTED_ASSIGN_TOKEN = "assign:computed";

/** The direct writes that bypass the setter a `public_send("#{name}=")` reaches. */
export const DIRECT_ATTRIBUTE_WRITES: ReadonlySet<string> = new Set([
  "ref:writeAttribute",
  "ref:_writeAttribute",
]);

/** The stream plus every same-file helper it reaches, one hop, as the arms report splices. */
function withHelpers(
  own: readonly string[],
  helpers: Readonly<Record<string, readonly string[]>> | undefined,
): string[] {
  return [...own, ...Object.values(helpers ?? {}).flat()];
}

/**
 * Whether this pair's Ruby body dispatches to a dynamic setter and its TS body
 * never assigns a computed member but does write the attribute directly.
 *
 * The Ruby mark is read from the body's OWN stream: `toggle!` reaches
 * `update_attribute` (`persistence.rb:690-692`) and its port reaches
 * `updateAttribute` the same way, so a helper's dispatch is that helper's row.
 */
export function isSetterDispatchPortedAsDirectWrite(skeleton: CallSkeleton): boolean {
  if (!skeleton.ruby.includes(RUBY_SETTER_SEND_TOKEN)) return false;
  const ts = withHelpers(skeleton.ts, skeleton.tsHelpers);
  if (ts.includes(TS_COMPUTED_ASSIGN_TOKEN)) return false;
  return ts.some((token) => DIRECT_ATTRIBUTE_WRITES.has(token));
}
