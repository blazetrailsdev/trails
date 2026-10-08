import { ArgumentError } from "@blazetrails/activemodel";
import { type ArelNode } from "@blazetrails/arel";
import {
  any,
  compactBlank,
  first,
  isPlainObject,
  isPresent,
  presence,
  singularize,
  symbolizeKeys,
  wrap,
} from "@blazetrails/activesupport";
import {
  block,
  fetch,
  OpenSSL,
  rbInspect,
  rbObjAsString,
  rtest,
  stringDelete,
  toS,
  valuesAt,
  hasKey,
} from "@blazetrails/ruby-compat";
import { SchemaStatements as AbstractSchemaStatements } from "../abstract/schema-statements.js";
import type { CommentOrChanges } from "../abstract/schema-statements.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
  type ForeignKeyLookupOptions,
  type ColumnOptions,
  type ColumnType,
} from "../abstract/schema-definitions.js";
import { StatementInvalid } from "../../errors.js";
import type { PostgreSQLAdapter } from "../postgresql-adapter.js";
import { Column } from "./column.js";
import { SchemaCreation as PgSchemaCreation } from "./schema-creation.js";
import { SchemaDumper as PgSchemaDumper } from "./schema-dumper.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { TypeMetadata } from "./type-metadata.js";
import { quoteColumnName as pgQuoteColumnName } from "./quoting.js";
import { Name, Utils } from "./utils.js";
import { IndexDefinition } from "../abstract/schema-definitions.js";
import {
  AlterTable as PgAlterTable,
  Table as PgTable,
  TableDefinition as PgTableDefinition,
  type SchemaStatementsConstraintLike,
  ExclusionConstraintDefinition,
  type ExclusionConstraintOptions,
  UniqueConstraintDefinition,
  type UniqueConstraintOptions,
} from "./schema-definitions.js";

export interface CreateDatabaseOptions {
  encoding?: string;
  collation?: string;
  ctype?: string;
  owner?: string;
  template?: string;
  tablespace?: string;
  connectionLimit?: number;
  [key: string]: unknown;
}

interface PgSchemaAdapterPrivates {
  _schemaSearchPathMemo: string | null;
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export interface SchemaStatements
  extends
    PgSchemaAdapterPrivates,
    Pick<
      PostgreSQLAdapter,
      | "clearCacheBang"
      | "extractDefaultFunction"
      | "extractValueFromDefault"
      | "databaseVersion"
      | "getOidType"
      | "internalExecQuery"
      | "internalExecute"
      | "loadAdditionalTypes"
      | "logger"
      | "maxIdentifierLength"
      | "query"
      | "queryValue"
      | "queryValues"
      | "quote"
      | "quoteColumnName"
      | "quoteTableName"
      | "reloadTypeMap"
      | "supportsIdentityColumns"
      | "supportsNativePartitioning"
      | "supportsVirtualColumns"
      | "typeMap"
      | "visitor"
      | "warmMaxIdentifierLength"
    > {}

export class SchemaStatements extends AbstractSchemaStatements {
  async recreateDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<unknown> {
    await this.dropDatabase(name);
    return this.createDatabase(name, options);
  }

  async createDatabase(name: string, options: CreateDatabaseOptions = {}): Promise<unknown> {
    const mergedOptions: CreateDatabaseOptions = { encoding: "utf8", ...options };

    let optionString = "";
    for (const [key, value] of Object.entries(mergedOptions)) {
      switch (key) {
        case "owner":
          optionString += ` OWNER = "${toS(value)}"`;
          break;
        case "template":
          optionString += ` TEMPLATE = "${toS(value)}"`;
          break;
        case "encoding":
          optionString += ` ENCODING = '${toS(value)}'`;
          break;
        case "collation":
          optionString += ` LC_COLLATE = '${toS(value)}'`;
          break;
        case "ctype":
          optionString += ` LC_CTYPE = '${toS(value)}'`;
          break;
        case "tablespace":
          optionString += ` TABLESPACE = "${toS(value)}"`;
          break;
        case "connectionLimit":
          optionString += ` CONNECTION LIMIT = ${toS(value)}`;
          break;
        default:
          break;
      }
    }

    return this.execute(`CREATE DATABASE ${this.quoteTableName(name)}${optionString}`);
  }

  async dropDatabase(name: string): Promise<void> {
    await this.execute(`DROP DATABASE IF EXISTS ${this.quoteTableName(name)}`);
  }

  override async dropTable(
    ...args: Parameters<AbstractSchemaStatements["dropTable"]>
  ): Promise<unknown> {
    const tableNames = args.filter((arg) => typeof arg === "string") as string[];
    const options = (args.find(isPlainObject) ?? {}) as {
      ifExists?: boolean;
      force?: boolean | "cascade";
    };
    for (const tableName of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
    }
    return this.execute(
      `DROP TABLE${options.ifExists ? " IF EXISTS" : ""} ${tableNames.map((tableName) => this.quoteTableName(tableName)).join(", ")}${options.force === "cascade" ? " CASCADE" : ""}`,
    );
  }

  async schemaExists(name: string): Promise<boolean> {
    const count = await this.queryValue(
      `SELECT COUNT(*) FROM pg_namespace WHERE nspname = ${this.quote(name)}`,
      "SCHEMA",
    );
    return Number(count) > 0;
  }

  async indexNameExists(tableName: string, indexName: string): Promise<boolean> {
    const table = this.quotedScope(tableName);
    const index = this.quotedScope(indexName);
    const count = await this.queryValue(
      `
      SELECT COUNT(*)
      FROM pg_class t
      INNER JOIN pg_index d ON t.oid = d.indrelid
      INNER JOIN pg_class i ON d.indexrelid = i.oid
      LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE i.relkind IN ('i', 'I')
        AND i.relname = ${index.name}
        AND t.relname = ${table.name}
        AND n.nspname = ${table.schema}
    `,
      "SCHEMA",
    );
    return Number(count) > 0;
  }

