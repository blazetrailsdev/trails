export class ActiveRecordError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecordError";
  }
}

export class SubclassNotFound extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SubclassNotFound";
  }
}

export class AssociationTypeMismatch extends ActiveRecordError {
  constructor(expected: string, actual: string) {
    super(`${expected} expected, got ${actual}`);
    this.name = "AssociationTypeMismatch";
  }
}

export class SerializationTypeMismatch extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SerializationTypeMismatch";
  }
}

export class AdapterNotSpecified extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdapterNotSpecified";
  }
}

export class TableNotSpecified extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TableNotSpecified";
  }
}

export class AdapterNotFound extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AdapterNotFound";
  }
}

export class AdapterError extends ActiveRecordError {
  protected _connectionPool?: unknown;

  get connectionPool(): unknown | undefined {
    return this._connectionPool;
  }

  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AdapterError";
    this._connectionPool = options?.connectionPool;
  }

  setConnectionPool(connectionPool: unknown): this {
    if (this._connectionPool === undefined) {
      this._connectionPool = connectionPool;
    }
    return this;
  }
}

export class ConnectionNotEstablished extends AdapterError {
  private _poolSet: boolean;

  constructor(message?: string | Error, options?: { connectionPool?: unknown; cause?: unknown }) {
    const cause = options?.cause ?? (message instanceof Error ? message : undefined);
    super(message instanceof Error ? message.message : message, { ...options, cause });
    this.name = "ConnectionNotEstablished";
    this._poolSet = options?.connectionPool !== undefined;
  }

  setPool(connectionPool: unknown): this {
    if (!this._poolSet) {
      this._connectionPool = connectionPool;
      this._poolSet = true;
    }
    return this;
  }
}

export class ConnectionTimeoutError extends ConnectionNotEstablished {
  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options);
    this.name = "ConnectionTimeoutError";
  }
}

export class ExclusiveConnectionTimeoutError extends ConnectionTimeoutError {
  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options);
    this.name = "ExclusiveConnectionTimeoutError";
  }
}

export class ConnectionNotDefined extends ConnectionNotEstablished {
  readonly connectionName?: string;
  readonly role?: string;
  readonly shard?: string;

  constructor(
    message?: string,
    options?: {
      connectionName?: string;
      role?: string;
      shard?: string;
      connectionPool?: unknown;
      cause?: unknown;
    },
  ) {
    super(message, {
      connectionPool: options?.connectionPool,
      cause: options?.cause,
    });
    this.name = "ConnectionNotDefined";
    this.connectionName = options?.connectionName;
    this.role = options?.role;
    this.shard = options?.shard;
  }
}

export class DatabaseConnectionError extends ConnectionNotEstablished {
  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message ?? "Database connection error", options);
    this.name = "DatabaseConnectionError";
  }

  static hostnameError(hostname: string): DatabaseConnectionError {
    return new DatabaseConnectionError(
      `There is an issue connecting with your hostname: ${hostname}.\n\nPlease check your database configuration and ensure there is a valid connection to your database.`,
    );
  }

  static usernameError(username: string): DatabaseConnectionError {
    return new DatabaseConnectionError(
      `There is an issue connecting to your database with your username/password, username: ${username}.\n\nPlease check your database configuration to ensure the username/password are valid.`,
    );
  }
}

export class NotImplementedError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NotImplementedError";
  }
}

export class ReadOnlyError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReadOnlyError";
  }
}

export class RecordNotFound extends ActiveRecordError {
  readonly model: string;
  readonly primaryKey?: string;
  readonly id?: unknown;

  constructor(message?: string, model?: string, primaryKey?: string, id?: unknown) {
    super(message);
    this.name = "RecordNotFound";
    this.model = model ?? "Record";
    this.primaryKey = primaryKey;
    this.id = id;
  }
}

export class AssociationTargetReplacedDuringLoad extends ActiveRecordError {
  constructor(message?: string) {
    super(message);
    this.name = "AssociationTargetReplacedDuringLoad";
  }
}

export class RecordNotSaved extends ActiveRecordError {
  readonly record?: object;

  constructor(message?: string, record?: object) {
    super(message);
    this.name = "RecordNotSaved";
    this.record = record;
  }
}

export class RecordNotDestroyed extends ActiveRecordError {
  readonly record?: object;

  constructor(message?: string, record?: object) {
    super(message);
    this.name = "RecordNotDestroyed";
    this.record = record;
  }
}

export type { RecordInvalid } from "./validations.js";

export class SoleRecordExceeded extends ActiveRecordError {
  readonly record?: { name?: string };

  constructor(record?: { name?: string }) {
    super(`Wanted only one ${record?.name ?? "record"}`);
    this.name = "SoleRecordExceeded";
    this.record = record;
  }
}

