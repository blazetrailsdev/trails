/**
 * Ruby's `Object#hash` — the value every `eql?`-pairing `hash` body composes
 * with. Ported node bodies spell `[self.class, @left, @right].hash`, and JS has
 * no `hash` on Object, Array, String or Class at all, so one copy serves every
 * ported `hash`.
 *
 * Like Ruby, it is consistent with `rbEqual`: two objects that are `==` hash
 * alike, and an object whose class defines no `hash` falls back to identity.
 *
 * @noRailsEquivalent PERMANENT — `Object#hash` / `Array#hash` are C primitives
 *   (object.c, array.c), not Ruby methods, so they have no counterpart file.
 */
export function rbHash(value: unknown): number {
  if (value === null || value === undefined) return 0x9e3779b9;
  switch (typeof value) {
    case "string":
      return stringHash(value);
    case "number":
    case "bigint":
      return stringHash(String(value));
    case "boolean":
      return value ? 0x5bf03635 : 0x27d4eb2f;
    case "symbol":
      return stringHash(String(value));
    case "function":
      // A class object — Ruby's `self.class.hash`.
      return stringHash(`class:${value.name}`);
  }
  if (Array.isArray(value)) {
    let h = 0x811c9dc5;
    for (const element of value) {
      h ^= rbHash(element);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  const object = value as { hash?: unknown };
  if (typeof object.hash === "function") {
    return (object as { hash(): number }).hash();
  }
  // A value object whose Ruby `==` is `equals` (Temporal, Duration) has to hash
  // by that same value, or two `==` objects land in different buckets.
  if (typeof (value as { equals?: unknown }).equals === "function") {
    return stringHash(`${(value as object).constructor.name}(${String(value)})`);
  }
  // boundary: a JS Date reaches a ported `hash` the same way it reaches
  // `rbEqual`, and Ruby hashes it by value.
  if (value instanceof Date) return stringHash(`Date(${value.toISOString()})`);
  // A plain object stands in for a Ruby Hash, whose `hash` folds every key and
  // value; the sort keeps it insertion-order independent, as Ruby's is.
  if ((value as object).constructor === Object) {
    const plain = value as Record<string, unknown>;
    let h = 0x811c9dc5;
    for (const key of Object.keys(plain).sort()) {
      h ^= stringHash(key) ^ rbHash(plain[key]);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  return identityHash(value as object);
}

function stringHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const identityHashes = new WeakMap<object, number>();
let nextIdentityHash = 1;

function identityHash(object: object): number {
  let h = identityHashes.get(object);
  if (h === undefined) {
    h = Math.imul(nextIdentityHash++, 0x01000193) >>> 0;
    identityHashes.set(object, h);
  }
  return h;
}
