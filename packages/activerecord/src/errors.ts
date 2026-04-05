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
}

export class ConnectionNotEstablished extends AdapterError {
  private _poolSet: boolean;

  constructor(message?: string, options?: { connectionPool?: unknown; cause?: unknown }) {
    super(message, options);
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

export class RecordNotSaved extends ActiveRecordError {
  readonly record: any;

  constructor(message?: string, record?: any) {
    super(message);
    this.name = "RecordNotSaved";
    this.record = record;
  }
}

export class RecordNotDestroyed extends ActiveRecordError {
  readonly record: any;

  constructor(message?: string, record?: any) {
    super(message);
    this.name = "RecordNotDestroyed";
    this.record = record;
  }
}

export class RecordInvalid extends ActiveRecordError {
  readonly record: any;

  constructor(record: any) {
    const fullMessages = record.errors?.fullMessages;
    const message =
      Array.isArray(fullMessages) && fullMessages.length > 0
        ? `Validation failed: ${fullMessages.join(", ")}`
        : "Validation failed";
    super(message);
    this.name = "RecordInvalid";
    this.record = record;
  }
}

export class SoleRecordExceeded extends ActiveRecordError {
  readonly model?: any;

  constructor(model?: any) {
    super(`Wanted only one ${model?.name ?? "record"}`);
    this.name = "SoleRecordExceeded";
    this.model = model;
  }
}

export class StatementInvalid extends AdapterError {
  sql?: string;
  binds?: unknown[];
  private _querySet = false;

  constructor(
    message?: string,
    options?: { sql?: string; binds?: unknown[]; connectionPool?: unknown; cause?: unknown },
  ) {
    super(message, { connectionPool: options?.connectionPool, cause: options?.cause });
    this.name = "StatementInvalid";
    this.sql = options?.sql;
    this.binds = options?.binds;
    this._querySet = options?.sql !== undefined || options?.binds !== undefined;
  }

  setQuery(sql: string, binds: unknown[]): this {
    if (!this._querySet) {
      this.sql = sql;
      this.binds = binds;
      this._querySet = true;
    }
    return this;
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

export class StaleObjectError extends ActiveRecordError {
  readonly record?: any;
  readonly attemptedAction?: string;

  constructor(record?: any, attemptedAction?: string) {
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

  static forAssociation(record: any, associationName: string): StrictLoadingViolationError {
    const model = record?.constructor?.name ?? "Record";
    return new StrictLoadingViolationError(
      `${model} is marked for strict_loading. The ${associationName} association cannot be lazily loaded.`,
    );
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

export class IrreversibleOrderError extends ActiveRecordError {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "IrreversibleOrderError";
  }
}

export class UnknownAttributeError extends ActiveRecordError {
  readonly record: any;
  readonly attribute: string;

  constructor(record: any, attribute: string) {
    const model = record?.constructor?.name ?? "Record";
    super(`unknown attribute '${attribute}' for ${model}.`);
    this.name = "UnknownAttributeError";
    this.record = record;
    this.attribute = attribute;
  }
}

export class NameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NameError";
  }
}

export class SQLWarning extends AdapterError {
  readonly code: string | null;
  readonly level: string | null;
  sql?: string;

  constructor(message?: string, code?: string | null, level?: string | null, sql?: string) {
    super(message ?? "SQL Warning");
    this.name = "SQLWarning";
    this.code = code ?? null;
    this.level = level ?? null;
    this.sql = sql;
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
