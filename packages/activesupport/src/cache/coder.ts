// Cache serialization strategy (story: cache-serialization-marshal-vs-json).
//
// Rails serializes cache values with `Marshal.dump`/`Marshal.load`
// (cache/entry.rb:90,124, cache/coder.rb). Ruby Marshal is a wire format for
// Ruby objects; there is no Ruby runtime in trails and no Marshal-encoded store
// for us to interoperate with, so byte-for-byte Marshal compatibility is both
// infeasible and serves no consumer.
//
// We therefore converge on the dimension of Marshal that actually matters for a
// cache: round-trip *type fidelity*. Plain `JSON.stringify`/`JSON.parse` — what
// PR #3621 used as a placeholder — silently drops or mangles the values Marshal
// preserves: `undefined` (elided in objects, `null`-ified in arrays), `Date`
// (flattened to an ISO string), `bigint` (throws), and non-finite numbers
// (`NaN`/`±Infinity` → `null`). This codec is the trails Marshal-equivalent: a
// type-tagging JSON serializer that survives those cases.
//
// It is deliberately NOT Ruby-wire-compatible. Remaining cache-serialization
// convergence — the MessagePack serializer, `SerializerWithFallback`, and
// wiring the concrete stores (MemoryStore/FileStore/entry-record) through this
// Coder rather than their own ad-hoc JSON — is tracked as pending convergence
// by `activesupport-messagepack-port` and `cache-entry-remaining-methods`.

// Special values are encoded as a compact 1- or 2-element array whose head is a
// short sentinel code: `["~#d", 1750000000000]` for a Date, `["~#u"]` for
// undefined, etc. This keeps per-tag overhead to a handful of bytes (vs. the
// ~30 a `{ "__type__": …, "value": … }` object would repeat for every Date in
// a record). Because tags are arrays, plain objects never collide and pass
// through untouched; only a real array whose head is itself a sentinel string
// needs escaping (see ARRAY_ESCAPE below).
const PREFIX = "~#";
const UNDEF = "~#u";
const BIGINT = "~#b";
const DATE = "~#d";
const NUMBER = "~#n";
const ARRAY_ESCAPE = "~#a";

function looksTagged(head: unknown): head is string {
  return typeof head === "string" && head.startsWith(PREFIX);
}

function encode(value: unknown): unknown {
  if (value === undefined) return [UNDEF];
  if (value === null) return null;

  const type = typeof value;
  if (type === "bigint") return [BIGINT, (value as bigint).toString()];
  if (type === "number") {
    const n = value as number;
    if (Number.isNaN(n)) return [NUMBER, "NaN"];
    if (n === Infinity) return [NUMBER, "Infinity"];
    if (n === -Infinity) return [NUMBER, "-Infinity"];
    return n;
  }
  if (type !== "object") return value;

  // boundary: cache values are arbitrary JS objects; a real JS Date must be
  // preserved with full fidelity, so we tag it explicitly here.
  if (value instanceof Date) return [DATE, value.getTime()];

  if (Array.isArray(value)) {
    const encoded = value.map(encode);
    // A genuine array whose head encodes to a sentinel string would be misread
    // as a tag on the way back, so prefix it with the escape marker.
    return looksTagged(encoded[0]) ? [ARRAY_ESCAPE, ...encoded] : encoded;
  }

  const encoded: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    encoded[key] = encode((value as Record<string, unknown>)[key]);
  }
  return encoded;
}

function decode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;

  if (Array.isArray(node)) {
    const head = node[0];
    if (looksTagged(head)) {
      switch (head) {
        case UNDEF:
          return undefined;
        case BIGINT:
          return BigInt(node[1] as string);
        case DATE:
          // boundary: restoring the JS Date tagged on the way out.
          return new Date(node[1] as number);
        case NUMBER: {
          const v = node[1] as string;
          return v === "NaN" ? NaN : v === "Infinity" ? Infinity : -Infinity;
        }
        case ARRAY_ESCAPE:
          return node.slice(1).map(decode);
      }
    }
    return node.map(decode);
  }

  const decoded: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    decoded[key] = decode((node as Record<string, unknown>)[key]);
  }
  return decoded;
}

/**
 * The trails Marshal-equivalent cache serializer. Mirrors the `dump`/`load`
 * surface of Rails' `Cache::Coder` while preserving JS type fidelity (Date,
 * undefined, bigint, NaN/±Infinity) that plain JSON would lose.
 *
 * @internal
 */
export const coder = {
  dump(value: unknown): string {
    return JSON.stringify(encode(value));
  },
  load(dumped: string): unknown {
    return decode(JSON.parse(dumped));
  },
};
