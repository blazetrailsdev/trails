// Zero-import slot for `ActiveSupport::Cache.format_version` (cache.rb:55-58).
//
// Ruby resolves `Cache.format_version` when `Store#default_serializer` /
// `#validate_options` run (cache.rb:765, 921), so cache.rb can hold the state
// and store.rb can read it without a load-order dependency. In ESM the import
// is eager: `store.ts` importing `cache.ts` closes a cycle whose participants
// include `class MemoryStore extends Store`, so entering the graph at
// `store.ts` evaluates MemoryStore with Store still in TDZ. This module has no
// runtime imports, so it cannot join that cycle; `cache.ts` exports the
// Rails-named `formatVersion` / `setFormatVersion` over it.

/** Mirrors Rails `@format_version = 7.0` (cache.rb:55). @internal */
let _formatVersion = 7.0;

/** @internal */
export function getFormatVersion(): number {
  return _formatVersion;
}

/** @internal */
export function setFormatVersion(value: number): void {
  _formatVersion = value;
}
