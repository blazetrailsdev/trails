import {
  insertFixturesSet,
  type DatabaseStatementsHost,
} from "../connection-adapters/abstract/database-statements.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";

const FIXTURE_MAX_ID = 2 ** 30 - 1;

// CRC32 lookup table (polynomial 0xedb88320). For ASCII labels this produces values
// identical to Ruby's Zlib.crc32(label) % MAX_ID, matching Rails' FixtureSet.identify.
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(str: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    crc = CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0) % FIXTURE_MAX_ID;
}

/** Returns the deterministic integer ID for a fixture label. Mirrors Rails' FixtureSet.identify. */
export function fixtureId(label: string): number {
  return crc32(label);
}

const REF_TAG = Symbol("fixture-ref");

export interface FixtureRef {
  readonly [REF_TAG]: true;
  readonly tableName: string;
  readonly fixtureName: string;
}

/** Cross-batch cross-reference sentinel. Resolves to the fixture's deterministic ID at insert time. */
export function ref(tableName: string, fixtureName: string): FixtureRef {
  return { [REF_TAG]: true, tableName, fixtureName };
}

/** @internal */
export function isFixtureRef(v: unknown): v is FixtureRef {
  return typeof v === "object" && v !== null && REF_TAG in v;
}

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;
type InsertHost = DatabaseStatementsHost &
  Pick<Quoting, "quote" | "quoteTableName" | "quoteColumnName">;

/**
 * Inserts fixture rows for a model and returns persisted instances keyed by label.
 *
 * IDs are deterministic: same label → same ID across test runs, enabling cross-batch
 * FK references via `ref(tableName, label)` without insertion-order coupling.
 */
export async function defineFixtures<T extends BaseClass, K extends string>(
  adapter: DatabaseAdapter,
  ModelClass: T,
  fixtures: Record<K, FixtureAttrs>,
): Promise<{ [P in K]: InstanceType<T> }> {
  const tableName = ModelClass.tableName;
  const pk = ModelClass.primaryKey;
  const pkCol = Array.isArray(pk) ? pk[0]! : pk;

  const labels = Object.keys(fixtures) as K[];

  // Build rows with deterministic IDs and resolved references
  const rows: FixtureAttrs[] = [];
  for (const label of labels) {
    const attrs = fixtures[label];
    const id = fixtureId(label);
    const row: FixtureAttrs = { [pkCol]: id };

    for (const [col, val] of Object.entries(attrs)) {
      if (isFixtureRef(val)) {
        const refId = fixtureId(val.fixtureName);
        row[col] = refId;
      } else if (val !== null && typeof val === "object" && pkCol in val) {
        // Heuristic: plain object or model instance carrying the PK — extract it.
        // Limitation: a JSON column value shaped like { id: ... } will also match.
        // Avoid ambiguity by using ref() for cross-batch FKs and direct instances only
        // for same-batch model objects returned by a prior defineFixtures call.
        row[col] = (val as FixtureAttrs)[pkCol];
      } else {
        row[col] = val;
      }
    }
    rows.push(row);
  }

  // Insert via existing adapter infrastructure (wrapped in transaction, honours disableReferentialIntegrity)
  await insertFixturesSet.call(adapter as unknown as InsertHost, {
    [tableName]: rows,
  });

  // Reload persisted instances so AR attribute casting is applied
  const result = {} as { [P in K]: InstanceType<T> };
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const id = (rows[i] as FixtureAttrs)[pkCol];
    const record = await (ModelClass as any).findBy({ [pkCol]: id });
    if (!record) {
      throw new Error(
        `defineFixtures: inserted fixture "${label}" not found after insert (table: ${tableName}, ${pkCol}: ${id})`,
      );
    }
    result[label] = record as InstanceType<T>;
  }
  return result;
}
