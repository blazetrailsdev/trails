import type { Base } from "./base.js";
import { quoteColumnName } from "./connection-handling.js";
import { AssociationNotFoundError } from "./errors.js";
import { lookupModel, primaryKeyBang } from "./model-schema.js";
import { instantiate } from "./persistence.js";

export interface BelongsToOptions {
  className: string;
  foreignKey: string;
}

export interface Reflection extends BelongsToOptions {
  readonly name: string;
}

function target(record: Base, name: string): Base | null | undefined {
  return record._associationCache === null ? undefined : record._associationCache.get(name);
}

function setTarget(record: Base, name: string, value: Base | null): void {
  (record._associationCache ??= new Map()).set(name, value);
}

function reader(record: Base, reflection: Reflection): Base | null | Promise<Base | null> {
  const loaded = target(record, reflection.name);
  if (loaded !== undefined) return loaded;
  const foreignKey = record.readAttribute(reflection.foreignKey);
  if (foreignKey == null) {
    setTarget(record, reflection.name, null);
    return null;
  }
  const klass = lookupModel(reflection.className);
  primaryKeyBang(klass.schema);
  const row = klass.connection.selectRow(klass.schema.findSql, [foreignKey]);
  const found = row === undefined ? null : instantiate(klass.schema, row);
  setTarget(record, reflection.name, found);
  return Promise.resolve(found);
}

function writer(record: Base, reflection: Reflection, value: Base | null): void {
  record.writeAttribute(reflection.foreignKey, value === null ? null : value.id);
  setTarget(record, reflection.name, value);
}

/**
 * Defines the reader and writer when the class body runs, before any schema
 * is known. The reader answers the loaded record, or `null` for a null
 * foreign key, without a promise; only an unloaded association costs one.
 */
export function belongsTo(klass: typeof Base, name: string, options: BelongsToOptions): void {
  const reflection: Reflection = { name, ...options };
  if (!Object.hasOwn(klass, "_reflections")) klass._reflections = new Map(klass._reflections);
  klass._reflections.set(name, reflection);
  Object.defineProperty(klass.prototype, name, {
    configurable: true,
    get(this: Base) {
      return reader(this, reflection);
    },
    set(this: Base, value: Base | null) {
      writer(this, reflection, value);
    },
  });
}

/** One query per association, whatever the number of owners. */
export function preload(
  klass: typeof Base,
  records: readonly Base[],
  names: readonly string[],
): void {
  for (const name of names) {
    const reflection = klass._reflections.get(name);
    if (reflection === undefined) {
      throw new AssociationNotFoundError(
        `Association named '${name}' was not found on ${klass.name}; perhaps you misspelled it?`,
      );
    }
    const owners = new Map<unknown, Base[]>();
    for (const record of records) {
      const foreignKey = record.readAttribute(reflection.foreignKey);
      if (foreignKey == null) {
        setTarget(record, name, null);
        continue;
      }
      const group = owners.get(foreignKey);
      if (group === undefined) owners.set(foreignKey, [record]);
      else group.push(record);
    }
    if (owners.size === 0) continue;

    const targetClass = lookupModel(reflection.className);
    const { schema } = targetClass;
    const column = `${schema.quotedTableName}.${quoteColumnName(primaryKeyBang(schema))}`;
    const ids = [...owners.keys()];
    const predicate = ids.length === 1 ? "= ?" : `IN (${ids.map(() => "?").join(", ")})`;
    const rows = targetClass.connection.selectRows(
      `${schema.selectSql} WHERE ${column} ${predicate}`,
      ids,
    );
    for (const group of owners.values()) for (const owner of group) setTarget(owner, name, null);
    for (const row of rows) {
      const found = instantiate(schema, row);
      for (const owner of owners.get(row[schema.primaryKeyIndex]) ?? []) {
        setTarget(owner, name, found);
      }
    }
  }
}

export function associationWriters(
  klass: typeof Base,
): Map<string, (record: Base, value: unknown) => void> {
  const writers = new Map<string, (record: Base, value: unknown) => void>();
  for (const reflection of klass._reflections.values()) {
    writers.set(reflection.name, (record, value) =>
      writer(record, reflection, value as Base | null),
    );
  }
  return writers;
}
