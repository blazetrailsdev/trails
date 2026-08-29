import { Attribute, RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { Nodes } from "@blazetrails/arel";
import { RangeError as ARRangeError } from "./errors.js";
import type { Base } from "./base.js";

export class Substitute {}

export class Query {
  private _sql: string;

  constructor(sql: string) {
    this._sql = sql;
  }

  sqlFor(_binds: unknown[], _connection: unknown): string {
    return this._sql;
  }
}

export class PartialQuery extends Query {
  private _values: unknown[];
  private _indexes: number[];

  constructor(values: unknown[]) {
    super("");
    this._values = values;
    this._indexes = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] instanceof Substitute) {
        this._indexes.push(i);
      }
    }
  }

  override sqlFor(binds: unknown[], connection: unknown): string {
    const val = [...this._values];
    const bindsCopy = [...binds];
    for (const i of this._indexes) {
      let value = bindsCopy.shift();
      if (value instanceof Attribute) {
        value = value.valueForDatabase;
      }
      const conn = connection as { quote?(v: unknown): string };
      val[i] = conn.quote ? conn.quote(value) : quoteValue(value);
    }
    return val.join("");
  }
}

export class PartialQueryCollector {
  preparable = false;
  retryable = true;
  private _parts: unknown[] = [];
  private _binds: unknown[] = [];

  append(str: string): this {
    this._parts.push(str);
    return this;
  }

  addBind(obj: unknown, _block?: (index: number) => string): this {
    this._binds.push(obj);
    this._parts.push(new Substitute());
    return this;
  }

  addBinds(
    binds: unknown[],
    procForBinds?: ((v: unknown) => unknown) | null,
    _block?: (index: number) => string,
  ): this {
    const mapped = procForBinds ? binds.map(procForBinds) : binds;
    this._binds.push(...mapped);
    for (let i = 0; i < binds.length; i++) {
      if (i > 0) this._parts.push(", ");
      this._parts.push(new Substitute());
    }
    return this;
  }

  get value(): [unknown[], unknown[]] {
    return [this._parts, this._binds];
  }
}

export class Params {
  bind(): Substitute {
    return new Substitute();
  }
}

export class BindMap {
  private _indexes: number[];
  private _boundAttributes: unknown[];

  constructor(boundAttributes: unknown[]) {
    this._boundAttributes = boundAttributes;
    this._indexes = [];
    for (let i = 0; i < boundAttributes.length; i++) {
      const attr = boundAttributes[i];
      if (
        attr instanceof Substitute ||
        (attr instanceof Attribute && attr.valueBeforeTypeCast instanceof Substitute)
      ) {
        this._indexes.push(i);
      }
    }
  }

  bind(values: unknown[]): unknown[] {
    const bas = [...this._boundAttributes];
    for (let i = 0; i < this._indexes.length; i++) {
      const offset = this._indexes[i];
      const attr = bas[offset];
      if (attr instanceof Attribute) {
        bas[offset] = attr.withCastValue(values[i]);
      } else {
        bas[offset] = values[i];
      }
    }
    return bas;
  }
}

export class StatementCache {
  private _queryBuilder: Query | PartialQuery;
  private _bindMap: BindMap;
  private _model: typeof Base;

  constructor(queryBuilder: Query | PartialQuery, bindMap: BindMap, model: typeof Base) {
    this._queryBuilder = queryBuilder;
    this._bindMap = bindMap;
    this._model = model;
  }

  static query(sql: string): Query {
    return new Query(sql);
  }

  static partialQuery(values: unknown[]): PartialQuery {
    return new PartialQuery(values);
  }

  static partialQueryCollector(): PartialQueryCollector {
    return new PartialQueryCollector();
  }

  /** @missingRailsCall call — PERMANENT */
  static create(
    connection: {
      cacheableQuery(klass: unknown, arel: unknown): [unknown, unknown[]];
      preparedStatements?: boolean;
    },
    callable: (params: Params) => {
      arel: (() => { toSql(): string }) | { toSql(): string };
      model: typeof Base;
    },
  ): StatementCache {
    const relation = callable(new Params());
    const arel = typeof relation.arel === "function" ? relation.arel() : relation.arel;

    const cacheableQuery = connection.cacheableQuery(StatementCache, arel) as [
      Query | PartialQuery,
      unknown[],
    ];
    const queryBuilder = cacheableQuery[0];
    let binds = cacheableQuery[1];

    binds = binds.map((b) => (b instanceof Nodes.BindParam ? b.value : b));
    const bindMap = new BindMap(binds);
    return new StatementCache(queryBuilder, bindMap, relation.model);
  }

  async execute(
    params: unknown[],
    connection: unknown,
    opts: { allowRetry?: boolean } = {},
  ): Promise<InstanceType<typeof Base>[]> {
    try {
      const bindValues = this._bindMap.bind(params);
      const sql = this._queryBuilder.sqlFor(bindValues, connection);
      const allowRetry = opts.allowRetry ?? false;
      if (this._queryBuilder instanceof PartialQuery) {
        return await this._model.findBySql(sql, [], { allowRetry, preparable: true });
      }
      return await this._model.findBySql(sql, bindValues, { allowRetry, preparable: true });
    } catch (e) {
      if (e instanceof ActiveModelRangeError || e instanceof ARRangeError) return [];
      throw e;
    }
  }

  static unsupportedValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return true;
    if (value && typeof value === "object") {
      const name = (value as any).constructor?.name;
      if (name === "Range" || name === "Relation") return true;
      if (value instanceof Map || value instanceof Set) return true;
      if (Object.getPrototypeOf(value) === Object.prototype) return true;
      if ("_attributes" in value) return true;
    }
    return false;
  }
}

function quoteValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  const str = String(value).replace(/'/g, "''");
  return `'${str}'`;
}