  /**
   * @missingRailsCall order:split,map — CONVERGEABLE pg-schema-statements-reflection-maps-rows-through-an-awaiting-map
   * @missingRailsName gsub — PERMANENT
   */
  async indexes(tableName: string): Promise<IndexDefinition[]> {
    const scope = this.quotedScope(tableName);

    const result = await this.query(
      `SELECT distinct i.relname, d.indisunique, d.indkey, pg_get_indexdef(d.indexrelid), t.oid,
                      pg_catalog.obj_description(i.oid, 'pg_class') AS comment, d.indisvalid
       FROM pg_class t
       INNER JOIN pg_index d ON t.oid = d.indrelid
       INNER JOIN pg_class i ON d.indexrelid = i.oid
       LEFT JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE i.relkind IN ('i', 'I')
         AND d.indisprimary = 'f'
         AND t.relname = ${scope.name}
         AND n.nspname = ${scope.schema}
       ORDER BY i.relname`,
      "SCHEMA",
    );

    const indexes: IndexDefinition[] = [];
    for (const row of result) {
      const indexName = row[0] as string;
      const unique = row[1] as boolean;
      const indkey = toS(row[2])
        .split(/\s+/)
        .filter((n) => n !== "")
        .map((n) => Number(n));
      const inddef = row[3] as string;
      const oid = Number(row[4]);
      const comment = row[5] as string | null;
      const valid = row[6] as boolean;

      const defMatch = inddef.match(
        / USING (\w+?) \((.+?)\)(?: INCLUDE \((.+?)\))?( NULLS NOT DISTINCT)?(?: WHERE (.+))?$/s,
      );
      const using = defMatch?.[1] ?? "";
      const expressions = defMatch?.[2] ?? "";
      const includeStr = defMatch?.[3];
      const nullsNotDistinctStr = defMatch?.[4];
      const whereStr = defMatch?.[5];

      const orders: Record<string, string> = {};
      const opclasses: Record<string, string> = {};
      const includeColumns = includeStr
        ? includeStr.split(",").map((c) => Utils.unquoteIdentifier(c.trim().replace(/""/g, '"')))
        : [];

      let columns: string | string[];
      if (indkey.includes(0)) {
        columns = expressions;
      } else {
        const names = await this.columnNamesFromColumnNumbers(oid, indkey);

        columns = names.filter((c) => !includeColumns.includes(c));

        const COL_RE = /(\w+)"?\s?(\w+_ops(?:_\w+)?)?\s?(DESC)?\s?(NULLS (?:FIRST|LAST))?/g;
        for (const [, column, opclass, desc, nulls] of expressions.matchAll(COL_RE)) {
          if (opclass) opclasses[column] = opclass;
          if (nulls) {
            orders[column] = [desc, nulls].filter(Boolean).join(" ");
          } else if (desc) {
            orders[column] = "desc";
          }
        }
      }

      indexes.push(
        new IndexDefinition(tableName, indexName, unique, columns, {
          orders,
          opclasses,
          where: whereStr,
          using,
          include: presence(includeColumns),
          nullsNotDistinct: isPresent(nullsNotDistinctStr),
          comment: presence(comment) ?? undefined,
          valid,
        }),
      );
    }
    return indexes;
  }

  override async tableOptions(tableName: string): Promise<Record<string, unknown>> {
    const options: Record<string, unknown> = {};
    const comment = await this.tableComment(tableName);
    if (comment !== null) options.comment = comment;
    const inherited = await this.inheritedTableNames(tableName);
    if (inherited.length > 0) {
      options.options = `INHERITS (${inherited.join(", ")})`;
    }
    if (!options.options && (await this.supportsNativePartitioning())) {
      const partDef = await this.tablePartitionDefinition(tableName);
      if (partDef) options.options = `PARTITION BY ${partDef}`;
    }
    return options;
  }

  override async tableComment(tableName: string): Promise<string | null> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    if (!scope.name) return null;
    const comment = await this.queryValue(
      `
      SELECT pg_catalog.obj_description(c.oid, 'pg_class')
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${scope.name}
        AND c.relkind IN (${scope.type})
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
    );
    return (comment as string | null) ?? null;
  }

  async tablePartitionDefinition(tableName: string): Promise<string | null> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    const def = await this.queryValue(
      `SELECT pg_catalog.pg_get_partkeydef(c.oid)
       FROM pg_catalog.pg_class c
       LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = ${scope.name}
         AND c.relkind IN (${scope.type})
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
    );
    return (def as string | null) ?? null;
  }

