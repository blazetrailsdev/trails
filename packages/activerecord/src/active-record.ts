import { ArgumentError } from "@blazetrails/activemodel";
import { ActiveSupport, any } from "@blazetrails/activesupport";
import { ActiveRecord, AsyncExecutor } from "./ar-config.js";
import { _Base } from "./base-slot.js";
import type { SQLWarning } from "./errors.js";
import type { Transaction } from "./connection-adapters/abstract/transaction.js";
import type { QueryTransformer } from "./query-transformers.js";

type DbWarningsAction = "ignore" | "log" | "raise" | "report" | ((warning: SQLWarning) => void);

let _defaultTimezone: "utc" | "local" = "utc";
let _dbWarningsAction: ((warning: SQLWarning) => void) | null = null;
let _writingRole = "writing";
let _readingRole = "reading";
let _asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null = null;
let _globalThreadPoolAsyncQueryExecutor: AsyncExecutor | undefined;
let _globalExecutorConcurrency: number | null | undefined;
let _permanentConnectionCheckout: true | "deprecated" | "disallowed" = true;
let _queryTransformers: QueryTransformer[] = [];

export function isSchemaCacheIgnoredTable(tableName: string): boolean {
  return any(ActiveRecord.schemaCacheIgnoredTables, (ignored) => {
    if (ignored instanceof RegExp) {
      ignored.lastIndex = 0;
      return ignored.test(tableName);
    }
    return ignored === tableName;
  });
}

export function defaultTimezone(): "utc" | "local" {
  return _defaultTimezone;
}

export function setDefaultTimezone(defaultTimezone: "utc" | "local"): void {
  if (!["local", "utc"].includes(defaultTimezone)) {
    throw new ArgumentError("default_timezone must be either :utc (default) or :local.");
  }

  _defaultTimezone = defaultTimezone;
}

export function dbWarningsAction(): ((warning: SQLWarning) => void) | null {
  return _dbWarningsAction;
}

export function setDbWarningsAction(action: DbWarningsAction): void {
  switch (action) {
    case "ignore":
      _dbWarningsAction = null;
      break;
    case "log":
      _dbWarningsAction = (warning) => {
        let warningMessage = `[${warning.name}] ${warning.message}`;
        if (warning.code) warningMessage += ` (${warning.code})`;
        (_Base!.logger as { warn: (msg: string) => void }).warn(warningMessage);
      };
      break;
    case "raise":
      _dbWarningsAction = (warning) => {
        throw warning;
      };
      break;
    case "report":
      _dbWarningsAction = (warning) => {
        ActiveSupport.errorReporter.report(warning, { handled: true });
      };
      break;
    default:
      if (typeof action === "function") {
        _dbWarningsAction = action;
        break;
      }
      throw new ArgumentError(
        "db_warnings_action must be one of :ignore, :log, :raise, :report, or a custom proc.",
      );
  }
}

export function writingRole(): string {
  return _writingRole;
}

export function setWritingRole(writingRole: string): void {
  _writingRole = writingRole;
}

export function readingRole(): string {
  return _readingRole;
}

export function setReadingRole(readingRole: string): void {
  _readingRole = readingRole;
}

export function asyncQueryExecutor(): "global_thread_pool" | "multi_thread_pool" | null {
  return _asyncQueryExecutor;
}

export function setAsyncQueryExecutor(
  asyncQueryExecutor: "global_thread_pool" | "multi_thread_pool" | null,
): void {
  _asyncQueryExecutor = asyncQueryExecutor;
}

/** @missingRailsArgs new — PERMANENT */
export function globalThreadPoolAsyncQueryExecutor(): AsyncExecutor {
  const concurrency = globalExecutorConcurrency() ?? 4;
  void concurrency;
  return (_globalThreadPoolAsyncQueryExecutor ??= new AsyncExecutor());
}

export function setGlobalExecutorConcurrency(globalExecutorConcurrency: number | null): void {
  if (asyncQueryExecutor() == null || asyncQueryExecutor() === "multi_thread_pool") {
    throw new ArgumentError(
      "`global_executor_concurrency` cannot be set when the executor is nil or set to `:multi_thread_pool`. For multiple thread pools, please set the concurrency in your database configuration.",
    );
  }

  _globalExecutorConcurrency = globalExecutorConcurrency;
}

export function globalExecutorConcurrency(): number | null {
  return (_globalExecutorConcurrency ??= null);
}

export function permanentConnectionCheckout(): true | "deprecated" | "disallowed" {
  return _permanentConnectionCheckout;
}

export function setPermanentConnectionCheckout(value: true | "deprecated" | "disallowed"): void {
  if (!([true, "deprecated", "disallowed"] as unknown[]).includes(value)) {
    throw new ArgumentError(
      "permanent_connection_checkout must be one of: `true`, `:deprecated` or `:disallowed`",
    );
  }
  _permanentConnectionCheckout = value;
}

export function queryTransformers(): QueryTransformer[] {
  return _queryTransformers;
}

export function setQueryTransformers(queryTransformers: QueryTransformer[]): void {
  _queryTransformers = queryTransformers;
}

export async function eagerLoadBang(): Promise<void> {
  const Associations = await import("./associations.js");
  const Encryption = await import("./encryption.js");
  await Associations.eagerLoadBang();
  Encryption.eagerLoadBang();
}

export async function disconnectAllBang(): Promise<void> {
  const { PoolConfig } = await import("./connection-adapters/pool-config.js");
  await PoolConfig.disconnectAllBang();
}

export function afterAllTransactionsCommit(
  block: () => void | Promise<void>,
): void | Promise<void> {
  let openTransactions: Transaction[] | null = allOpenTransactions();

  if (openTransactions.length === 0) {
    return block();
  } else if (openTransactions.length === 1) {
    openTransactions[0].afterCommit(block);
  } else {
    let count = openTransactions.length;
    const callback = () => {
      count -= 1;
      if (count === 0) return block();
    };
    for (const t of openTransactions) {
      t.afterCommit(callback);
    }
    openTransactions = null;
  }
}

export function allOpenTransactions(): Transaction[] {
  const openTransactions: Transaction[] = [];
  _Base!.connectionHandler.eachConnectionPool((pool) => {
    const activeConnection = pool.activeConnection;
    if (activeConnection != null) {
      const currentTransaction = activeConnection.currentTransaction();

      if (
        currentTransaction.open &&
        currentTransaction.joinable &&
        !currentTransaction.isInvalidated()
      ) {
        openTransactions.push(currentTransaction as Transaction);
      }
    }
  });
  return openTransactions;
}
