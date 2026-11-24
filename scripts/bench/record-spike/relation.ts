import { preload } from "./associations.js";
import type { Base, ModelClass } from "./base.js";
import { quote, quoteColumnName } from "./connection-handling.js";
import type { Attributes } from "./attribute-methods.js";
import { ActiveRecordError } from "./errors.js";
import { primaryKeyBang } from "./model-schema.js";
import { instantiate } from "./persistence.js";
import { cast, serialize } from "./type.js";

export type OrderDirection = "asc" | "desc" | "ASC" | "DESC";

/**
 * An immutable query. Each builder call returns a new relation holding SQL
 * fragments and binds, so compiling is a string join: there is no node tree.
 * The compiled text, binds left as `?`, is the relation's shape, and the
 * connection keeps one prepared statement per shape. LIMIT is written into
 * the text as a literal: SQLite answers a primary-key lookup about ten times
 * slower when its LIMIT is bound (README, "Known differences").
 */
export class Relation<T extends Base> {
  readonly klass: ModelClass<T>;
  private readonly wheres: readonly string[];
  private readonly binds: readonly unknown[];
  private readonly orders: readonly string[];
  private readonly limitValue: number | null;
  private readonly includesValues: readonly string[];

  constructor(
    klass: ModelClass<T>,
    wheres: readonly string[] = [],
    binds: readonly unknown[] = [],
    orders: readonly string[] = [],
    limitValue: number | null = null,
    includesValues: readonly string[] = [],
  ) {
    this.klass = klass;
    this.wheres = wheres;
    this.binds = binds;
    this.orders = orders;
    this.limitValue = limitValue;
    this.includesValues = includesValues;
  }

  where(conditions: Attributes): Relation<T> {
    const schema = this.klass.schema;
    const wheres = this.wheres.slice();
    const binds = this.binds.slice();
    for (const name of Object.keys(conditions)) {
      const column = `${schema.quotedTableName}.${quoteColumnName(name)}`;
      const index = schema.columnIndex.get(name);
      const type = index === undefined ? "value" : schema.types[index];
      const value = conditions[name];
      if (value == null) {
        wheres.push(`${column} IS NULL`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) {
          wheres.push("1=0");
          continue;
        }
        wheres.push(`${column} IN (${value.map(() => "?").join(", ")})`);
        for (const element of value) binds.push(serialize(type, cast(type, element)));
      } else {
        wheres.push(`${column} = ?`);
        binds.push(serialize(type, cast(type, value)));
      }
    }
    return this.spawn({ wheres, binds });
  }

  order(ordering: Record<string, OrderDirection>): Relation<T> {
    const { quotedTableName } = this.klass.schema;
    const orders = this.orders.slice();
    for (const name of Object.keys(ordering)) {
      orders.push(`${quotedTableName}.${quoteColumnName(name)} ${ordering[name].toUpperCase()}`);
    }
    return this.spawn({ orders });
  }

  limit(value: number | string | null): Relation<T> {
    const limitValue = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (limitValue !== null && !Number.isInteger(limitValue)) {
      throw new ActiveRecordError(`limit takes an integer, not ${String(value)}`);
    }
    return this.spawn({ limitValue: limitValue as number | null });
  }

  includes(...names: string[]): Relation<T> {
    return this.spawn({ includesValues: [...this.includesValues, ...names] });
  }

  async toArray(): Promise<T[]> {
    const schema = this.klass.schema;
    const rows = this.klass.connection.selectRows(this.compile(), this.binds);
    const records = new Array<T>(rows.length);
    for (let i = 0; i < rows.length; i++) records[i] = instantiate(schema, rows[i]) as T;
    if (this.includesValues.length > 0) preload(this.klass, records, this.includesValues);
    return records;
  }

  async first(): Promise<T | null> {
    if (this.orders.length > 0) return this.limit(1).take();
    const { quotedTableName } = this.klass.schema;
    const primaryKey = quoteColumnName(primaryKeyBang(this.klass.schema));
    return this.spawn({ orders: [`${quotedTableName}.${primaryKey} ASC`] })
      .limit(1)
      .take();
  }

  async findBy(conditions: Attributes): Promise<T | null> {
    return this.where(conditions).limit(1).take();
  }

  async count(): Promise<number> {
    const { quotedTableName } = this.klass.schema;
    const sql =
      this.limitValue === null
        ? `SELECT COUNT(*) FROM ${quotedTableName}${this.whereSql()}`
        : `SELECT COUNT(*) FROM (SELECT 1 AS one FROM ${quotedTableName}${this.whereSql()}` +
          ` LIMIT ${this.limitValue}) subquery_for_count`;
    return this.klass.connection.selectRow(sql, this.binds)![0] as number;
  }

  toSql(): string {
    let i = 0;
    return this.compile().replace(/"(?:[^"]|"")*"|\?/g, (token) =>
      token === "?" ? quote(this.binds[i++]) : token,
    );
  }

  private take(): T | null {
    const row = this.klass.connection.selectRow(this.compile(), this.binds);
    if (row === undefined) return null;
    const record = instantiate(this.klass.schema, row) as T;
    if (this.includesValues.length > 0) preload(this.klass, [record], this.includesValues);
    return record;
  }

  private whereSql(): string {
    return this.wheres.length > 0 ? ` WHERE ${this.wheres.join(" AND ")}` : "";
  }

  private compile(): string {
    let sql = this.klass.schema.selectSql + this.whereSql();
    if (this.orders.length > 0) sql += ` ORDER BY ${this.orders.join(", ")}`;
    if (this.limitValue !== null) sql += ` LIMIT ${this.limitValue}`;
    return sql;
  }

  private spawn(changes: {
    wheres?: readonly string[];
    binds?: readonly unknown[];
    orders?: readonly string[];
    limitValue?: number | null;
    includesValues?: readonly string[];
  }): Relation<T> {
    return new Relation(
      this.klass,
      changes.wheres ?? this.wheres,
      changes.binds ?? this.binds,
      changes.orders ?? this.orders,
      changes.limitValue === undefined ? this.limitValue : changes.limitValue,
      changes.includesValues ?? this.includesValues,
    );
  }
}
