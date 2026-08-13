const globalJSON = globalThis.JSON;

/**
 * Ruby's stdlib `JSON` module, the two entry points Rails hands to a
 * `serializer:` kwarg — `ActiveRecord::SignedId#signed_id_verifier` passes the
 * constant bare (`signed_id.rb:79`), and the module has to be nameable as
 * `JSON` at that call site for the port to read like the Ruby.
 *
 * This is stdlib, not Rails — `ActiveSupport::JSON` (`json.ts` in this package)
 * is a different module with `encode`/`decode`, and its `dump` carries
 * ActiveSupport's HTML-escaping encoder rather than the json gem's plain
 * `generate`.
 */
export namespace JSON {
  /** `JSON.dump(obj)` — the json gem's `generate`, with no ActiveSupport escaping. */
  export function dump(value: unknown): string {
    return globalJSON.stringify(value);
  }

  /** `JSON.load(source)` — the json gem's parser. */
  export function load(dumped: string): unknown {
    return globalJSON.parse(dumped);
  }
}
