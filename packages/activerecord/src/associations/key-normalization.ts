const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Normalize an association key so a `BigInt` and a `number` of equal value
 * collide as Map keys / strict-equality operands.
 *
 * node-postgres parses an int8 (a bigserial default PK) to a JS `BigInt` and
 * an int4 `integer`/`references` FK to a `number`, so an owner PK `1n` and a
 * child FK `1` are distinct JS values even though Ruby's width-agnostic
 * `Integer ==` compares them equal. Folding a `BigInt` to a `number` when it
 * fits in the safe-integer range (else its decimal string) makes the two sides
 * match the way they do in Rails. Non-numeric keys (string / UUID FKs) pass
 * through untouched.
 *
 * @internal
 */
export function normalizeAssociationKey(key: unknown): unknown {
  if (typeof key === "bigint") {
    return key >= MIN_SAFE_BIGINT && key <= MAX_SAFE_BIGINT ? Number(key) : key.toString();
  }
  return key;
}

/**
 * Value-equality for association keys across the number/BigInt split (Ruby
 * `Integer ==`). Used where a PK is compared to a FK with `===` in in-memory
 * matching paths (through-join filtering, inverse wiring).
 *
 * @internal
 */
export function associationKeysEqual(a: unknown, b: unknown): boolean {
  return normalizeAssociationKey(a) === normalizeAssociationKey(b);
}
