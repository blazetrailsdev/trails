const PREFIX = "~#";
const UNDEF = "~#u";
const BIGINT = "~#b";
const DATE = "~#d";
const INSTANT = "~#i";
const NUMBER = "~#n";
const ARRAY_ESCAPE = "~#a";
const BYTES = "~#B";

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
  if (value instanceof Date) return [DATE, value.getTime()];

  // boundary: Ruby Marshal round-trips a Time, and `Temporal.Instant` is the
  if (value instanceof Temporal.Instant) return [INSTANT, value.toString()];

  if (value instanceof Uint8Array) return [BYTES, Array.from(value)];

  if (Array.isArray(value)) {
    const encoded = value.map(encode);
    return looksTagged(encoded[0]) ? [ARRAY_ESCAPE, ...encoded] : encoded;
  }

  const encoded: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
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
        case INSTANT:
          return Temporal.Instant.from(node[1] as string);
        case NUMBER: {
          const v = node[1] as string;
          return v === "NaN" ? NaN : v === "Infinity" ? Infinity : -Infinity;
        }
        case ARRAY_ESCAPE:
          return node.slice(1).map(decode);
        case BYTES:
          return Uint8Array.from(node[1] as number[]);
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

const CONTROL_CHAR_ESCAPE = /\\u00[01][0-9a-f]/g;

function unescapeControlChars(json: string): string {
  return json.replace(CONTROL_CHAR_ESCAPE, (escape) =>
    String.fromCharCode(parseInt(escape.slice(2), 16)),
  );
}

function escapeControlChars(dumped: string): string {
  let escaped = "";
  for (const char of dumped) {
    const code = char.charCodeAt(0);
    escaped += code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
  }
  return escaped;
}

/** @internal */
export const coder = {
  dump(value: unknown): string {
    return unescapeControlChars(JSON.stringify(encode(value)));
  },
  load(dumped: string | Uint8Array): unknown {
    const text = typeof dumped === "string" ? dumped : new TextDecoder().decode(dumped);
    return decode(JSON.parse(escapeControlChars(text)));
  },
};
