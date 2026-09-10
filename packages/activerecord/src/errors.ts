export { NotImplementedError } from "@blazetrails/ruby-compat";
import type { Column } from "./connection-adapters/column.js";

export class ActiveRecordError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::ActiveRecordError";
  }
}

export class SubclassNotFound extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::SubclassNotFound";
  }
}

export class AssociationTypeMismatch extends ActiveRecordError {
  constructor(expected: string, actual: string) {
    super(`${expected} expected, got ${actual}`);
    this.name = "ActiveRecord::AssociationTypeMismatch";
  }
}

export class SerializationTypeMismatch extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::SerializationTypeMismatch";
  }
}

export class AdapterNotSpecified extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::AdapterNotSpecified";
  }
}

export class TableNotSpecified extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::TableNotSpecified";
  }
}

export class AdapterNotFound extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::AdapterNotFound";
  }
}

export class AdapterError extends ActiveRecordError {
  protected _connectionPool?: unknown;

  get connectionPool(): unknown | undefined {
    return this._connectionPool;
  }

  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ActiveRecord::AdapterError";
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
    this.name = "ActiveRecord::ConnectionNotEstablished";
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
    this.name = "ActiveRecord::ConnectionTimeoutError";
  }
}

export class ExclusiveConnectionTimeoutError extends ConnectionTimeoutError {
  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options);
    this.name = "ActiveRecord::ExclusiveConnectionTimeoutError";
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
    this.name = "ActiveRecord::ConnectionNotDefined";
    this.connectionName = options?.connectionName;
    this.role = options?.role;
    this.shard = options?.shard;
  }
}

export class DatabaseConnectionError extends ConnectionNotEstablished {
  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message ?? "Database connection error", options);
    this.name = "ActiveRecord::DatabaseConnectionError";
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

export class ReadOnlyError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::ReadOnlyError";
  }
}

export class RecordNotFound extends ActiveRecordError {
  readonly model: string;
  readonly primaryKey?: string | string[];
  readonly id?: unknown;

  constructor(message?: string, model?: string, primaryKey?: string | string[], id?: unknown) {
    super(message);
    this.name = "ActiveRecord::RecordNotFound";
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
    this.name = "ActiveRecord::RecordNotSaved";
    this.record = record;
  }
}

export class RecordNotDestroyed extends ActiveRecordError {
  readonly record?: object;

  constructor(message?: string, record?: object) {
    super(message);
    this.name = "ActiveRecord::RecordNotDestroyed";
    this.record = record;
  }
}

export type { RecordInvalid } from "./validations.js";

export class SoleRecordExceeded extends ActiveRecordError {
  readonly record?: { name?: string };

  constructor(record?: { name?: string }) {
    super(`Wanted only one ${record?.name ?? "record"}`);
    this.name = "ActiveRecord::SoleRecordExceeded";
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
    this.name = "ActiveRecord::StatementInvalid";
    this.sql = options?.sql;
    this.binds = options?.binds;
    this._querySet = options?.sql != null;
  }

  setQuery(sql: string, binds: unknown[]): StatementInvalid | Promise<StatementInvalid> {
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
    this.name = "ActiveRecord::QueryAborted";
  }
}

export class ConnectionFailed extends QueryAborted {
  constructor(
    message?: string | Error,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    const cause = options?.cause ?? (message instanceof Error ? message : undefined);
    super(message instanceof Error ? message.message : message, { ...options, cause });
    this.name = "ActiveRecord::ConnectionFailed";
  }
}

export class TransactionRollbackError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::TransactionRollbackError";
  }
}

export class AsynchronousQueryInsideTransactionError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::AsynchronousQueryInsideTransactionError";
  }
}

export class SerializationFailure extends TransactionRollbackError {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::SerializationFailure";
  }
}

export class Deadlocked extends TransactionRollbackError {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::Deadlocked";
  }
}

export class LockWaitTimeout extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::LockWaitTimeout";
  }
}

export class StatementTimeout extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::StatementTimeout";
  }
}

export class AdapterTimeout extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::AdapterTimeout";
  }
}

export class QueryCanceled extends QueryAborted {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::QueryCanceled";
  }
}

export class WrappedDatabaseException extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::WrappedDatabaseException";
  }
}

export class RecordNotUnique extends WrappedDatabaseException {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::RecordNotUnique";
  }
}

export class InvalidForeignKey extends WrappedDatabaseException {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::InvalidForeignKey";
  }
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
  primaryKeyColumn?: Pick<Column, "sqlType" | "type" | "isBigint">;
  queryParser?: (
    sql: string,
  ) => Partial<MismatchedForeignKeyOptions> | Promise<Partial<MismatchedForeignKeyOptions>>;
}

