/**
 * SQLite3 column — SQLite-specific column metadata.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Column
 */

import { Column as BaseColumn } from "../column.js";
import type { ColumnJSON } from "../column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

export class Column extends BaseColumn {
  readonly autoIncrement: boolean;
  readonly rowid: boolean;
  private _generatedType: "stored" | "virtual" | null;

  constructor(
    name: string,
    defaultValue: unknown,
    sqlTypeMetadata: {
      sqlType?: string | null;
      type?: string;
      precision?: number | null;
      limit?: number | null;
      scale?: number | null;
    } = {},
    null_: boolean = true,
    options: {
      collation?: string | null;
      defaultFunction?: string | null;
      primaryKey?: boolean;
      autoIncrement?: boolean;
      rowid?: boolean;
      generatedType?: "stored" | "virtual" | null;
    } = {},
  ) {
    const meta = new SqlTypeMetadata({
      sqlType: sqlTypeMetadata.sqlType ?? undefined,
      type: sqlTypeMetadata.type,
      precision: sqlTypeMetadata.precision ?? undefined,
      limit: sqlTypeMetadata.limit ?? undefined,
      scale: sqlTypeMetadata.scale ?? undefined,
    });
    super(name, defaultValue, meta, null_, {
      collation: options.collation,
      defaultFunction: options.defaultFunction,
      primaryKey: options.primaryKey,
    });
    this.autoIncrement = options.autoIncrement ?? false;
    this.rowid = options.rowid ?? false;
    this._generatedType = options.generatedType ?? null;
  }

  isAutoIncrementedByDb(): boolean {
    return this.autoIncrement || this.rowid;
  }

  isVirtual(): boolean {
    return this._generatedType !== null;
  }

  isVirtualStored(): boolean {
    return this.isVirtual() && this._generatedType === "stored";
  }

  override get hasDefault(): boolean {
    return super.hasDefault && !this.isVirtual();
  }

  override equals(other: unknown): boolean {
    return (
      other instanceof Column && super.equals(other) && this.autoIncrement === other.autoIncrement
    );
  }

  /**
   * @noRailsEquivalent PERMANENT: the schema-cache dump. Rails dumps through
   *   YAML/Marshal, which round-trips the adapter's Column subclass and its
   *   state on its own (`schema_cache.rb:406`); trails' dump is JSON, so the
   *   subclass has to spell out what it carries and tag itself for
   *   `rehydrateColumn`. Mirrors MySQL::Column's pair.
   */
  override toJSON(): Sqlite3ColumnJSON {
    return {
      ...super.toJSON(),
      __sqlite3: true,
      autoIncrement: this.autoIncrement,
      rowid: this.rowid,
      generatedType: this._generatedType,
    };
  }

  static override fromJSON(data: ColumnJSON): BaseColumn {
    const s = data as Sqlite3ColumnJSON;
    return new Column(
      s.name,
      s.default,
      {
        sqlType: s.sqlTypeMetadata?.sqlType,
        type: s.sqlTypeMetadata?.type,
        limit: s.sqlTypeMetadata?.limit ?? null,
        precision: s.sqlTypeMetadata?.precision ?? null,
        scale: s.sqlTypeMetadata?.scale ?? null,
      },
      s.null,
      {
        collation: s.collation,
        defaultFunction: s.defaultFunction,
        primaryKey: s.primaryKey,
        autoIncrement: s.autoIncrement,
        rowid: s.rowid,
        generatedType: s.generatedType,
      },
    );
  }
}

/**
 * A dumped SQLite3::Column. Rails' schema-cache dump is YAML/Marshal, which
 * round-trips the adapter's Column subclass on its own; a JSON dump has to
 * carry the discriminator and the subclass' own state explicitly, or a cache
 * loaded from disk would answer `auto_increment?` and `virtual?` `false` for
 * every column (`schema_cache.rb:406`, `schema_cache.rb:228`).
 */
export interface Sqlite3ColumnJSON extends ColumnJSON {
  __sqlite3: true;
  autoIncrement: boolean;
  rowid: boolean;
  generatedType: "stored" | "virtual" | null;
}
