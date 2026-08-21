/**
 * Rails builds `load_schema!` as a super chain: `ModelSchema#load_schema!`
 * (`activerecord/lib/active_record/model_schema.rb:587-597`) is the anchor and
 * each concern that needs schema-time bookkeeping overrides it and calls
 * `super` — `CounterCache` (`counter_cache.rb:186-195`),
 * `Encryption::EncryptableRecord` (`encryptable_record.rb:126-130`). A TS class
 * cannot splice a module into its ancestor chain, so the overrides register
 * here and `model-schema.ts` wraps them innermost-first.
 *
 * This is a zero-import slot module (CLAUDE.md, "Call-time constant
 * resolution"): `model-schema.ts` is already in an import cycle with the
 * concerns that register, so holding the registry in `model-schema.ts` itself
 * evaluates `registerLoadSchemaOverride` while its `const` is still in TDZ.
 *
 * @noRailsEquivalent Ruby `super` over an included module; see CLAUDE.md
 * "Module mixins".
 */

/**
 * One concern's `load_schema!` override. `superFn` is Ruby `super` — the next
 * link down the chain, ending at ModelSchema's own body.
 */
export type LoadSchemaOverride = (this: unknown, superFn: () => void) => void;

/**
 * Sorted ascending by `includeOrder`, i.e. by Rails' ancestor position.
 *
 * @noRailsEquivalent Ruby `super` over an included module; see CLAUDE.md
 * "Module mixins".
 */
export const loadSchemaOverrides: Array<{
  includeOrder: number;
  override: LoadSchemaOverride;
}> = [];

/**
 * Register a concern's `load_schema!` override. `includeOrder` is the concern's
 * `include` line in `activerecord/lib/active_record/base.rb`, which is what
 * fixes its position in Ruby's ancestor chain.
 *
 * @noRailsEquivalent Ruby `super` over an included module; see CLAUDE.md
 * "Module mixins".
 */
export function registerLoadSchemaOverride(
  includeOrder: number,
  override: LoadSchemaOverride,
): void {
  if (loadSchemaOverrides.some((entry) => entry.override === override)) return;
  loadSchemaOverrides.push({ includeOrder, override });
  loadSchemaOverrides.sort((a, b) => a.includeOrder - b.includeOrder);
}