export class StatementInvalid extends AdapterError {
  sql?: string;
  binds?: unknown[];
  protected _querySet = false;

  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, { connectionPool: options?.connectionPool, cause: options?.cause });
    this.name = "StatementInvalid";
    this.sql = options?.sql;
    this.binds = options?.binds;
    this._querySet = options?.sql != null;
  }

  setQuery(sql: string, binds: unknown[]): StatementInvalid {
    if (!this._querySet) {
      this.sql = sql;
      this.binds = binds;
      this._querySet = true;
    }
    return this;
  }
}

export class QueryAborted extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "QueryAborted";
  }
}

export class ConnectionFailed extends QueryAborted {
  constructor(
    message?: string | Error,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    const cause = options?.cause ?? (message instanceof Error ? message : undefined);
    super(message instanceof Error ? message.message : message, { ...options, cause });
    this.name = "ConnectionFailed";
  }
}

export class TransactionRollbackError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "TransactionRollbackError";
  }
}

export class AsynchronousQueryInsideTransactionError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AsynchronousQueryInsideTransactionError";
  }
}

export class SerializationFailure extends TransactionRollbackError {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "SerializationFailure";
  }
}

export class Deadlocked extends TransactionRollbackError {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "Deadlocked";
  }
}

export class LockWaitTimeout extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "LockWaitTimeout";
  }
}

export class StatementTimeout extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "StatementTimeout";
  }
}

export class AdapterTimeout extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "AdapterTimeout";
  }
}

export class QueryCanceled extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "QueryCanceled";
  }
}

export class WrappedDatabaseException extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "WrappedDatabaseException";
  }
}

export class RecordNotUnique extends WrappedDatabaseException {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "RecordNotUnique";
  }
}

export class InvalidForeignKey extends WrappedDatabaseException {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "InvalidForeignKey";
  }
}

export function sqlTypeToMigrationKeyword(sqlType: string): string {
  const normalized = sqlType.trim().toLowerCase();

  if (/^tinyint\s*\(\s*1\s*\)$/.test(normalized)) return "boolean";

  const base = normalized.split("(")[0].trim().split(/\s+/)[0];

  if (base === "bigint") return "bigint";
  if (base.endsWith("int")) return "integer";
  if (base === "varchar" || base === "char") return "string";
  if (base === "text" || base === "tinytext" || base === "mediumtext" || base === "longtext") {
    return "text";
  }

  return base;
}

export interface MismatchedForeignKeyOptions {
  message?: string;
  sql?: string;
  binds?: unknown[];
  connectionPool?: unknown;
  cause?: unknown;
  table?: string;
  foreignKey?: string;
  targetTable?: string;
  primaryKey?: string;
  primaryKeySqlType?: string;
  primaryKeyType?: string;
  queryParser?: (sql: string) => Partial<MismatchedForeignKeyOptions>;
}

export class MismatchedForeignKey extends StatementInvalid {
  readonly fkDetails: Omit<
    MismatchedForeignKeyOptions,
    "message" | "sql" | "binds" | "connectionPool" | "cause"
  >;

  private readonly _originalMessage?: string;
  private readonly _queryParser?: (sql: string) => Partial<MismatchedForeignKeyOptions>;

  constructor(options: MismatchedForeignKeyOptions = {}) {
    const {
      message: originalMessage,
      queryParser,
      table,
      foreignKey,
      targetTable,
      primaryKey,
      primaryKeySqlType,
      primaryKeyType,
      ...rest
    } = options;

    let msg: string;
    if (table && foreignKey && targetTable && primaryKey && primaryKeySqlType) {
      const type = primaryKeyType ?? sqlTypeToMigrationKeyword(primaryKeySqlType);
      msg = [
        `Column \`${foreignKey}\` on table \`${table}\` does not match column \`${primaryKey}\` on \`${targetTable}\`,`,
        `which has type \`${primaryKeySqlType}\`.`,
        `To resolve this issue, change the type of the \`${foreignKey}\` column on \`${table}\` to be :${type}.`,
        `(For example \`t.${type} :${foreignKey}\`).`,
      ].join(" ");
    } else {
      msg =
        "There is a mismatch between the foreign key and primary key column types. " +
        "Verify that the foreign key column type and the primary key of the associated table match types.";
    }
    if (originalMessage) {
      msg += `\nOriginal message: ${originalMessage}`;
    }

    super(msg, rest);
    this.name = "MismatchedForeignKey";
    this._originalMessage = originalMessage;
    this._queryParser = queryParser;
    this.fkDetails = {
      table,
      foreignKey,
      targetTable,
      primaryKey,
      primaryKeySqlType,
      primaryKeyType,
    };
  }

  override setQuery(sql: string, binds: unknown[]): StatementInvalid {
    if (this._queryParser && !this._querySet) {
      const exception = new MismatchedForeignKey({
        message: this._originalMessage,
        sql,
        binds,
        connectionPool: this.connectionPool,
        cause: this.cause,
        ...this._queryParser(sql),
      });
      exception.stack = this.stack;
      return exception;
    }
    return super.setQuery(sql, binds);
  }
}

