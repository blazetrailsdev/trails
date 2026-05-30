import {
  insertFixturesSet,
  type DatabaseStatementsHost,
} from "../connection-adapters/abstract/database-statements.js";
import type { DatabaseAdapter } from "../adapter.js";
import { Base } from "../base.js";
import type { Quoting } from "../connection-adapters/abstract/quoting-interface.js";
import { currentTimeFromProperTimezone } from "../timestamp.js";
import { singularize } from "@blazetrails/activesupport";

const FIXTURE_MAX_ID = 2 ** 30 - 1;

// Standard Rails timestamp columns, auto-filled at fixture insert when present and
// unset (see fill_timestamps below). Mirrors ActiveRecord::Timestamp's create+update sets.
const TIMESTAMP_COLUMN_NAMES = ["created_at", "created_on", "updated_at", "updated_on"];

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

/**
 * Resolves a row's primary key. The declared value is used verbatim when it is
 * an integer (Rails fixture parity — YAML `id: N` parses as a number) or a
 * string (models with a declared string/non-integer `primary_key`, e.g.
 * Subscriber's `nick` or Dashboard's `dashboard_id`). When the PK column is
 * absent, `fixtureId(label)` supplies the deterministic CRC32 id. A PK column
 * present with any other value (boolean, fractional number, object) is rejected:
 * it means the fixture author tried to declare an id but the type is wrong, and
 * silently falling back to CRC32 would mask the bug.
 */
function resolveDeclaredPk(
  tableName: string,
  pkCol: string,
  label: string,
  declared: unknown,
): number | string {
  if (declared === undefined) return fixtureId(label);
  if (typeof declared === "number" && Number.isInteger(declared)) return declared;
  if (typeof declared === "string") return declared;
  throw new Error(
    `defineFixtures: ${tableName}.${label} declares an invalid primary key (${typeof declared}: ${String(declared)}); use an integer or string literal (e.g. \`${pkCol}: 1\` or \`${pkCol}: "foo"\`) or omit the column.`,
  );
}

const REF_TAG = Symbol("fixture-ref");

export interface FixtureRef {
  readonly [REF_TAG]: true;
  readonly tableName: string;
  readonly fixtureName: string;
}

/**
 * Cross-batch cross-reference sentinel. Resolves to the target fixture's id at insert time:
 * `(tableName, fixtureName)` is looked up in the adapter-scoped declared-id registry first
 * (populated by `defineFixtures()` when a row carries an explicit primary key), falling back
 * to `fixtureId(fixtureName)` (CRC32) when the target fixture set hasn't been loaded yet
 * or the target row has no declared PK.
 *
 * Ordering requirement: if the target fixture set declares explicit ids, load it BEFORE
 * any set that references it. A `ref()` resolved before the target loads will return the
 * CRC32 fallback and persist that value as the FK — loading the target afterwards does
 * not retroactively update already-inserted rows. `useFixtures()` iterates its argument
 * in declaration order, so list dependents after dependencies.
 */
export function ref(tableName: string, fixtureName: string): FixtureRef {
  return { [REF_TAG]: true, tableName, fixtureName };
}

/** @internal */
export function isFixtureRef(v: unknown): v is FixtureRef {
  return typeof v === "object" && v !== null && REF_TAG in v;
}

// Adapter-scoped registry of declared fixture ids, nested by table so a subsequent
// defineFixtures() call for the same table fully replaces the prior label set —
// no leakage of stale labels when the caller reloads a subset. Values are the row's
// primary-key value (declared PK when the row carries one, else fixtureId(label)).
const declaredIds = new WeakMap<object, Map<string, Map<string, number | string>>>();

function declaredIdsFor(adapter: object): Map<string, Map<string, number | string>> {
  let m = declaredIds.get(adapter);
  if (!m) {
    m = new Map();
    declaredIds.set(adapter, m);
  }
  return m;
}

/** @internal */
export function resolveFixtureId(
  adapter: DatabaseAdapter,
  tableName: string,
  fixtureName: string,
): number | string {
  const declared = declaredIdsFor(adapter).get(tableName)?.get(fixtureName);
  return declared ?? fixtureId(fixtureName);
}

/**
 * Returns the adapter's normalized name (`"postgres"` / `"mysql"` / `"sqlite"`).
 * Lets ERB-style adapter-conditional fixture data translate to TS:
 *
 * ```ts
 * { data: adapterName(adapter) === "postgres" ? a : b }
 * ```
 */
