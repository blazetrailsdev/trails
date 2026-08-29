import type { Base } from "./base.js";

import {
  ArgumentError,
  Model,
  type AttributeSet,
  type CallbackObject,
} from "@blazetrails/activemodel";
import {
  IsolatedExecutionState,
  defineCallbacks,
  extractOptionsBang,
  included,
  kernelArray,
  peekCallbackChain as asPeekCallbackChain,
  runCallbacks,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { ActiveRecord } from "./ar-config.js";
import { Rollback } from "./errors.js";
export { Rollback };

import {
  CURRENT_TRANSACTION_KEY,
  Transaction,
} from "./connection-adapters/abstract/transaction.js";
import { Transaction as PublicTransaction } from "./transaction.js";
import { transaction as dbTransaction } from "./connection-adapters/abstract/database-statements.js";

type TransactionAction = "create" | "update" | "destroy";

export function currentTransaction(): Transaction | null {
  return IsolatedExecutionState.get<Transaction | null>(CURRENT_TRANSACTION_KEY) ?? null;
}

export function currentTransactionPublic(): PublicTransaction {
  const internalTx = currentTransaction();
  if (!internalTx) return PublicTransaction.NULL_TRANSACTION;
  return (internalTx as any).userTransaction ?? new PublicTransaction(internalTx);
}

export function afterAllTransactionsCommit(fn: () => void | Promise<void>): void | Promise<void> {
  const tx = currentTransactionPublic();
  if (tx.isClosed()) {
    return fn();
  }
  return tx.afterCommit(fn);
}

export async function transaction<T>(
  modelClass: typeof Base,
  fn: (tx: PublicTransaction) => Promise<T>,
  options?: { isolation?: string; requiresNew?: boolean; joinable?: boolean },
): Promise<T | undefined> {
  if (options) {
    for (const key of Object.keys(options)) {
      if (key !== "isolation" && key !== "requiresNew" && key !== "joinable") {
        throw new ArgumentError(`unknown keyword: :${key}`);
      }
    }
  }

  return modelClass.withConnection(async (connection) => {
    const result = await dbTransaction.call(connection as any, fn as (tx?: unknown) => Promise<T>, {
      requiresNew: options?.requiresNew,
      isolation: options?.isolation,
      joinable: options?.joinable,
    });
    return result as T | undefined;
  });
}

export async function savepoint<T>(
  modelClass: typeof Base,
  _name: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  return transaction(modelClass, async () => fn(), { requiresNew: true });
}

type CallbackFn = (...args: any[]) => any;

type TransactionCallbackFilter<T extends typeof Model> =
  | ((record: InstanceType<T>) => void | boolean | Promise<void | boolean>)
  | CallbackObject
  | string;
type TransactionCallbackArgs<T extends typeof Model> = (
  | TransactionCallbackFilter<T>
  | CallbackOptions
)[];
type CallbackOptions = {
  on?: string | string[];
  if?: CallbackFn | CallbackFn[];
  unless?: CallbackFn | CallbackFn[];
  prepend?: boolean;
};

export const InstanceMethods = {
  [included](base: typeof Model): void {
    for (const name of ["commit", "rollback", "before_commit"]) {
      defineCallbacks(base.prototype, name, { scope: ["kind", "name"] });
    }
  },
};

export function beforeCommit<T extends typeof Base>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args);
  setCallback.call(this, "before_commit", "before", ...args);
}

export function afterCommit<T extends typeof Model>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, prependOption());
  setCallback.call(this, "commit", "after", ...args);
}

export function afterSaveCommit<T extends typeof Base>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, {
    on: ["create", "update"],
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", ...args);
}

export function afterCreateCommit<T extends typeof Base>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, {
    on: "create",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", ...args);
}

export function afterUpdateCommit<T extends typeof Base>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, {
    on: "update",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", ...args);
}

export function afterDestroyCommit<T extends typeof Base>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, {
    on: "destroy",
    ...prependOption(),
  });
  setCallback.call(this, "commit", "after", ...args);
}

export function afterRollback<T extends typeof Model>(
  this: T,
  ...args: TransactionCallbackArgs<T>
): void {
  setOptionsForCallbacksBang(args, prependOption());
  setCallback.call(this, "rollback", "after", ...args);
}