export class MismatchedForeignKey extends StatementInvalid {
  readonly fkDetails: Pick<
    MismatchedForeignKeyOptions,
    "table" | "foreignKey" | "targetTable" | "primaryKey" | "primaryKeyColumn"
  >;

  private readonly _originalMessage?: string;
  private readonly _queryParser?: MismatchedForeignKeyOptions["queryParser"];

  constructor(options: MismatchedForeignKeyOptions = {}) {
    const {
      message: originalMessage,
      queryParser,
      table,
      foreignKey,
      targetTable,
      primaryKey,
      primaryKeyColumn,
      ...rest
    } = options;

    let msg: string;
    if (table) {
      const type = primaryKeyColumn!.isBigint() ? "bigint" : primaryKeyColumn!.type;
      msg = [
        `Column \`${foreignKey}\` on table \`${table}\` does not match column \`${primaryKey}\` on \`${targetTable}\`,`,
        `which has type \`${primaryKeyColumn!.sqlType}\`.`,
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
    this.name = "ActiveRecord::MismatchedForeignKey";
    this._originalMessage = originalMessage;
    this._queryParser = queryParser;
    this.fkDetails = { table, foreignKey, targetTable, primaryKey, primaryKeyColumn };
  }

  override setQuery(sql: string, binds: unknown[]): StatementInvalid | Promise<StatementInvalid> {
    if (this._queryParser && !this._querySet) {
      const build = (details: Partial<MismatchedForeignKeyOptions>) => {
        const exception = new MismatchedForeignKey({
          message: this._originalMessage,
          sql,
          binds,
          connectionPool: this.connectionPool,
          cause: this.cause,
          ...details,
        });
        exception.stack = this.stack;
        return exception;
      };
      const details = this._queryParser(sql);
      return details instanceof Promise ? details.then(build) : build(details);
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
    this.name = "ActiveRecord::NotNullViolation";
  }
}

export class ValueTooLong extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::ValueTooLong";
  }
}

export class PreparedStatementInvalid extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::PreparedStatementInvalid";
  }
}

export class PreparedStatementCacheExpired extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::PreparedStatementCacheExpired";
  }
}

export class NoDatabaseError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message ?? "Database not found", options);
    this.name = "ActiveRecord::NoDatabaseError";
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
    this.name = "ActiveRecord::DatabaseVersionError";
  }
}

export class RangeError extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActiveRecord::RangeError";
  }
}

export class DatabaseAlreadyExists extends StatementInvalid {
  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message ?? "Database already exists", options);
    this.name = "ActiveRecord::DatabaseAlreadyExists";
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
    this.name = "ActiveRecord::StaleObjectError";
    this.record = record;
    this.attemptedAction = attemptedAction;
  }
}

export class ConfigurationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::ConfigurationError";
  }
}

export class ReadOnlyRecord extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::ReadOnlyRecord";
  }
}

export class StrictLoadingViolationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::StrictLoadingViolationError";
  }
}

export class Rollback extends ActiveRecordError {
  constructor() {
    super("Rollback");
    this.name = "ActiveRecord::Rollback";
  }
}

export class DangerousAttributeError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::DangerousAttributeError";
  }
}

export class AttributeAssignmentError extends ActiveRecordError {
  readonly exception?: Error;
  readonly attribute?: string;

  constructor(message?: string, exception?: Error, attribute?: string) {
    super(message, exception ? { cause: exception } : undefined);
    this.name = "ActiveRecord::AttributeAssignmentError";
    this.exception = exception;
    this.attribute = attribute;
  }
}

export class TransactionIsolationError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::TransactionIsolationError";
  }
}

export class UnmodifiableRelation extends ActiveRecordError {
  constructor(message = "This relation is unmodifiable", options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::UnmodifiableRelation";
  }
}

export class IrreversibleOrderError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ActiveRecord::IrreversibleOrderError";
  }
}

export class UnknownAttributeError extends ActiveRecordError {
  readonly record: object;
  readonly attribute: string;

  constructor(record: object, attribute: string) {
    const model = record?.constructor?.name ?? "Record";
    super(`unknown attribute '${attribute}' for ${model}.`);
    this.name = "ActiveModel::UnknownAttributeError";
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
    this.name = "ActiveRecord::SQLWarning";
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
    this.name = "ActiveRecord::UnknownAttributeReference";
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
    this.name = "ActiveRecord::UnknownPrimaryKey";
    this.model = model ?? null;
  }
}

export class MultiparameterAssignmentErrors extends ActiveRecordError {
  readonly errors: Error[];

  constructor(errors: Error[] = []) {
    super("Multiparameter assignment errors");
    this.name = "ActiveRecord::MultiparameterAssignmentErrors";
    this.errors = errors;
  }
}
