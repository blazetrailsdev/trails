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
 * NOTE: Join table row generation for has_many :through associations
 * is not yet implemented. This class exists for API parity but passing
 * it to _resolveAssociations will only resolve the foreign key like a
 * regular belongs_to — it will not generate join table rows.
 */
export class HasManyThroughProxy extends ReflectionProxy {
  readonly through: string;
  readonly sourceReflection: ReflectionProxy;

  constructor(
    name: string,
    foreignKey: string,
    className: string,
    through: string,
    sourceReflection: ReflectionProxy,
  ) {
    super(name, foreignKey, className);
    this.through = through;
    this.sourceReflection = sourceReflection;
  }
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

  /**
   * Resolve association labels to foreign key IDs.
   *
   * If a fixture row has a key matching an association name (e.g. "author")
   * and the value is a string (a fixture label), replace it with the
   * foreign key column set to the deterministic ID for that label.
   *
   * Example:
   *   row: { title: "Hello", author: "alice" }
   *   association: { name: "author", foreignKey: "author_id", className: "Author" }
   *   result: { title: "Hello", author_id: identify("alice") }
   */
  private _resolveAssociations(associations: ReflectionProxy[]): void {
    for (const assoc of associations) {
      const value = this._row[assoc.name];
      if (typeof value === "string" && value !== "") {
        if (!Object.prototype.hasOwnProperty.call(this._row, assoc.foreignKey)) {
          this._row[assoc.foreignKey] = identify(value);
        }
        if (assoc.name !== assoc.foreignKey) {
          delete this._row[assoc.name];
        }
      }
    }
  }
}