export function setCallback<T extends typeof Model>(
  this: T,
  name: string,
  ...filterList: FilterListEntry<any>[]
): void {
  const [rest, extracted] = extractOptionsBang(filterList);
  const options = { ...extracted } as Record<string, unknown>;

  if ((name === "commit" || name === "rollback") && options.on !== undefined) {
    const fireOn = kernelArray(options.on) as string[];
    assertValidTransactionAction(fireOn);
    options.if = [
      (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn),
      ...kernelArray(options.if),
    ];
  }
  delete options.on;

  (Model.setCallback as (this: T, name: string, ...args: unknown[]) => void).call(
    this,
    name,
    ...rest,
    options,
  );
}

export async function beforeCommittedBang(record: Base): Promise<void> {
  const ctor = record.constructor as typeof Base;
  await runCallbacks(record, "before_commit");
}

export async function committedBang(
  this: Base,
  { shouldRunCallbacks = true }: { shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  const r = this as any;
  r._startTransactionState = null;
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      r._committedAlreadyCalled = true;
      const ctor = this.constructor as typeof Base;
      await runCallbacks(this, "commit");
    }
  } finally {
    r._committedAlreadyCalled = false;
    r._triggerUpdateCallback = false;
    r._triggerDestroyCallback = false;
  }
}

export async function rolledbackBang(
  this: Base,
  {
    forceRestoreState = false,
    shouldRunCallbacks = true,
  }: { forceRestoreState?: boolean; shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      const ctor = this.constructor as typeof Base;
      await runCallbacks(this, "rollback");
    }
  } finally {
    restoreTransactionRecordState.call(this, forceRestoreState);
    clearTransactionRecordState.call(this);
    if (forceRestoreState) {
      (this as any)._startTransactionState = null;
      (this as any)._triggerUpdateCallback = false;
      (this as any)._triggerDestroyCallback = false;
    }
  }
}

/**
 * @internal
 * @missingRailsArgs frozen? — PERMANENT
 */
export function rememberTransactionRecordState(this: Base): void {
  const r = this as any;
  if (!r._startTransactionState) {
    const snapshotAttrs = r._attributes.deepDup();
    r._startTransactionState = {
      newRecord: r._newRecord,
      destroyed: r._destroyed,
      frozen: Object.isFrozen(r._attributes),
      id: this.id,
      previouslyNewRecord: r._previouslyNewRecord,
      attributes: snapshotAttrs,
      level: 0,
    };
  }
  r._startTransactionState.level += 1;

  if (r._committedAlreadyCalled) {
    r._newRecordBeforeLastCommit = false;
  } else {
    r._newRecordBeforeLastCommit = r._startTransactionState.newRecord;
  }
}

/** @internal */
export function restoreTransactionRecordState(this: Base, forceRestoreState = false): void {
  const r = this as any;
  const restoreState = r._startTransactionState;
  if (restoreState) {
    if (forceRestoreState || restoreState.level <= 1) {
      r._newRecord = restoreState.newRecord;
      r._previouslyNewRecord = restoreState.previouslyNewRecord;
      r._destroyed = restoreState.destroyed;
      r._attributes = (restoreState.attributes as AttributeSet).map((attr) => {
        const value = r._attributes.fetchValue(attr.name);
        if (attr.value !== value) attr = attr.withValueFromUser(value);
        return attr;
      });
      r._mutationsFromDatabase = null;
      r._mutationsBeforeLastSave = null;
      const ctor = this.constructor as typeof Base;
      const primaryKey = ctor.primaryKey;
      if (ctor.compositePrimaryKey) {
        const cols = primaryKey as string[];
        const savedId = restoreState.id as unknown[];
        if (cols.some((col, i) => r._attributes.fetchValue(col) !== savedId[i])) {
          cols.forEach((col, i) => {
            r._attributes.writeFromUser(col, savedId[i]);
          });
        }
      } else {
        if (r._attributes.fetchValue(primaryKey as string) !== restoreState.id) {
          r._attributes.writeFromUser(primaryKey as string, restoreState.id);
        }
      }

      if (restoreState.frozen) r._attributes.freeze();
    }
  }
}

export async function withTransactionReturningStatus<T>(
  this: Base,
  fn: () => Promise<T>,
): Promise<T> {
  const modelClass = this.constructor as typeof Base;

  const r = this as any;
  r._transactionAction = undefined;

  let status: T;

  await modelClass.withConnection(async (connection) => {
    const ensureFinalize = !connection.isTransactionOpen();

    await dbTransaction.call(connection as any, async () => {
      await addToTransaction.call(this, ensureFinalize || hasTransactionalCallbacks.call(this));
      rememberTransactionRecordState.call(this);

      status = await fn();
      if (status === false || status == null) {
        throw new Rollback();
      }
      return status;
    });
  });

  return status!;
}

