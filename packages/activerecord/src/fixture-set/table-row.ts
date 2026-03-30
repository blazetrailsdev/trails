/**
 * Table row — processes a single fixture row, resolving association
 * labels to foreign key IDs and assigning deterministic primary keys.
 *
 * Mirrors: ActiveRecord::FixtureSet::TableRow
 */

import { identify } from "./identify.js";

export class PrimaryKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrimaryKeyError";
  }
}

/**
 * Mirrors: ActiveRecord::FixtureSet::TableRow::ReflectionProxy
 *
 * Describes a belongs_to association for fixture resolution.
 * When a fixture row has a key matching `name`, the value is
 * treated as a fixture label and resolved to `foreignKey: identify(value)`.
 */
export class ReflectionProxy {
  readonly name: string;
  readonly foreignKey: string;
  readonly className: string;

  constructor(name: string, foreignKey: string, className: string) {
    this.name = name;
    this.foreignKey = foreignKey;
    this.className = className;
  }
}

/**
 * Mirrors: ActiveRecord::FixtureSet::TableRow::HasManyThroughProxy
 *
 * Describes a has_many :through association. When a fixture row has
 * a key matching `name` with an array of labels, join table rows
 * are generated linking this fixture to each referenced fixture.
 */
export class HasManyThroughProxy extends ReflectionProxy {
  readonly joinTable: string;
  readonly associationForeignKey: string;

  constructor(options: {
    name: string;
    joinTable: string;
    foreignKey: string;
    associationForeignKey: string;
    className: string;
  }) {
    super(options.name, options.foreignKey, options.className);
    this.joinTable = options.joinTable;
    this.associationForeignKey = options.associationForeignKey;
  }
}

export interface JoinRow {
  table: string;
  row: Record<string, unknown>;
}

/**
 * Mirrors: ActiveRecord::FixtureSet::TableRow
 */
export class TableRow {
  static readonly PrimaryKeyError = PrimaryKeyError;
  static readonly ReflectionProxy = ReflectionProxy;
  static readonly HasManyThroughProxy = HasManyThroughProxy;

  readonly label: string;
  private _row: Record<string, unknown>;
  private _primaryKey: string;
  private _joinRows: JoinRow[] = [];

  constructor(
    label: string,
    row: Record<string, unknown>,
    options: {
      primaryKey?: string;
      associations?: ReflectionProxy[];
    } = {},
  ) {
    this.label = label;
    this._row = { ...row };
    this._primaryKey = options.primaryKey ?? "id";

    if (this._row[this._primaryKey] == null) {
      this._row[this._primaryKey] = identify(label);
    }

    if (options.associations) {
      this._resolveAssociations(options.associations);
    }
  }

  get row(): Record<string, unknown> {
    return { ...this._row };
  }

  get primaryKeyValue(): unknown {
    return this._row[this._primaryKey];
  }

  get joinRows(): JoinRow[] {
    return [...this._joinRows];
  }

  private _resolveAssociations(associations: ReflectionProxy[]): void {
    for (const assoc of associations) {
      if (assoc instanceof HasManyThroughProxy) {
        this._resolveHasManyThrough(assoc);
      } else {
        const value = this._row[assoc.name];
        if (typeof value === "string") {
          if (value !== "" && !Object.prototype.hasOwnProperty.call(this._row, assoc.foreignKey)) {
            this._row[assoc.foreignKey] = identify(value);
          }
          if (assoc.name !== assoc.foreignKey) {
            delete this._row[assoc.name];
          }
        }
      }
    }
  }

  private _resolveHasManyThrough(assoc: HasManyThroughProxy): void {
    const raw = this._row[assoc.name];
    if (raw === undefined) return;

    // Normalize to array: single string becomes [string]
    if (typeof raw !== "string" && !Array.isArray(raw)) {
      throw new Error(
        `Fixture "${this.label}": expected string or array for has_many :through association "${assoc.name}", got ${typeof raw}`,
      );
    }
    const labels: unknown[] = typeof raw === "string" ? [raw] : raw;

    for (const label of labels) {
      if (label === "") continue;
      if (typeof label !== "string") {
        throw new Error(
          `Fixture "${this.label}": expected all entries for has_many :through association "${assoc.name}" to be strings, got ${typeof label}`,
        );
      }
      this._joinRows.push({
        table: assoc.joinTable,
        row: {
          [assoc.foreignKey]: this.primaryKeyValue,
          [assoc.associationForeignKey]: identify(label),
        },
      });
    }

    delete this._row[assoc.name];
  }
}