export function adapterName(adapter: DatabaseAdapter): "postgres" | "mysql" | "sqlite" {
  return adapter.adapterName;
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

/** Clears the model registry for the given adapter. Useful in test suites that reuse one adapter across multiple files. */
export function clearTableRegistry(adapter: DatabaseAdapter): void {
  tableRegistries.delete(adapter);
  declaredIds.delete(adapter);
}

/** @internal */
export function resolveModelForTable(
  adapter: DatabaseAdapter,
  tableName: string,
): BaseClass | undefined {
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
  const reflections: Record<string, unknown> = (modelClass as any)._reflections ?? {};
  const refl = reflections[colName] as
    | {
        macro?: string;
        isPolymorphic?: () => boolean;
        foreignType?: string;
        foreignKey?: string | string[];
      }
    | undefined;
  if (!refl || refl.macro !== "belongsTo" || !refl.isPolymorphic?.()) return null;
  // Prefer the reflection's own foreignType/foreignKey to honour custom column overrides.
  const typeColumn: string = refl.foreignType ?? `${colName}_type`;
  const rawFk: string | string[] = refl.foreignKey ?? `${colName}_id`;
  if (Array.isArray(rawFk)) {
    throw new Error(
      `defineFixtures: polymorphic association "${colName}" has a composite foreignKey — pass explicit ${typeColumn}, ${rawFk.join(", ")} instead`,
    );
  }
  return { typeColumn, idColumn: rawFk };
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
 * - Timestamps: when the model records timestamps, any existing
 *   `created_at`/`created_on`/`updated_at`/`updated_on` column the row omits is filled with the
 *   current time, mirroring Rails' `FixtureSet::TableRow#fill_timestamps` (lets NOT NULL
 *   timestamp tables seed without each fixture row spelling the columns out).
 */
export async function defineFixtures<T extends BaseClass, K extends string>(
  adapter: DatabaseAdapter,
  ModelClass: T,
  fixtures: Record<K, FixtureAttrs>,
): Promise<{ [P in K]: InstanceType<T> }> {
  const tableName = ModelClass.tableName;
  const declaredPk = ModelClass.primaryKey;
  if (Array.isArray(declaredPk)) {
    throw new Error(
      `defineFixtures: composite primary keys are not supported (model: ${ModelClass.name}, pk: [${declaredPk.join(", ")}])`,
    );
  }

  // Reconcile the model's PK against the table's ACTUAL schema PK column. Rails
  // resolves `Base.primary_key` by introspecting the schema; our models don't
  // always declare a custom `primaryKey`, so for tables whose PK column differs
  // from the default `id` (`bulbs` → "ID", `mixed_case_monkeys` → "monkeyID") or
  // which have no PK at all (id-less tables like `mateys`), we trust the schema's
  // actual PK over the model's default. `pkCol === null` means an id-less table:
  // no PK column is seeded and the reload matches on the full row instead.
  let pkCol: string | null = declaredPk;
  if (typeof (adapter as any).primaryKey === "function") {
    const schemaPk: string | string[] | null = await (adapter as any).primaryKey(tableName);
    if (Array.isArray(schemaPk)) {
      throw new Error(
        `defineFixtures: composite primary keys are not supported (table: ${tableName}, pk: [${schemaPk.join(", ")}])`,
      );
    }
    if (schemaPk === null) {
      pkCol = null;
    } else if (declaredPk !== "id" && declaredPk !== schemaPk) {
      // The model trusts a custom PK that the schema contradicts — a real bug.
      // (A plain `id` default just defers to the schema, exactly like Rails'
      // introspected `Base.primary_key`.) Surface it rather than silently
      // writing to a phantom column.
      throw new Error(
        `defineFixtures: ${ModelClass.name} declares primaryKey "${declaredPk}" but table "${tableName}" has primary key "${schemaPk}" — fix the model or the schema`,
      );
    } else {
      pkCol = schemaPk;
    }
  }

  // Register this model in the adapter-scoped tableName registry (Phase 1b).
  const registry = getRegistry(adapter);
  registry.set(tableName, ModelClass);

  const habtmParts = detectHabtmParts(registry, tableName);
  // Compute once per defineFixtures call; used for every row and column in the inner loop.
  const habtmFkColToTable: Map<string, string> | null = habtmParts
    ? new Map([
        [`${singularize(habtmParts[0])}_id`, habtmParts[0]],
        [`${singularize(habtmParts[1])}_id`, habtmParts[1]],
      ])
    : null;

  const labels = Object.keys(fixtures) as K[];

  // Pre-pass: build this table's label→id map locally, then swap it in atomically
  // so a mid-loop validation failure (e.g. non-integer declared PK) leaves the
  // registry untouched. The swap also replaces any prior label set, evicting
  // entries for labels omitted from a subset reload. The prior entry is captured
  // so we can roll back if the INSERT itself fails — `ref()` resolution must not
  // observe ids for rows that never landed in the database.
  const tableIds = new Map<string, number | string>();
  if (pkCol !== null) {
    for (const label of labels) {
      const id = resolveDeclaredPk(
        tableName,
        pkCol,
        label,
        (fixtures[label] as FixtureAttrs)[pkCol],
      );
      tableIds.set(label, id);
    }
  }
  const adapterIds = declaredIdsFor(adapter);
  const priorTableIds = adapterIds.get(tableName);
  adapterIds.set(tableName, tableIds);

  // Build rows with resolved IDs and references. Rows that declare `id: N` use it
  // verbatim (Rails parity); rows without one fall back to fixtureId(label).
  const rows: FixtureAttrs[] = [];
  for (const label of labels) {
    const attrs = fixtures[label];
    const row: FixtureAttrs =
      pkCol !== null ? { [pkCol]: resolveDeclaredPk(tableName, pkCol, label, attrs[pkCol]) } : {};

    for (const [col, val] of Object.entries(attrs)) {
      if (pkCol !== null && col === pkCol) continue; // PK already set above (declared id or fixtureId fallback)

      // Evaluate poly once so both the ref guard and the expansion below share the result.
      const poly = findPolymorphicRef(ModelClass, col);

      if (isFixtureRef(val)) {
        if (poly) {
          throw new Error(
            `defineFixtures: "${col}" is a polymorphic association — pass a model instance instead of ref(). ` +
              `Use explicit ${poly.typeColumn}/${poly.idColumn} if you need to reference by ID.`,
          );
        }
        row[col] = resolveFixtureId(adapter, val.tableName, val.fixtureName);
        continue;
      }

      // Polymorphic belongs_to expansion: { taggable: instance } → taggable_type + taggable_id.
      // When the caller already provided explicit type/id columns, skip the association key
      // entirely (don't write it as a spurious column) — explicit values win.
      // When neither explicit column is present, expand only real Base instances.
      // Plain objects, null-proto objects, and non-Base class instances throw —
      // ambiguous duck-typing was rejected in favour of a real `instanceof Base` check.
      // Polymorphic belongs_to: "col" is an association name, never a real column.
      // It must always be consumed here — falling through to `row[col] = val` would
      // attempt to INSERT a non-existent column and break fixture insertion.
      if (poly) {
        const hasType = poly.typeColumn in attrs;
        const hasId = poly.idColumn in attrs;
        if (hasType !== hasId) {
          throw new Error(
            `defineFixtures: "${col}" — provide both ${poly.typeColumn} and ${poly.idColumn} explicitly, or neither (use the association key instead)`,
          );
        }
        if (hasType) continue; // both explicit columns present; association key is not a column

        if (val === null) {
          // null clears the association: mirrors Rails setting both FK columns to NULL.
          row[poly.idColumn] = null;
          row[poly.typeColumn] = null;
          continue;
        }

        if (val instanceof Base) {
          const instance = val as unknown as FixtureAttrs;
          const instanceClass = (instance as any).constructor as BaseClass | undefined;
          const instancePk = (instanceClass as any)?.primaryKey;
          if (Array.isArray(instancePk)) {
            throw new Error(
              `defineFixtures: polymorphic target "${col}" has a composite primary key — pass explicit ${poly.typeColumn} and ${poly.idColumn} instead`,
            );
          }
          const instancePkCol = typeof instancePk === "string" ? instancePk : "id";
          const pkValue = instance[instancePkCol];
          if (pkValue === undefined) {
            throw new Error(
              `defineFixtures: polymorphic target "${col}" has no value for PK column "${instancePkCol}" — ensure the instance exposes its primary key`,
            );
          }
          // Mirror Rails' polymorphicName: use static polymorphicName() if defined, else class name.
          const typeName: string =
            (instanceClass as any)?.polymorphicName?.() ?? instanceClass?.name ?? "Unknown";
          row[poly.idColumn] = pkValue;
          row[poly.typeColumn] = typeName;
          continue;
        }

        throw new Error(
          `defineFixtures: "${col}" is a polymorphic association — pass a model instance, null, or explicit ${poly.typeColumn}/${poly.idColumn} columns`,
        );
      }

      // HABTM auto-resolution: string label values for `a_id`/`b_id` columns
      // resolve through the same declared-id registry as ref(), so explicit
      // Rails ids on the target fixture (e.g. developers.david.id = 1) win
      // over the CRC32 fallback.
      if (habtmFkColToTable && typeof val === "string") {
        const targetTable = habtmFkColToTable.get(col);
        if (targetTable !== undefined) {
          row[col] = resolveFixtureId(adapter, targetTable, val);
          continue;
        }
      }

      if (val !== null && typeof val === "object" && pkCol !== null && pkCol in val) {
        // Model instance (or any object with the PK): extract the PK value.
        row[col] = (val as FixtureAttrs)[pkCol];
      } else {
        row[col] = val;
      }
    }
    rows.push(row);
  }

  // Inspect the live table columns once for two adjustments below.
  // Avoid supportsVirtualColumns() — it requires databaseVersion to be pre-initialized.
  // isVirtual() returns false for non-virtual adapters, so calling columns() is always safe.
  if (typeof (adapter as any).columns === "function") {
    const cols: { name: string; isVirtual(): boolean }[] = await (adapter as any).columns(
      tableName,
    );

    // Filter generated (virtual) columns — PG rejects INSERT on those columns.
    // Mirrors Rails: build_fixture_sql rejects schema_cache.columns_hash entries where column.virtual?
    const virtualNames = new Set(cols.filter((c) => c.isVirtual()).map((c) => c.name));
    if (virtualNames.size > 0) {
      for (const row of rows) {
        for (const name of virtualNames) delete row[name];
      }
    }

    // Auto-stamp timestamp columns the fixture didn't set. Mirrors Rails'
    // FixtureSet::TableRow#fill_timestamps: when the model records timestamps,
    // fill every existing created_at/created_on/updated_at/updated_on column that
    // the row omits with the current time. NOT NULL timestamp tables (people, cars,
    // toys, …) can't seed without this. A Temporal.Instant is used so the adapter's
    // quoting renders an engine-safe datetime literal (no tz offset on MySQL).
    if ((ModelClass as { recordTimestamps?: boolean }).recordTimestamps !== false) {
      const colNames = new Set(cols.map((c) => c.name));
      const stampCols = TIMESTAMP_COLUMN_NAMES.filter((c) => colNames.has(c));
      if (stampCols.length > 0) {
        const now = currentTimeFromProperTimezone();
        for (const row of rows) {
          for (const c of stampCols) if (!(c in row)) row[c] = now;
        }
      }
    }
  }

  // Mirrors Rails: pass tableName as tablesToDelete so rows are replaced, not appended.
  // On failure, roll back the declared-id registry to its pre-call state so subsequent
  // ref() calls don't resolve to ids for rows that never made it to the database.
  try {
    await insertFixturesSet.call(adapter as unknown as InsertHost, { [tableName]: rows }, [
      tableName,
    ]);
  } catch (err) {
    if (priorTableIds === undefined) {
      adapterIds.delete(tableName);
    } else {
      adapterIds.set(tableName, priorTableIds);
    }
    throw err;
  }

  // Reload persisted instances so AR attribute casting is applied. Reload runs
  // `unscoped` so a model default_scope (e.g. Bulb's `where(name: "defaulty")`)
  // can't hide a just-seeded row — fixtures bypass default scopes in Rails too.
  // Id-less tables (pkCol === null) have no PK to look up by, so match the full
  // inserted row instead.
  const result = {} as { [P in K]: InstanceType<T> };
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]!;
    const row = rows[i] as FixtureAttrs;
    const criteria = pkCol !== null ? { [pkCol]: row[pkCol] } : row;
    const find = () => (ModelClass as any).findBy(criteria);
    const record =
      typeof (ModelClass as any).unscoped === "function"
        ? await (ModelClass as any).unscoped(find)
        : await find();
    if (!record) {
      throw new Error(
        `defineFixtures: inserted fixture "${label}" not found after insert (table: ${tableName}, criteria: ${JSON.stringify(criteria)})`,
      );
    }
    result[label] = record as InstanceType<T>;
  }
  return result;
}