export function _newRecordBeforeLastCommit(this: Base): boolean {
  return (this as any)._newRecordBeforeLastCommit ?? false;
}

export function isTriggerTransactionalCallbacks(this: Base): boolean {
  const r = this as any;
  const newBeforeLastCommit = r._newRecordBeforeLastCommit === true;
  const triggerUpdate = r._triggerUpdateCallback === true;
  const triggerDestroy = r._triggerDestroyCallback === true;
  return (
    ((newBeforeLastCommit || triggerUpdate) && this.isPersisted()) ||
    (triggerDestroy && this.isDestroyed())
  );
}

// Exported so base.ts can wire them into include(Base, {...}) for parity:api.

/** @internal */
export function _committedAlreadyCalled(this: Base): boolean | null {
  return (this as any)._committedAlreadyCalled ?? null;
}

/** @internal */
export function _triggerUpdateCallback(this: Base): boolean | null {
  return (this as any)._triggerUpdateCallback ?? null;
}

/** @internal */
export function _triggerDestroyCallback(this: Base): boolean | null {
  return (this as any)._triggerDestroyCallback ?? null;
}

/** @internal */
export function initInternals(this: Base, super_: () => void): void {
  super_();
  const r = this as any;
  r._startTransactionState = null;
  r._committedAlreadyCalled = null;
  r._newRecordBeforeLastCommit = null;
}

/** @internal */
export function clearTransactionRecordState(this: Base): void {
  const r = this as any;
  if (!r._startTransactionState) return;
  r._startTransactionState.level -= 1;
  if (r._startTransactionState.level < 1) r._startTransactionState = null;
}

/** @internal */
export function isTransactionIncludeAnyAction(this: Base, actions: string[]): boolean {
  const r = this as any;
  return actions.some((action) => {
    switch (action) {
      case "create":
        return this.isPersisted() && r._newRecordBeforeLastCommit === true;
      case "update":
        return (
          !(r._newRecordBeforeLastCommit || this.isDestroyed()) && r._triggerUpdateCallback === true
        );
      case "destroy":
        return r._triggerDestroyCallback === true;
      default:
        return false;
    }
  });
}

/** @internal */
export async function addToTransaction(this: Base, ensureFinalize = true): Promise<void> {
  const ctor = this.constructor as any;
  await ctor.withConnection((connection: any) => {
    connection?.addTransactionRecord?.(this, ensureFinalize);
  });
}

/** @internal */
export function hasTransactionalCallbacks(this: Base): boolean {
  const proto = (this.constructor as any).prototype;
  const rollback = asPeekCallbackChain(proto, "rollback");
  const commit = asPeekCallbackChain(proto, "commit");
  const beforeCommitChain = asPeekCallbackChain(proto, "before_commit");
  return (
    !(rollback == null || rollback.isEmpty) ||
    !(commit == null || commit.isEmpty) ||
    !(beforeCommitChain == null || beforeCommitChain.isEmpty)
  );
}

/** @internal */
function prependOption(): Record<string, unknown> {
  if (ActiveRecord.runAfterTransactionCallbacksInOrderDefined) {
    return { prepend: true };
  } else {
    return {};
  }
}

const VALID_TRANSACTION_ACTIONS = new Set(["create", "update", "destroy"]);

/**
 * @internal
 * @missingRailsCall merge! — PERMANENT
 */
export function setOptionsForCallbacksBang(
  args: unknown[],
  enforcedOptions: Record<string, unknown> = {},
): void {
  const [rest, extracted] = extractOptionsBang(args);
  const options: Record<string, unknown> = { ...extracted, ...enforcedOptions };
  const filterList = [...rest];
  args.length = 0;
  args.push(...filterList, options);

  if (options.on !== undefined) {
    const fireOn = (Array.isArray(options.on) ? options.on : [options.on]) as string[];
    assertValidTransactionAction(fireOn);
    const existingIf = options.if;
    options.if = [
      (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn),
      ...(existingIf === undefined ? [] : Array.isArray(existingIf) ? existingIf : [existingIf]),
    ];
  }
}

/** @internal */
function assertValidTransactionAction(actions: string[]): void {
  const invalid = actions.filter((a) => !VALID_TRANSACTION_ACTIONS.has(a));
  if (invalid.length > 0) {
    throw new ArgumentError(
      `:on conditions for after_commit and after_rollback callbacks have to be one of [:create, :destroy, :update]`,
    );
  }
}
