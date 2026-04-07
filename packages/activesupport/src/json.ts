/**
 * ActiveSupport::JSON — thin wrapper around native JSON providing
 * encode/decode that mirrors the Rails API.
 *
 * Rails' ActiveSupport::JSON.encode uses ActiveSupport::JSON::Encoding
 * under the hood; in TypeScript we delegate to the built-in JSON global
 * since the behavior is equivalent for all standard types.
 */

export namespace ActiveSupportJSON {
  export function encode(value: unknown): string {
    return JSON.stringify(value) ?? "null";
  }

  export function decode(value: string): unknown {
    return JSON.parse(value);
  }
}
