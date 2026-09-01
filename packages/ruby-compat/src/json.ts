/* eslint-disable @typescript-eslint/no-namespace -- Ruby's `JSON` module is a
   namespace of module functions; ESM syntax cannot spell `JSON.dump`. */
const globalJSON = globalThis.JSON;

/**
 * Ruby's stdlib `JSON` module (`vendor/ruby/ext/json/lib/json/common.rb`), the
 * two entry points Rails hands to a `serializer:` kwarg —
 * `ActiveRecord::SignedId#signed_id_verifier` passes the constant bare
 * (`signed_id.rb:79`), and the module has to be nameable as `JSON` at that call
 * site for the port to read like the Ruby.
 *
 * This is stdlib, not Rails — `ActiveSupport::JSON` (`json.ts` in
 * `@blazetrails/activesupport`) is a different module with `encode`/`decode`,
 * and its `dump` carries ActiveSupport's HTML-escaping encoder rather than the
 * json gem's plain `generate`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `JSON.dump`
 * (`vendor/ruby/ext/json/lib/json/common.rb:541`) and `JSON.load` (`:615`) ship
 * with the interpreter, so no Rails file defines them.
 */
export namespace JSON {
  /**
   * `JSON.dump(obj)` (`vendor/ruby/ext/json/lib/json/common.rb:541`) — the json
   * gem's `generate`, with no ActiveSupport escaping. `JSON.dump(nil)` is
   * `"null"` in MRI, where `globalThis.JSON` returns `undefined` for the values
   * Ruby has no counterpart for (`undefined` itself, functions, symbols), so
   * those fall back to the `nil` dump.
   */
  export function dump(value: unknown): string {
    return globalJSON.stringify(value) ?? "null";
  }

  /**
   * `JSON.load(source)` (`vendor/ruby/ext/json/lib/json/common.rb:615`) — the
   * json gem's parser.
   */
  export function load(dumped: string): unknown {
    return globalJSON.parse(dumped);
  }
}
