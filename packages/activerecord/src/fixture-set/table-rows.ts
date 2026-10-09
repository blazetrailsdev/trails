import type { Base } from "../base.js";
import type { Fixture } from "../fixtures.js";
import { Time as RubyTime } from "@blazetrails/date";
import { Hash, rbFSend, transformValues } from "@blazetrails/ruby-compat";
import { defaultTimezone } from "../active-record.js";
import { TableRow } from "./table-row.js";
import { ModelMetadata } from "./model-metadata.js";

export class TableRows {
  readonly tables: Hash<string, (TableRow | Record<string, unknown>)[] | null>;
  readonly modelClass: typeof Base | null;
  private _modelMetadata?: ModelMetadata;

  constructor(
    tableName: string,
    { modelClass, fixtures }: { modelClass: typeof Base | null; fixtures: Record<string, Fixture> },
  ) {
    this.modelClass = modelClass;

    this.tables = new Hash((h, table) => {
      const rows: (TableRow | Record<string, unknown>)[] = [];
      h.set(table, rows);
      return rows;
    });

    this.tables.set(tableName, null);

    this.buildTableRowsFrom(tableName, fixtures);
  }

  toHash(): Hash<string, Record<string, unknown>[]> {
    return transformValues(this.tables, (rows) =>
      rows!.map((row) => rbFSend(row, "toHash") as Record<string, unknown>),
    );
  }

  get modelMetadata(): ModelMetadata {
    return (this._modelMetadata ??= new ModelMetadata(this.modelClass));
  }

  private buildTableRowsFrom(tableName: string, fixtures: Record<string, Fixture>): void {
    const now = defaultTimezone() === "utc" ? RubyTime.now().getutc() : RubyTime.now();

    this.tables.set(
      tableName,
      Object.entries(fixtures).map(
        ([label, fixture]) => new TableRow(fixture, { tableRows: this, label, now }),
      ),
    );
  }
}
