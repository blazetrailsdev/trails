/**
 * Fixture identification — deterministic ID generation from labels.
 *
 * Shared by FixtureSet (file.ts) and TableRow (table-row.ts) to
 * avoid circular dependencies.
 */

const MAX_ID = 2 ** 30 - 1;

/**
 * Generate a deterministic integer ID from a fixture label.
 * Uses the same algorithm as Rails: Zlib.crc32(label.to_s) % MAX_ID
 *
 * Mirrors: ActiveRecord::FixtureSet.identify
 */
export function identify(label: string): number {
  const crc = crc32(Buffer.from(label));
  return ((crc % MAX_ID) + MAX_ID) % MAX_ID;
}

/**
 * Generate a composite identity from a label for composite primary keys.
 * Returns an object mapping each key column name to a deterministic ID.
 *
 * Mirrors: ActiveRecord::FixtureSet.composite_identify
 */
export function compositeIdentify(label: string, keyColumns: string[]): Record<string, number> {
  const baseId = identify(label);
  const result: Record<string, number> = {};
  for (let i = 0; i < keyColumns.length; i++) {
    result[keyColumns[i]] = Number((BigInt(baseId) * (1n << BigInt(i))) % BigInt(MAX_ID));
  }
  return result;
}

/**
 * CRC-32 implementation matching Ruby's Zlib.crc32.
 */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();