export class NotNullViolation extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "NotNullViolation";
  }
}

export class ValueTooLong extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ValueTooLong";
  }
}

export class PreparedStatementInvalid extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PreparedStatementInvalid";
  }
}

export class PreparedStatementCacheExpired extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "PreparedStatementCacheExpired";
  }
}

export class NoDatabaseError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message ?? "Database not found", options);
    this.name = "NoDatabaseError";
  }

  static dbError(dbName: string): NoDatabaseError {
    return new NoDatabaseError(
      `We could not find your database: ${dbName}. Available database configurations can be found in config/database.yml.`,
    );
  }
}

export class DatabaseVersionError extends ActiveRecordError {
  constructor(message?: string) {
    super(message ?? "Unknown database version");
    this.name = "DatabaseVersionError";
  }
}

export class RangeError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "RangeError";
  }
}

export class DatabaseAlreadyExists extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message ?? "Database already exists", options);
    this.name = "DatabaseAlreadyExists";
  }
}

export class StaleObjectError extends ActiveRecordError {
  readonly record?: object;
  readonly attemptedAction?: string;

  constructor(record?: object, attemptedAction?: string) {
    if (record && attemptedAction) {
      const model = record?.constructor?.name ?? "Record";
      super(`Attempted to ${attemptedAction} a stale object: ${model}.`);
    } else {
      super("Stale object error.");
    }
    this.name = "StaleObjectError";
    this.record = record;
    this.attemptedAction = attemptedAction;
  }
}

export class ConfigurationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConfigurationError";
  }
}

export class ReadOnlyRecord extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReadOnlyRecord";
  }
}

export class StrictLoadingViolationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StrictLoadingViolationError";
  }
}

export class Rollback extends ActiveRecordError {
  constructor() {
    super("Rollback");
    this.name = "Rollback";
  }
}

export class DangerousAttributeError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DangerousAttributeError";
  }
}

export class AttributeAssignmentError extends ActiveRecordError {
  readonly exception?: Error;
  readonly attribute?: string;

  constructor(message?: string, exception?: Error, attribute?: string) {
    super(message, exception ? { cause: exception } : undefined);
    this.name = "AttributeAssignmentError";
    this.exception = exception;
    this.attribute = attribute;
  }
}

export class TransactionIsolationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransactionIsolationError";
  }
}

export class UnmodifiableRelation extends ActiveRecordError {
  constructor(message = "This relation is unmodifiable", options?: ErrorOptions) {
    super(message, options);
    this.name = "UnmodifiableRelation";
  }
}

export class IrreversibleOrderError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IrreversibleOrderError";
  }
}

export class UnknownAttributeError extends ActiveRecordError {
  readonly record: object;
  readonly attribute: string;

  constructor(record: object, attribute: string) {
    const model = record?.constructor?.name ?? "Record";
    super(`unknown attribute '${attribute}' for ${model}.`);
    this.name = "UnknownAttributeError";
    this.record = record;
    this.attribute = attribute;
  }
}

export { NameError } from "@blazetrails/activesupport";

export class SQLWarning extends AdapterError {
  readonly code: string | null;
  readonly level: string | null;
  sql?: unknown;

  constructor(
    message?: string,
    code?: string | null,
    level?: string | null,
    sql?: unknown,
    connectionPool?: unknown,
  ) {
    super(message ?? "SQL Warning", { connectionPool });
    this.name = "SQLWarning";
    this.code = code ?? null;
    this.level = level ?? null;
    this.sql = sql;
  }
}

export class UnknownAttributeReference extends ActiveRecordError {
  constructor(message?: string) {
    super(
      message ??
        "Dangerous query method (method whose arguments are used as raw SQL) called with non-attribute argument(s)",
    );
    this.name = "UnknownAttributeReference";
  }
}

/**
 * What `errors.rb:475` duck-types: anything answering `table_name`. Rails
 * raises this with a Relation as often as with a model class
 * (`token_for.rb:42`).
 *
 * @noRailsEquivalent Ruby needs no name for a duck type.
 */
type UnknownPrimaryKeyModel = { readonly tableName: string; readonly name?: unknown };

export class UnknownPrimaryKey extends ActiveRecordError {
  readonly model: UnknownPrimaryKeyModel | null;

  constructor(model?: UnknownPrimaryKeyModel | null, description?: string) {
    let msg: string;
    if (model) {
      msg = `Unknown primary key for table ${model.tableName} in model ${String(model.name ?? model)}.`;
      if (description) msg += `\n${description}`;
    } else {
      msg = "Unknown primary key.";
    }
    super(msg);
    this.name = "UnknownPrimaryKey";
    this.model = model ?? null;
  }
}

export class MultiparameterAssignmentErrors extends ActiveRecordError {
  readonly errors: Error[];

  constructor(errors: Error[] = []) {
    super("Multiparameter assignment errors");
    this.name = "MultiparameterAssignmentErrors";
    this.errors = errors;
  }
}
