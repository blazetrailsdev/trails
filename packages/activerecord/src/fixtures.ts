/**
 * ActiveRecord fixture loading and management.
 *
 * Mirrors: ActiveRecord::FixtureSet
 *
 * Fixtures provide a way to define test data in a declarative format
 * (typically YAML/JSON) and load it into the database for tests.
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
    result[keyColumns[i]] = (((baseId << i) % MAX_ID) + MAX_ID) % MAX_ID;
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

/**
 * A set of fixtures loaded from data (typically parsed from YAML).
 *
 * Mirrors: ActiveRecord::FixtureSet
 */
export class FixtureSet {
  readonly tableName: string;
  private _fixtures: Map<string, Record<string, unknown>>;

  constructor(tableName: string, data: Record<string, Record<string, unknown>>) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`Invalid fixture data for "${tableName}": expected an object`);
    }
    this.tableName = tableName;
    this._fixtures = new Map();
    for (const [label, attrs] of Object.entries(data)) {
      if (label === "DEFAULTS") continue;
      const defaults = data["DEFAULTS"] ?? {};
      this._fixtures.set(label, { ...defaults, ...attrs });
    }
  }

  get size(): number {
    return this._fixtures.size;
  }

  get(label: string): Record<string, unknown> | undefined {
    return this._fixtures.get(label);
  }

  forEach(callback: (label: string, fixture: Record<string, unknown>) => void): void {
    for (const [label, fixture] of this._fixtures) {
      callback(label, fixture);
    }
  }

  [Symbol.iterator](): IterableIterator<[string, Record<string, unknown>]> {
    return this._fixtures.entries();
  }

  labels(): string[] {
    return Array.from(this._fixtures.keys());
  }

  /**
   * Generate fixture rows with deterministic IDs.
   * If a fixture doesn't have a primary key value, one is generated
   * from the label using identify().
   */
  toRows(primaryKey = "id"): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const [label, attrs] of this._fixtures) {
      const row = { ...attrs };
      if (row[primaryKey] === undefined) {
        row[primaryKey] = identify(label);
      }
      rows.push(row);
    }
    return rows;
  }
}
