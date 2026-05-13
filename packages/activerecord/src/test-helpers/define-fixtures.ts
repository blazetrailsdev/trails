import {
  insertFixturesSet,
  type DatabaseStatementsHost,
} from "../connection-adapters/abstract/database-statements.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";
import { singularize } from "@blazetrails/activesupport";

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

/**
 * Cross-batch cross-reference sentinel. Resolves to the fixture's deterministic ID at insert time.
 * `tableName` is stored for readability and future validation; resolution uses only `fixtureName`.
 */
export function ref(tableName: string, fixtureName: string): FixtureRef {
  return { [REF_TAG]: true, tableName, fixtureName };
}

/** @internal */
export function isFixtureRef(v: unknown): v is FixtureRef {
  return typeof v === "object" && v !== null && REF_TAG in v;
}

// --- Phase 1b: tableName → ModelClass registry (scoped per adapter) ---

// WeakMap prevents cross-file leakage: each adapter object gets its own registry that
// lives only as long as the adapter, so tests using distinct adapter instances are isolated.
const tableRegistries = new WeakMap<object, Map<string, BaseClass>>();

function getRegistry(adapter: object): Map<string, BaseClass> {
  let reg = tableRegistries.get(adapter);
  if (!reg) {
    reg = new Map();
    tableRegistries.set(adapter, reg);
  }
  return reg;
}

/** @internal */
export function resolveModelForTable(adapter: object, tableName: string): BaseClass | undefined {
  return getRegistry(adapter).get(tableName);
}

// --- Phase 1b: HABTM join-table detection ---

/**
 * Given a join-table name like "developers_projects" and the adapter's registry, returns the
 * two *plural* table-name parts (e.g. `["developers", "projects"]`) if both are registered,
 * otherwise null. Singularization happens at call time when building the FK column names.
 */
function detectHabtmParts(
  registry: Map<string, BaseClass>,
  tableName: string,
): [string, string] | null {
  const parts = tableName.split("_");
  for (let i = 1; i < parts.length; i++) {
    const left = parts.slice(0, i).join("_");
    const right = parts.slice(i).join("_");
    if (registry.has(left) && registry.has(right)) {
      return [left, right];
    }
  }
  return null;
}

// --- Phase 1b: polymorphic belongs_to detection ---

interface PolymorphicBelongsTo {
  typeColumn: string;
  idColumn: string;
}

function findPolymorphicRef(modelClass: BaseClass, colName: string): PolymorphicBelongsTo | null {
  const reflections: Record<string, any> = (modelClass as any)._reflections ?? {};
  const refl = reflections[colName];
  if (!refl || refl.macro !== "belongsTo" || !refl.isPolymorphic?.()) return null;
  // Prefer the reflection's own foreignType/foreignKey to honour custom column overrides.
  const typeColumn: string = refl.foreignType ?? `${colName}_type`;
  const rawFk: string | string[] = refl.foreignKey ?? `${colName}_id`;
  const idColumn = typeof rawFk === "string" ? rawFk : rawFk[0]!;
  return { typeColumn, idColumn };
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
 *
 * Phase 1b ergonomics (convention-over-config, additive):
 * - HABTM join tables: string values for `a_id`/`b_id` columns auto-resolve via fixtureId()
 *   when the table name matches the `a_b` pattern and both `a` and `b` are registered.
 * - Polymorphic refs: `{ taggable: postInstance }` expands to `taggable_type`/`taggable_id`
 *   when a polymorphic `belongsTo :taggable` reflection exists on the model.
 * - Each call registers `ModelClass` by `tableName` in an internal registry, available via
 *   `resolveModelForTable` for use by HABTM detection and future Phase 2 tooling.
 */
export async function defineFixtures<T extends BaseClass, K extends string>(
  adapter: DatabaseAdapter,
  ModelClass: T,
  fixtures: Record<K, FixtureAttrs>,
): Promise<{ [P in K]: InstanceType<T> }> {
  const tableName = ModelClass.tableName;
  const pk = ModelClass.primaryKey;
  if (Array.isArray(pk)) {
    throw new Error(
      `defineFixtures: composite primary keys are not supported (model: ${ModelClass.name}, pk: [${pk.join(", ")}])`,
    );
  }
  const pkCol = pk;

  // Register this model in the adapter-scoped tableName registry (Phase 1b).
  const registry = getRegistry(adapter);
  registry.set(tableName, ModelClass);

  const habtmParts = detectHabtmParts(registry, tableName);

  const labels = Object.keys(fixtures) as K[];

  // Build rows with deterministic IDs and resolved references
  const rows: FixtureAttrs[] = [];
  for (const label of labels) {
    const attrs = fixtures[label];
    const id = fixtureId(label);
    const row: FixtureAttrs = { [pkCol]: id };

    for (const [col, val] of Object.entries(attrs)) {
      if (col === pkCol) continue; // deterministic ID wins; caller must not override it

      if (isFixtureRef(val)) {
        row[col] = fixtureId(val.fixtureName);
        continue;
      }

      // Polymorphic belongs_to expansion: { taggable: instance } → taggable_type + taggable_id.
      // Only fires for actual model instances (constructor !== Object); plain JSON objects fall
      // through to the normal object-with-PK handling below.
      const poly = findPolymorphicRef(ModelClass, col);
      if (poly && val !== null && typeof val === "object" && (val as any).constructor !== Object) {
        const instance = val as FixtureAttrs;
        const instanceClass = (instance as any).constructor as BaseClass | undefined;
        const instancePk = (instanceClass as any)?.primaryKey ?? pkCol;
        row[poly.idColumn] = instance[typeof instancePk === "string" ? instancePk : pkCol];
        row[poly.typeColumn] = instanceClass?.name;
        continue;
      }

      // HABTM auto-resolution: string label values for `a_id`/`b_id` columns auto-resolve.
      // "developers_projects" → left="developers", right="projects"; FK cols are
      // "developer_id" and "project_id" (singularized via activesupport).
      if (habtmParts && typeof val === "string") {
        const [left, right] = habtmParts;
        const leftSingular = singularize(left);
        const rightSingular = singularize(right);
        if (col === `${leftSingular}_id` || col === `${rightSingular}_id`) {
          row[col] = fixtureId(val);
          continue;
        }
      }

      if (val !== null && typeof val === "object" && pkCol in val) {
        // Model instance (or any object with the PK): extract the PK value.
        row[col] = (val as FixtureAttrs)[pkCol];
      } else {
        row[col] = val;
      }
    }
    rows.push(row);
  }

  // Mirrors Rails: pass tableName as tablesToDelete so rows are replaced, not appended.
  await insertFixturesSet.call(adapter as unknown as InsertHost, { [tableName]: rows }, [
    tableName,
  ]);

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
