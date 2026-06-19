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

const TYPE_TAG = "__trailsCacheType__";

interface Tagged {
  [TYPE_TAG]: "undefined" | "bigint" | "date" | "number" | "object";
  value?: unknown;
}

function isPlainTaggable(value: object): boolean {
  return Object.prototype.hasOwnProperty.call(value, TYPE_TAG);
}

function encode(value: unknown): unknown {
  if (value === undefined) return { [TYPE_TAG]: "undefined" } satisfies Tagged;
  if (value === null) return null;

  const type = typeof value;
  if (type === "bigint") {
    return { [TYPE_TAG]: "bigint", value: (value as bigint).toString() } satisfies Tagged;
  }
  if (type === "number") {
    const n = value as number;
    if (Number.isNaN(n)) return { [TYPE_TAG]: "number", value: "NaN" } satisfies Tagged;
    if (n === Infinity) return { [TYPE_TAG]: "number", value: "Infinity" } satisfies Tagged;
    if (n === -Infinity) return { [TYPE_TAG]: "number", value: "-Infinity" } satisfies Tagged;
    return n;
  }
  if (type !== "object") return value;

  // boundary: cache values are arbitrary JS objects; a real JS Date must be
  // preserved with full fidelity, so we tag it explicitly here.
  if (value instanceof Date) {
    return { [TYPE_TAG]: "date", value: value.getTime() } satisfies Tagged;
  }
  if (Array.isArray(value)) return value.map(encode);

  const encoded: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    encoded[key] = encode((value as Record<string, unknown>)[key]);
  }
  // A real value that happens to carry our sentinel key is escaped so it never
  // collides with a genuine tag on the way back through decode().
  if (isPlainTaggable(value as object)) {
    return { [TYPE_TAG]: "object", value: encoded } satisfies Tagged;
  }
  return encoded;
}

function decode(node: unknown): unknown {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(decode);

  if (isPlainTaggable(node)) {
    const tagged = node as Tagged;
    switch (tagged[TYPE_TAG]) {
      case "undefined":
        return undefined;
      case "bigint":
        return BigInt(tagged.value as string);
      case "date":
        // boundary: restoring the JS Date tagged on the way out.
        return new Date(tagged.value as number);
      case "number": {
        const v = tagged.value as string;
        return v === "NaN" ? NaN : v === "Infinity" ? Infinity : -Infinity;
      }
      case "object":
        return decodePlain(tagged.value as Record<string, unknown>);
    }
  }
  return decodePlain(node as Record<string, unknown>);
}

function decodePlain(node: Record<string, unknown>): Record<string, unknown> {
  const decoded: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    decoded[key] = decode(node[key]);
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
