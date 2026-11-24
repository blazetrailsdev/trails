import type { Base } from "./base.js";
import { UnknownAttributeError } from "./errors.js";
import type { AttributeWriter, Column, ModelSchema } from "./model-schema.js";
import { cast, isEqual } from "./type.js";

export type Attributes = Record<string, unknown>;

function readerFor({ index, type }: Column): (this: Base) => unknown {
  if (type === "integer") {
    return function () {
      const value = this._row[index];
      if (typeof value === "number" || value === null) return value;
      return (this._row[index] = cast(type, value));
    };
  }
  if (type === "datetime") {
    return function () {
      const value = this._row[index];
      if (typeof value !== "string") return value;
      return (this._row[index] = cast(type, value));
    };
  }
  return function () {
    return this._row[index];
  };
}

function writerFor({ index, type }: Column): AttributeWriter {
  return (record, value) => {
    if (record._original === null) record._original = record._row.slice();
    record._row[index] = cast(type, value);
  };
}

/**
 * Runs once per model class, when its schema loads: one accessor pair per
 * column on the prototype, and one entry per column in the assignment table.
 * A name the class body already answers keeps the class's own member.
 */
export function defineAttributeMethods(schema: ModelSchema): void {
  const prototype = schema.klass.prototype as object;
  for (const column of schema.columns) {
    const write = writerFor(column);
    schema.writers.set(column.name, write);
    if (column.name in prototype) continue;
    Object.defineProperty(prototype, column.name, {
      configurable: true,
      get: readerFor(column),
      set(this: Base, value: unknown) {
        write(this, value);
      },
    });
  }
}

export function readAttribute(record: Base, name: string): unknown {
  const index = record._schema.columnIndex.get(name);
  if (index === undefined) return null;
  return (record._row[index] = cast(record._schema.types[index], record._row[index]));
}

export function writeAttribute(record: Base, name: string, value: unknown): void {
  const write = record._schema.writers.get(name);
  if (write === undefined) {
    throw new UnknownAttributeError(
      `unknown attribute '${name}' for ${record._schema.klass.name}.`,
    );
  }
  write(record, value);
}

export function assignAttributes(record: Base, attributes: Attributes): void {
  for (const name of Object.keys(attributes)) writeAttribute(record, name, attributes[name]);
}

export function attributes(record: Base): Attributes {
  const result: Attributes = {};
  for (const column of record._schema.columns) {
    result[column.name] = readAttribute(record, column.name);
  }
  return result;
}

export function changedIndexes(record: Base): number[] {
  const original = record._original;
  if (original === null) return [];
  const { types } = record._schema;
  const changed: number[] = [];
  for (let i = 0; i < types.length; i++) {
    if (original[i] === record._row[i]) continue;
    if (!isEqual(cast(types[i], original[i]), cast(types[i], record._row[i]))) changed.push(i);
  }
  return changed;
}

export function changes(record: Base): Record<string, [unknown, unknown]> {
  const { columns, types } = record._schema;
  const result: Record<string, [unknown, unknown]> = {};
  for (const i of changedIndexes(record)) {
    result[columns[i].name] = [
      cast(types[i], record._original![i]),
      cast(types[i], record._row[i]),
    ];
  }
  return result;
}

export function changesApplied(record: Base): void {
  record._original = null;
}