  async inheritedTableNames(tableName: string): Promise<string[]> {
    const scope = this.quotedScope(tableName, { type: "BASE TABLE" });
    const names = await this.queryValues(
      `SELECT parent.relname
       FROM pg_catalog.pg_inherits i
       JOIN pg_catalog.pg_class child ON i.inhrelid = child.oid
       JOIN pg_catalog.pg_class parent ON i.inhparent = parent.oid
       LEFT JOIN pg_namespace n ON n.oid = child.relnamespace
       WHERE child.relname = ${scope.name}
         AND child.relkind IN (${scope.type})
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
    );
    return names as string[];
  }

  async currentDatabase(): Promise<string> {
    return (await this.queryValue("SELECT current_database()", "SCHEMA")) as string;
  }

  async currentSchema(): Promise<string> {
    return (await this.queryValue("SELECT current_schema", "SCHEMA")) as string;
  }

  async encoding(): Promise<string> {
    return (await this.queryValue(
      "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async collation(): Promise<string> {
    return (await this.queryValue(
      "SELECT datcollate FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async ctype(): Promise<string> {
    return (await this.queryValue(
      "SELECT datctype FROM pg_database WHERE datname = current_database()",
      "SCHEMA",
    )) as string;
  }

  async schemaNames(): Promise<string[]> {
    const names = await this.queryValues(
      `SELECT nspname
  FROM pg_namespace
 WHERE nspname !~ '^pg_.*'
   AND nspname NOT IN ('information_schema')
 ORDER by nspname;
`,
      "SCHEMA",
    );
    return names as string[];
  }

  async createSchema(
    schemaName: string,
    options: { force?: boolean; ifNotExists?: boolean } = {},
  ): Promise<void> {
    if (options.force && options.ifNotExists) {
      throw new ArgumentError(
        "Options `:force` and `:if_not_exists` cannot be used simultaneously.",
      );
    }
    if (options.force) {
      await this.dropSchema(schemaName, { ifExists: true });
    }
    const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
    await this.execute(`CREATE SCHEMA${ifNotExists} ${this.quoteSchemaName(schemaName)}`);
  }

  async dropSchema(schemaName: string, options: { ifExists?: boolean } = {}): Promise<void> {
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    await this.execute(`DROP SCHEMA${ifExists} ${this.quoteSchemaName(schemaName)} CASCADE`);
  }

  async setSchemaSearchPath(searchPath: string | null): Promise<void> {
    if (!searchPath) return;
    await this.internalExecute(`SET search_path TO ${searchPath}`);
    this._schemaSearchPathMemo = searchPath;
  }

  async schemaSearchPath(): Promise<string> {
    return (this._schemaSearchPathMemo ||= (await this.queryValue(
      "SHOW search_path",
      "SCHEMA",
    )) as string);
  }

  async clientMinMessages(): Promise<string> {
    return (await this.queryValue("SHOW client_min_messages", "SCHEMA")) as string;
  }

  async setClientMinMessages(level: string): Promise<void> {
    await this.internalExecute(`SET client_min_messages TO '${level}'`, "SCHEMA");
  }

  private quoteSchemaName(name: string): string {
    return pgQuoteColumnName(name);
  }

  async defaultSequenceName(
    tableName: string,
    pk: string | string[] | null = "id",
  ): Promise<string | null> {
    if (Array.isArray(pk)) return null;
    try {
      const result = await this.serialSequence(tableName, pk);
      if (!result) return null;
      return Utils.extractSchemaQualifiedName(result).toString();
    } catch (error) {
      if (!(error instanceof StatementInvalid)) throw error;
      return new Name(null, `${tableName}_${pk}_seq`).toString();
    }
  }

  async serialSequence(table: string, column: string | null): Promise<string | null> {
    return ((await this.queryValue(
      `SELECT pg_get_serial_sequence(${this.quote(table)}, ${this.quote(column)})`,
      "SCHEMA",
    )) ?? null) as string | null;
  }

  async setPkSequenceBang(table: string, value: number): Promise<void> {
    const result = await this.pkAndSequenceFor(table);
    const [pk, sequence] = result ?? [null, null];
    if (pk) {
      if (sequence) {
        const quotedSequence = this.quoteTableName(sequence);
        await this.queryValue(`SELECT setval(${this.quote(quotedSequence)}, ${value})`, "SCHEMA");
      } else {
        if (this.logger != null) {
          (this.logger as { warn(message: string): void }).warn(
            `${table} has primary key ${pk} with no default sequence.`,
          );
        }
      }
    }
  }

  async resetPkSequenceBang(
    table: string,
    pk: string | null = null,
    sequence: Name | string | null = null,
  ): Promise<void> {
    if (!pk || !sequence) {
      const [defaultPk, defaultSeq] = (await this.pkAndSequenceFor(table)) ?? [null, null];
      pk = pk ?? defaultPk;
      sequence = sequence ?? defaultSeq ?? null;
    }

    if (pk && !sequence) {
      (this.logger as { warn?(message: string): void } | null)?.warn?.(
        `${table} has primary key ${pk} with no default sequence.`,
      );
    }

    if (!pk || !sequence) return;

    const quotedSequence = this.quoteTableName(sequence);
    const maxPk = await this.queryValue(
      `SELECT MAX(${this.quoteColumnName(pk)}) FROM ${this.quoteTableName(table)}`,
      "SCHEMA",
    );
    let minvalue: unknown = null;
    if (maxPk == null) {
      const dbVersion = await this.databaseVersion;
      minvalue =
        dbVersion >= 100000
          ? await this.queryValue(
              `SELECT seqmin FROM pg_sequence WHERE seqrelid = ${this.quote(quotedSequence)}::regclass`,
              "SCHEMA",
            )
          : await this.queryValue(`SELECT min_value FROM ${quotedSequence}`, "SCHEMA");
    }

    await this.queryValue(
      `SELECT setval(${this.quote(quotedSequence)}, ${maxPk ?? minvalue}, ${maxPk == null ? "false" : "true"})`,
      "SCHEMA",
    );
  }

  async pkAndSequenceFor(table: string): Promise<[string, Name | null] | null> {
    try {
      const quotedTable = this.quote(this.quoteTableName(table));

      let result = (
        await this.query(
          `SELECT attr.attname, nsp.nspname, seq.relname
           FROM pg_class      seq,
                pg_attribute  attr,
                pg_depend     dep,
                pg_constraint cons,
                pg_namespace  nsp
           WHERE seq.oid           = dep.objid
             AND seq.relkind       = 'S'
             AND attr.attrelid     = dep.refobjid
             AND attr.attnum       = dep.refobjsubid
             AND attr.attrelid     = cons.conrelid
             AND attr.attnum       = cons.conkey[1]
             AND seq.relnamespace  = nsp.oid
             AND cons.contype      = 'p'
             AND dep.classid       = 'pg_class'::regclass
             AND dep.refobjid      = ${quotedTable}::regclass`,
          "SCHEMA",
        )
      )[0];

      if (result == null || result.length === 0) {
        result = (
          await this.query(
            `SELECT attr.attname, nsp.nspname,
               CASE
                 WHEN pg_get_expr(def.adbin, def.adrelid) !~* 'nextval' THEN NULL
                 WHEN split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2) ~ '.' THEN
                   substr(split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2),
                          strpos(split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2), '.')+1)
                 ELSE split_part(pg_get_expr(def.adbin, def.adrelid), '''', 2)
               END
             FROM pg_class       t
             JOIN pg_attribute   attr ON (t.oid = attrelid)
             JOIN pg_attrdef     def  ON (adrelid = attrelid AND adnum = attnum)
             JOIN pg_constraint  cons ON (conrelid = adrelid AND adnum = conkey[1])
             JOIN pg_namespace   nsp  ON (t.relnamespace = nsp.oid)
             WHERE t.oid = ${quotedTable}::regclass
               AND cons.contype = 'p'
               AND pg_get_expr(def.adbin, def.adrelid) ~* 'nextval|uuid_generate|gen_random_uuid'`,
            "SCHEMA",
          )
        )[0];
      }

      const [pk, schema, identifier] = result as unknown as [string, string | null, string | null];
      if (identifier != null) {
        return [pk, new Name(schema, identifier)];
      }
      return [pk, null];
    } catch {
      return null;
    }
  }

  async primaryKeys(tableName: string): Promise<string[]> {
    const names = await this.queryValues(
      `SELECT a.attname
       FROM (
         SELECT indrelid, indkey, generate_subscripts(indkey, 1) idx
           FROM pg_index
          WHERE indrelid = ${this.quote(this.quoteTableName(tableName))}::regclass
            AND indisprimary
       ) i
       JOIN pg_attribute a
         ON a.attrelid = i.indrelid
        AND a.attnum = i.indkey[i.idx]
       ORDER BY i.idx`,
      "SCHEMA",
    );
    return names as string[];
  }

  async renameTable(
    tableName: string,
    newName: string,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    if (options._usesLegacyTableName == null || options._usesLegacyTableName === false) {
      this.validateTableLengthBang(newName);
    }
    await this.clearCacheBang();
    await this.schemaCache.clearDataSourceCacheBang(tableName);
    await this.schemaCache.clearDataSourceCacheBang(newName);
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
    const maxIdentifierLength = await this.warmMaxIdentifierLength();
    const [pk, seq] = (await this.pkAndSequenceFor(newName)) ?? [];
    if (pk != null) {
      const maxPkeyPrefix = maxIdentifierLength - "_pkey".length;
      const idx = `${tableName.slice(0, maxPkeyPrefix)}_pkey`;
      const newIdx = `${newName.slice(0, maxPkeyPrefix)}_pkey`;
      await this.execute(
        `ALTER INDEX ${this.quoteTableName(idx)} RENAME TO ${this.quoteTableName(newIdx)}`,
      );

      const maxSeqPrefix = maxIdentifierLength - `_${pk}_seq`.length;
      if (seq && seq.identifier === `${tableName.slice(0, maxSeqPrefix)}_${pk}_seq`) {
        const newSeq = `${newName.slice(0, maxSeqPrefix)}_${pk}_seq`;
        await this.execute(`ALTER TABLE ${seq.quoted()} RENAME TO ${this.quoteTableName(newSeq)}`);
      }
    }
    await this.renameTableIndexes(tableName, newName, options);
  }

  /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

  override async addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & {
      comment?: string | null;
      ifNotExists?: boolean;
    } = {},
  ): Promise<unknown> {
    await this.clearCacheBang();
    await super.addColumn(tableName, columnName, type, options);
    if ("comment" in options) {
      return this.changeColumnComment(tableName, columnName, options.comment ?? null);
    }
  }

  override async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<void> {
    await this.clearCacheBang();
    const parts = await this.changeColumnForAlter(tableName, columnName, type, options);
    const sqls = parts.filter((v): v is string => typeof v === "string");
    const procs = parts.filter((v): v is () => Promise<void> => typeof v === "function");
    await this.execute(`ALTER TABLE ${this.quoteTableName(tableName)} ${sqls.join(", ")}`);
    for (const proc of procs) await proc();
  }

  buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): ChangeColumnDefinition {
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(columnName, type, options);
    return new ChangeColumnDefinition(cd, columnName);
  }

  override async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${await this.changeColumnDefaultForAlter(tableName, columnName, defaultOrChanges)}`,
    );
  }

  override async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition | undefined> {
    const column = await this.columnFor(tableName, columnName);
    if (column == null) return;

    const default_ = this.extractNewDefaultValue(defaultOrChanges);
    return new ChangeColumnDefaultDefinition(column, default_);
  }

  override async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_: unknown = null,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(null_);

    await this.clearCacheBang();
    if (!(null_ || default_ == null)) {
      const column = await this.columnFor(tableName, columnName);
      if (column)
        await this.execute(
          `UPDATE ${this.quoteTableName(tableName)} SET ${this.quoteColumnName(columnName)}=${await this.quoteDefaultExpression(default_, column)} WHERE ${this.quoteColumnName(columnName)} IS NULL`,
        );
    }
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ALTER COLUMN ${this.quoteColumnName(columnName)} ${null_ ? "DROP" : "SET"} NOT NULL`,
    );
  }

  override async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    await this.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges);
    await this.execute(
      `COMMENT ON COLUMN ${this.quoteTableName(tableName)}.${this.quoteColumnName(columnName)} IS ${this.quote(comment)}`,
    );
  }

  override async changeTableComment(
    tableName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    await this.clearCacheBang();
    const comment = this.extractNewCommentValue(commentOrChanges);
    await this.execute(
      `COMMENT ON TABLE ${this.quoteTableName(tableName)} IS ${this.quote(comment)}`,
    );
  }

  override async renameColumn(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<void> {
    await this.clearCacheBang();
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} ${this.renameColumnSql(tableName, columnName, newColumnName)}`,
    );
    await this.renameColumnIndexes(tableName, columnName, newColumnName);
  }

  async addIndex(
    tableName: string,
    columnName: string | string[],
    options: {
      name?: string;
      unique?: boolean;
      using?: string;
      where?: string;
      algorithm?: string;
      order?: Record<string, string> | string;
      opclass?: Record<string, string>;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      include?: string | string[];
      comment?: string;
    } = {},
  ): Promise<unknown> {
    const createIndex = await this.buildCreateIndexDefinition(tableName, columnName, options);
    const result = await this.execute(await this.schemaCreation.accept(createIndex));

    const index = createIndex.index;
    if (index.comment) {
      await this.execute(
        `COMMENT ON INDEX ${this.quoteColumnName(index.name)} IS ${this.quote(index.comment)}`,
      );
    }
    return result;
  }

  override async buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: Parameters<AbstractSchemaStatements["buildCreateIndexDefinition"]>[2] = {},
  ): Promise<CreateIndexDefinition> {
    const [index, algorithm, ifNotExists] = await this.addIndexOptions(
      tableName,
      columnName,
      options,
    );
    return new CreateIndexDefinition(index, algorithm, ifNotExists);
  }

  async removeIndex(
    tableName: string,
    columnName?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; algorithm?: string; ifExists?: boolean },
    options: {
      name?: string;
      column?: string | string[];
      algorithm?: string;
      ifExists?: boolean;
    } = {},
  ): Promise<unknown> {
    if (!(typeof columnName === "string" || Array.isArray(columnName))) {
      options = { ...columnName, ...options };
      columnName = undefined;
    }

    let table = Utils.extractSchemaQualifiedName(tableName);
    if (options.name != null) {
      const providedIndex = Utils.extractSchemaQualifiedName(options.name);
      options = { ...options, name: providedIndex.identifier };
      if (!isPresent(table.schema)) table = new Name(providedIndex.schema, table.identifier);

      if (isPresent(providedIndex.schema) && table.schema !== providedIndex.schema) {
        throw new ArgumentError(
          `Index schema '${providedIndex.schema}' does not match table schema '${table.schema}'`,
        );
      }
    }

    if (options.ifExists && !(await this.indexExists(tableName, columnName, options))) {
      return;
    }

    const indexToRemove = new Name(
      table.schema,
      await this.indexNameForRemove(table.toString(), columnName, options),
    ).toString();

    return this.execute(
      `DROP INDEX ${this.indexAlgorithm(options.algorithm) ?? ""} ${this.quoteTableName(indexToRemove)}`,
    );
  }

  override async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    this.validateIndexLengthBang(tableName, newName);

    const [schema] = this.extractSchemaQualifiedName(tableName);
    await this.execute(
      `ALTER INDEX ${schema ? `${this.quoteTableName(schema)}.` : ""}${this.quoteColumnName(oldName)} RENAME TO ${this.quoteTableName(newName)}`,
    );
  }

  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string {
    const [, table] = this.extractSchemaQualifiedName(String(tableName));
    return super.indexName(table, options);
  }

  override async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    this.assertValidDeferrable(options.deferrable);
    await super.addForeignKey(fromTable, toTable, options);
  }

  /** @missingRailsCall order:unquoteIdentifier,map — CONVERGEABLE pg-schema-statements-reflection-maps-rows-through-an-awaiting-map */
  override async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const scope = this.quotedScope(tableName);
    const fkInfo = await this.internalExecQuery(
      `
      SELECT t2.oid::regclass::text AS to_table, a1.attname AS column, a2.attname AS primary_key,
             c.conname AS name, c.confupdtype AS on_update, c.confdeltype AS on_delete,
             c.convalidated AS valid, c.condeferrable AS deferrable, c.condeferred AS deferred,
             c.conkey, c.confkey, c.conrelid, c.confrelid
      FROM pg_constraint c
      JOIN pg_class t1 ON c.conrelid = t1.oid
      JOIN pg_class t2 ON c.confrelid = t2.oid
      JOIN pg_attribute a1 ON a1.attnum = c.conkey[1] AND a1.attrelid = t1.oid
      JOIN pg_attribute a2 ON a2.attnum = c.confkey[1] AND a2.attrelid = t2.oid
      JOIN pg_namespace t3 ON c.connamespace = t3.oid
      WHERE c.contype = 'f'
        AND t1.relname = ${scope.name}
        AND t3.nspname = ${scope.schema}
      ORDER BY c.conname
    `,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    const foreignKeys: ForeignKeyDefinition[] = [];
    for (const row of fkInfo.toArray()) {
      const toTable = Utils.unquoteIdentifier(row.to_table as string);
      const conkey = String(row.conkey).replace(/[{}]/g, "").split(",").map(Number);
      const confkey = String(row.confkey).replace(/[{}]/g, "").split(",").map(Number);
      let column: string | string[];
      let primaryKey: string | string[];
      if (conkey.length > 1) {
        column = await this.columnNamesFromColumnNumbers(Number(row.conrelid), conkey);
        primaryKey = await this.columnNamesFromColumnNumbers(Number(row.confrelid), confkey);
      } else {
        column = Utils.unquoteIdentifier(row.column as string);
        primaryKey = row.primary_key as string;
      }
      const options: Partial<AddForeignKeyOptions> = {
        column,
        name: row.name as string,
        primaryKey,
      };

      options.onDelete = this.extractForeignKeyAction(row.on_delete as string);
      options.onUpdate = this.extractForeignKeyAction(row.on_update as string);
      options.deferrable = this.extractConstraintDeferrable(
        row.deferrable as boolean,
        row.deferred as boolean,
      );

      options.validate = row.valid as boolean;

      foreignKeys.push(new ForeignKeyDefinition(tableName, toTable, options));
    }
    return foreignKeys;
  }

  async foreignTables(): Promise<string[]> {
    const names = await this.queryValues(
      this.dataSourceSql(undefined, { type: "FOREIGN TABLE" }),
      "SCHEMA",
    );
    return names as string[];
  }

  async foreignTableExists(tableName: string): Promise<boolean | undefined> {
    if (isPresent(tableName)) {
      return any(
        await this.queryValues(this.dataSourceSql(tableName, { type: "FOREIGN TABLE" }), "SCHEMA"),
      );
    }
  }

  override async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const checkInfo = await this.internalExecQuery(
      `SELECT conname, pg_get_constraintdef(c.oid, true) AS constraintdef, c.convalidated AS valid
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c'
         AND t.relname = ${scope.name}
         AND n.nspname = ${scope.schema}`,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    return checkInfo.toArray().map((row) => {
      const options = {
        name: row.conname as string,
        validate: row.valid as boolean,
      };
      const expression = (row.constraintdef as string).match(/CHECK \((.+)\)/s)?.[1] ?? "";

      return new CheckConstraintDefinition(tableName, expression, options);
    });
  }

  async exclusionConstraints(tableName: string): Promise<ExclusionConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const exclusionInfo = await this.internalExecQuery(
      `
      SELECT conname, pg_get_constraintdef(c.oid) AS constraintdef, c.condeferrable, c.condeferred
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'x'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
    );
    return exclusionInfo.toArray().map((row) => {
      const r = row;
      const [methodAndElements, ...rest] = (r.constraintdef as string).split(" WHERE ");
      let predicate: string | undefined = rest.length > 0 ? rest.join(" WHERE ") : undefined;
      if (predicate != null) {
        predicate = predicate.replace(/ DEFERRABLE(?: INITIALLY (?:IMMEDIATE|DEFERRED))?/, "");
        predicate = predicate.slice(2, -2);
      }
      const parts = methodAndElements.match(/EXCLUDE(?:\s+USING\s+(\S+))?\s+\((.+)\)/s);
      const using = parts?.[1];
      const expression = parts?.[2] ?? "";
      const deferrable = this.extractConstraintDeferrable(
        r.condeferrable as boolean,
        r.condeferred as boolean,
      );
      return new ExclusionConstraintDefinition(tableName, expression, {
        name: r.conname as string,
        using: using,
        where: predicate,
        deferrable,
      });
    });
  }

  /** @missingRailsCall order:split,map — CONVERGEABLE pg-schema-statements-reflection-maps-rows-through-an-awaiting-map */
  async uniqueConstraints(tableName: string): Promise<UniqueConstraintDefinition[]> {
    const scope = this.quotedScope(tableName);
    const uniqueInfo = await this.internalExecQuery(
      `
      SELECT c.conname, c.conrelid, c.conkey, c.condeferrable, c.condeferred,
             pg_get_constraintdef(c.oid) AS constraintdef
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'u'
        AND t.relname = ${scope.name}
        AND n.nspname = ${scope.schema}
    `,
      "SCHEMA",
      [],
      { allowRetry: true, materializeTransactions: false },
    );
    const uniqueConstraints: UniqueConstraintDefinition[] = [];
    for (const row of uniqueInfo.toArray()) {
      const r = row;
      const conkey = stringDelete(String(r.conkey), "{}").split(",").map(Number);
      const columns = await this.columnNamesFromColumnNumbers(Number(r.conrelid), conkey);
      const nullsNotDistinct = (r.constraintdef as string).startsWith("UNIQUE NULLS NOT DISTINCT");
      const deferrable = this.extractConstraintDeferrable(
        r.condeferrable as boolean,
        r.condeferred as boolean,
      );
      uniqueConstraints.push(
        new UniqueConstraintDefinition(tableName, columns, {
          name: r.conname as string,
          nullsNotDistinct: nullsNotDistinct || undefined,
          deferrable,
        }),
      );
    }
    return uniqueConstraints;
  }

  async addExclusionConstraint(
    tableName: string,
    expression: string,
    options: ExclusionConstraintOptions = {},
  ): Promise<void> {
    options = this.exclusionConstraintOptions(tableName, expression, options);
    const at = this.createAlterTable(tableName);
    at.addExclusionConstraint(expression, options);
    await this.execute(await this.schemaCreation.accept(at));
  }

  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);

    options = { ...options };
    options.name ||= this.exclusionConstraintName(tableName, { expression, ...options });
    return options;
  }

  async removeExclusionConstraint(
    tableName: string,
    expression: string | Record<string, unknown> | null = null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    if (typeof expression === "object" && expression !== null) {
      options = expression;
      expression = null;
    }
    const exclNameToDelete = (
      await this.exclusionConstraintForBang(tableName, { expression, ...options })
    ).name;

    await this.removeConstraint(tableName, exclNameToDelete);
  }

  async addUniqueConstraint(
    tableName: string,
    columnName?: string | string[] | null,
    options: UniqueConstraintOptions = {},
  ): Promise<void> {
    options = this.uniqueConstraintOptions(tableName, columnName, options);
    const at = this.createAlterTable(tableName);
    at.addUniqueConstraint(columnName as string | string[], options);
    await this.execute(await this.schemaCreation.accept(at));
  }

  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: Record<string, unknown>,
  ): Record<string, unknown> {
    this.assertValidDeferrable(options.deferrable);
    if (columnName && options.usingIndex) {
      throw new ArgumentError("Cannot specify both column_name and :using_index options.");
    }

    options = { ...options };
    options.name ||= this.uniqueConstraintName(tableName, { column: columnName, ...options });
    return options;
  }

  async removeUniqueConstraint(
    tableName: string,
    columnName: string | string[] | Record<string, unknown> | null = null,
    options: Record<string, unknown> = {},
  ): Promise<void> {
    if (typeof columnName === "object" && columnName !== null && !Array.isArray(columnName)) {
      options = columnName;
      columnName = null;
    }
    const uniqueNameToDelete = (
      await this.uniqueConstraintForBang(tableName, { column: columnName, ...options })
    ).name;

    await this.removeConstraint(tableName, uniqueNameToDelete);
  }

  override typeToSql(
    type: string,
    options: {
      limit?: number;
      precision?: number;
      scale?: number;
      array?: boolean;
      enumType?: string;
    } = {},
  ): string {
    const { limit, array, enumType } = options;
    let sql: string;
    switch (String(type ?? "")) {
      case "binary":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new ArgumentError(
            `No binary type has byte size ${limit}. The limit on binary can be at most 1GB - 1byte.`,
          );
        }
        sql = super.typeToSql(type as ColumnType, {});
        break;
      case "text":
        if (limit != null && (limit < 0 || limit > 0x3fffffff)) {
          throw new ArgumentError(
            `No text type has byte size ${limit}. The limit on text can be at most 1GB - 1byte.`,
          );
        }
        sql = super.typeToSql(type as ColumnType, {});
        break;
      case "integer":
        if (limit === 1 || limit === 2) sql = "smallint";
        else if (limit == null || (limit >= 3 && limit <= 4)) sql = "integer";
        else if (limit >= 5 && limit <= 8) sql = "bigint";
        else
          throw new ArgumentError(
            `No integer type has byte size ${limit}. Use a numeric with scale 0 instead.`,
          );
        break;
      case "enum":
        if (enumType == null) throw new ArgumentError("enum_type is required for enums");
        sql = enumType;
        break;
      default:
        sql = super.typeToSql(type as ColumnType, options);
    }
    return array && type !== "primary_key" ? `${sql}[]` : sql;
  }

  override columnsForDistinct(columns: string | string[], orders?: (string | ArelNode)[]): string {
    const visitor = this.visitor;
    const orderColumns = compactBlank(
      compactBlank(orders ?? []).map((s) => {
        s = typeof s === "string" ? s : visitor.compile(s);
        return s.replace(/\s+(?:ASC|DESC)\b/gi, "").replace(/\s+NULLS\s+(?:FIRST|LAST)\b/gi, "");
      }),
    ).map((column, i) => `${column} AS alias_${i}`);

    return [...orderColumns, super.columnsForDistinct(columns, orders as string[])]
      .flat(Infinity)
      .join(", ");
  }

  override updateTableDefinition(tableName: string, base?: unknown): PgTable {
    return new PgTable(tableName, (base ?? this) as SchemaStatementsConstraintLike);
  }

  createSchemaDumper(options: Record<string, unknown>): PgSchemaDumper {
    return PgSchemaDumper.create(
      this as unknown as Parameters<typeof PgSchemaDumper.create>[0],
      options,
    );
  }

  async validateConstraint(tableName: string, constraintName: string | undefined): Promise<void> {
    const at = this.createAlterTable(tableName);
    at.validateConstraint(constraintName);
    await this.execute(await this.schemaCreation.accept(at));
  }

  async validateForeignKey(
    fromTable: string,
    toTable?: string,
    options: ForeignKeyLookupOptions = {},
  ): Promise<void> {
    const fkNameToValidate = (await this.foreignKeyForBang(fromTable, { ...options, toTable }))
      .name;
    await this.validateConstraint(fromTable, fkNameToValidate);
  }

  /** @inventedArm if — CONVERGEABLE pg-schema-dumper-option-hash-and-constraint-lookup-residual-arms */
  async validateCheckConstraint(
    tableName: string,
    options: string | { name: string; expression?: string },
  ): Promise<void> {
    const opts = typeof options === "string" ? { name: options } : options;
    const chkNameToValidate = (await this.checkConstraintForBang(tableName, opts)).name;
    await this.validateConstraint(tableName, chkNameToValidate);
  }

  override foreignKeyColumnFor(tableName: string, columnName = "id"): string {
    const [, table] = this.extractSchemaQualifiedName(tableName);
    return `${singularize(table)}_${columnName}`;
  }

  async addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options: Parameters<AbstractSchemaStatements["addIndexOptions"]>[2] = {},
  ): Promise<[IndexDefinition, string | undefined, boolean]> {
    options = { ...options };
    const where = options.where;
    if (
      typeof where === "string" &&
      (await this.tableExists(tableName)) &&
      (await this.columnExists(tableName, where))
    ) {
      options.where = this.quoteColumnName(where);
    }
    return super.addIndexOptions(tableName, columnName, options);
  }

  async quotedIncludeColumnsForIndex(columnNames: string | string[]): Promise<string> {
    if (typeof columnNames === "string") return this.quoteColumnName(columnNames);

    const quotedColumns = new Map<string, string>();
    for (const name of columnNames) {
      quotedColumns.set(name, this.quoteColumnName(name));
    }
    return Array.from((await this.addOptionsForIndexColumns(quotedColumns)).values()).join(", ");
  }

  get schemaCreation(): PgSchemaCreation {
    return new PgSchemaCreation(
      this as unknown as ConstructorParameters<typeof PgSchemaCreation>[0],
    );
  }

  /** @internal */
  createTableDefinition(name: string, options: Record<string, unknown> = {}): PgTableDefinition {
    return new PgTableDefinition(this, name, options);
  }

  /** @internal */
  createAlterTable(name: string): PgAlterTable {
    return new PgAlterTable(this.createTableDefinition(name));
  }

  /** @internal */
  async newColumnFromField(
    tableName: string,
    field: unknown[],
    _definitions: unknown,
  ): Promise<Column> {
    const [columnName, type, default_, notnull, oid, fmod, collation, comment, identity, gen] =
      field as [
        string,
        string,
        string | null,
        boolean,
        number,
        number,
        string | null,
        string | null,
        string | null,
        string | null,
      ];
    const typeMetadata = await this.fetchTypeMetadata(columnName, type, Number(oid), Number(fmod));
    const defaultValue = this.extractValueFromDefault(default_);

    let defaultFunction: string | null;
    if (gen) {
      defaultFunction = default_;
    } else {
      defaultFunction = this.extractDefaultFunction(defaultValue, default_);
    }

    let serial: boolean | undefined;
    const match = defaultFunction?.match(SERIAL_SEQUENCE_RE);
    if (match) {
      const { sequenceName, suffix } = match.groups!;
      serial = this.sequenceNameFromParts(tableName, columnName, suffix) === sequenceName;
    }

    return Column.new(columnName, defaultValue, typeMetadata, !notnull, {
      defaultFunction: defaultFunction ?? undefined,
      collation: collation ?? undefined,
      comment: comment || null,
      serial,
      identity: identity || null,
      generated: gen,
    });
  }

  /** @internal */
  override async fetchTypeMetadata(
    columnName: string,
    sqlType: string,
    oid: number,
    fmod: number,
  ): Promise<TypeMetadata> {
    const castType = await this.getOidType(oid, fmod, columnName, sqlType);
    const simpleType = SqlTypeMetadata.new({
      sqlType,
      type: castType.type(),
      limit: castType.limit ?? null,
      precision: castType.precision ?? null,
      scale: castType.scale ?? null,
    });
    return TypeMetadata.new(simpleType, { oid, fmod });
  }

  /** @internal */
  sequenceNameFromParts(tableName: string, columnName: string, suffix: string): string {
    const maxIdentifierLength = this.maxIdentifierLength();
    let overLength = tableName.length + columnName.length + suffix.length + 2 - maxIdentifierLength;

    if (overLength > 0) {
      const columnNameLength = Math.min(
        Math.floor((maxIdentifierLength - suffix.length - 2) / 2),
        columnName.length,
      );
      overLength -= columnName.length - columnNameLength;
      columnName = columnName.slice(0, columnNameLength - Math.min(overLength, 0));
    }

    if (overLength > 0) {
      tableName = tableName.slice(0, tableName.length - overLength);
    }

    return `${tableName}_${columnName}_${suffix}`;
  }

  /** @internal */
  override extractForeignKeyAction(
    specifier: string,
  ): "cascade" | "nullify" | "restrict" | undefined {
    switch (specifier) {
      case "c":
        return "cascade";
      case "n":
        return "nullify";
      case "r":
        return "restrict";
      default:
        return undefined;
    }
  }

  /** @internal */
  assertValidDeferrable(deferrable: unknown): void {
    if (
      deferrable == null ||
      deferrable === false ||
      deferrable === "immediate" ||
      deferrable === "deferred"
    )
      return;
    throw new ArgumentError(
      `deferrable must be \`:immediate\` or \`:deferred\`, got: \`${rbInspect(deferrable)}\``,
    );
  }

  /** @internal */
  extractConstraintDeferrable(
    deferrable: boolean,
    deferred: boolean,
  ): "deferred" | "immediate" | false {
    return deferrable && (deferred ? "deferred" : "immediate");
  }

  /** @internal */
  referenceNameForTable(tableName: string): string {
    const [, table] = this.extractSchemaQualifiedName(tableName);
    return singularize(table);
  }

  /** @internal */
  async addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): Promise<string | [string, () => Promise<void>]> {
    if (!("comment" in options)) {
      return super.addColumnForAlter(tableName, columnName, type, options);
    }
    return [
      (await super.addColumnForAlter(tableName, columnName, type, options)) as string,
      () => this.changeColumnComment(tableName, columnName, options.comment ?? null),
    ];
  }

  /** @internal */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options: ColumnOptions & { using?: string; castAs?: string } = {},
  ): Promise<Array<string | (() => Promise<void>)>> {
    const changeColDef = this.buildChangeColumnDefinition(tableName, columnName, type, options);
    const sqls: Array<string | (() => Promise<void>)> = [
      await this.schemaCreation.accept(changeColDef),
    ];
    if ("comment" in options)
      sqls.push(() => this.changeColumnComment(tableName, columnName, options.comment ?? null));
    return sqls;
  }

  /** @internal */
  changeColumnNullForAlter(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): unknown {
    if (default_ == null)
      return `ALTER COLUMN ${this.quoteColumnName(columnName)} ${null_ ? "DROP" : "SET"} NOT NULL`;
    return () => this.changeColumnNull(tableName, columnName, null_, default_);
  }

  /** @internal */
  addIndexOpclass(
    quotedColumns: Map<string, string>,
    options: { opclass?: string | Record<string, string> } = {},
  ): Map<string, string> {
    const opclasses = this.optionsForIndexColumns(options.opclass);
    for (const [name] of quotedColumns) {
      const opclass = opclasses(name);
      if (isPresent(opclass)) quotedColumns.set(name, `${quotedColumns.get(name)} ${opclass}`);
    }
    return quotedColumns;
  }

  /** @internal */
  async addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    } = {},
  ): Promise<Map<string, string>> {
    quotedColumns = this.addIndexOpclass(quotedColumns, options);
    return super.addOptionsForIndexColumns(quotedColumns, options);
  }

  /** @internal */
  exclusionConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    return fetch<string>(
      options as Record<string, string>,
      "name",
      block(() => {
        const expression = fetch<unknown>(symbolizeKeys(options), ":expression");
        const identifier = `${tableName}_${toS(expression)}_excl`;
        const hashedIdentifier = first(OpenSSL.Digest.SHA256.hexdigest(identifier), 10);

        return `excl_rails_${hashedIdentifier}`;
      }),
    );
  }

  /** @internal */
  async exclusionConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<ExclusionConstraintDefinition | undefined> {
    const exclName = this.exclusionConstraintName(tableName, options);
    return (await this.exclusionConstraints(tableName)).find((excl) => excl.name === exclName);
  }

  /** @internal */
  async exclusionConstraintForBang(
    tableName: string,
    { expression = null, ...options }: Record<string, unknown>,
  ): Promise<ExclusionConstraintDefinition> {
    const excl = await this.exclusionConstraintFor(tableName, { expression, ...options });
    if (!rtest(excl)) {
      throw new ArgumentError(
        `Table '${tableName}' has no exclusion constraint for ${rbObjAsString(rtest(expression) ? expression : symbolizeKeys(options))}`,
      );
    }
    return excl;
  }

  /** @internal */
  uniqueConstraintName(tableName: string, options: Record<string, unknown> = {}): string {
    return fetch<string>(
      options as Record<string, string>,
      "name",
      block(() => {
        const columnOrIndex = wrap(options.column || options.usingIndex).map(toS);
        const identifier = `${tableName}_${columnOrIndex.join("_and_")}_unique`;
        const hashedIdentifier = first(OpenSSL.Digest.SHA256.hexdigest(identifier), 10);

        return `uniq_rails_${hashedIdentifier}`;
      }),
    );
  }

  /** @internal */
  async uniqueConstraintFor(
    tableName: string,
    options: Record<string, unknown> = {},
  ): Promise<UniqueConstraintDefinition | undefined> {
    const name = hasKey(options, "column")
      ? undefined
      : this.uniqueConstraintName(tableName, options);
    const constraints = await this.uniqueConstraints(tableName);
    return constraints.find((c) =>
      c.definedFor({ ...options, name: name ?? (options.name as string | undefined) }),
    );
  }

  /**
   * @internal
   * @inventedArm if — CONVERGEABLE pg-schema-dumper-option-hash-and-constraint-lookup-residual-arms
   */
  async uniqueConstraintForBang(
    tableName: string,
    { column = null, ...options }: Record<string, unknown>,
  ): Promise<UniqueConstraintDefinition> {
    const uniqueConstraint = await this.uniqueConstraintFor(tableName, { column, ...options });
    if (!rtest(uniqueConstraint)) {
      const columnToS =
        column == null
          ? rbInspect(symbolizeKeys(options))
          : Array.isArray(column)
            ? `[${(column as string[])
                .map((c) => (String(c).startsWith(":") ? String(c) : `:${String(c)}`))
                .join(", ")}]`
            : String(column).replace(/^:/, "");
      throw new ArgumentError(`Table '${tableName}' has no unique constraint for ${columnToS}`);
    }
    return uniqueConstraint;
  }

  /** @internal */
  dataSourceSql(name: string | null = null, options: { type?: string } = {}): string {
    const scope = this.quotedScope(name, { type: options.type });
    scope.type ||= "'r','v','m','p','f'";

    let sql = "SELECT c.relname FROM pg_class c LEFT JOIN pg_namespace n ON n.oid = c.relnamespace";
    sql += ` WHERE n.nspname = ${scope.schema}`;
    if (rtest(scope.name)) sql += ` AND c.relname = ${scope.name}`;
    sql += ` AND c.relkind IN (${scope.type})`;
    return sql;
  }

  /** @internal */
  override quotedScope(
    name?: string | null,
    options: { type?: string } = {},
  ): { schema: string; name?: string; type?: string } {
    let schema: string | null;
    [schema, name] = this.extractSchemaQualifiedName(name ?? "");
    let type: string | null = null;
    switch (options.type) {
      case "BASE TABLE":
        type = "'r','p'";
        break;
      case "VIEW":
        type = "'v','m'";
        break;
      case "FOREIGN TABLE":
        type = "'f'";
        break;
    }
    const scope = {} as { schema: string; name?: string; type?: string };
    scope.schema = schema ? this.quote(schema) : "ANY (current_schemas(false))";
    if (name) scope.name = this.quote(name);
    if (type) scope.type = type;
    return scope;
  }

  /** @internal */
  extractSchemaQualifiedName(string: string): [string | null, string] {
    const name = Utils.extractSchemaQualifiedName(string);
    return [name.schema, name.identifier];
  }

  /** @internal */
  async columnNamesFromColumnNumbers(tableOid: number, columnNumbers: number[]): Promise<string[]> {
    if (columnNumbers.length === 0) return [];
    const rows = await this.query(
      `SELECT a.attnum, a.attname
       FROM pg_attribute a
       WHERE a.attrelid = ${tableOid}
       AND a.attnum IN (${columnNumbers.join(", ")})`,
      "SCHEMA",
    );
    const map = new Map(rows.map((r) => [Number(r[0]), r[1] as string]));
    return valuesAt(map, ...columnNumbers).filter((name): name is string => name != null);
  }
}

const SERIAL_SEQUENCE_RE = /^nextval\('"?(?<sequenceName>.+_(?<suffix>seq\d*))"?'::regclass\)$/;
