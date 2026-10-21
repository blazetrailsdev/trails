import type { Base } from "./base.js";

import {
  ArgumentError,
  Model,
  type AttributeSet,
  type CallbackObject,
} from "@blazetrails/activemodel";
import {
  extractOptionsBang,
  included,
  kernelArray,
  type CallbackChain,
  type Callbacks,
  type Extended,
  type FilterListEntry,
} from "@blazetrails/activesupport";
import { mergeBang, Module, rtest } from "@blazetrails/ruby-compat";
import type { TouchArgs } from "./timestamp.js";
import { Rollback } from "./errors.js";
export { Rollback };

import { Transaction as PublicTransaction } from "./transaction.js";
import { transaction as dbTransaction } from "./connection-adapters/abstract/database-statements.js";
import { runAfterTransactionCallbacksInOrderDefined } from "./active-record.js";

type TransactionAction = "create" | "update" | "destroy";

interface TransactionRecordState {
  id: unknown;
  newRecord: boolean;
  previouslyNewRecord: boolean;
  destroyed: boolean;
  attributes: AttributeSet;
  frozen: boolean;
  level: number;
}

type TransactionsRecord = Omit<
  Base,
  | "_committedAlreadyCalled"
  | "_newRecordBeforeLastCommit"
  | "_triggerUpdateCallback"
  | "_triggerDestroyCallback"
> & {
  _newRecord: boolean;
  _previouslyNewRecord: boolean;
  _destroyed: boolean;
  _attributes: AttributeSet;
  _mutationsFromDatabase?: unknown;
  _mutationsBeforeLastSave?: unknown;
  _startTransactionState?: TransactionRecordState | null;
  _committedAlreadyCalled?: boolean | null;
  _newRecordBeforeLastCommit?: boolean | null;
  _triggerUpdateCallback?: boolean | null;
  _triggerDestroyCallback?: boolean | null;
};

export async function transaction<T>(
  modelClass: typeof Base,
  fn: (tx: PublicTransaction) => Promise<T> | T,
  options: { isolation?: string; requiresNew?: boolean; joinable?: boolean } = {},
): Promise<T | undefined> {
  return modelClass.withConnection((connection) => {
    return dbTransaction.call(
      connection as any,
      fn as (tx?: unknown) => Promise<T>,
      options,
    ) as Promise<T | undefined>;
  });
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

export const Transactions = Object.assign(new Module(), {
  [included](base: typeof Model): void {
    (base as typeof Model & Extended<typeof Callbacks.ClassMethods>).defineCallbacks(
      "commit",
      "rollback",
      "before_commit",
      { scope: ["kind", "name"] },
    );
  },
});

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
  const extracted = extractOptionsBang(filterList);
  const rest = filterList;
  const options = { ...extracted } as Record<string, unknown>;

  if ((name === "commit" || name === "rollback") && rtest(options.on)) {
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

export async function beforeCommittedBang(this: Base): Promise<void> {
  await this._runBeforeCommitCallbacks();
}

export async function committedBang(
  this: TransactionsRecord,
  { shouldRunCallbacks = true }: { shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  this._startTransactionState = null;
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      this._committedAlreadyCalled = true;
      await this._runCommitCallbacks();
    }
  } finally {
    this._committedAlreadyCalled = false;
    this._triggerUpdateCallback = false;
    this._triggerDestroyCallback = false;
  }
}

export async function rolledbackBang(
  this: TransactionsRecord,
  {
    forceRestoreState = false,
    shouldRunCallbacks = true,
  }: { forceRestoreState?: boolean; shouldRunCallbacks?: boolean } = {},
): Promise<void> {
  try {
    if (shouldRunCallbacks && isTriggerTransactionalCallbacks.call(this)) {
      await this._runRollbackCallbacks();
    }
  } finally {
    restoreTransactionRecordState.call(this, forceRestoreState);
    clearTransactionRecordState.call(this);
    if (forceRestoreState) {
      this._startTransactionState = null;
      this._triggerUpdateCallback = false;
      this._triggerDestroyCallback = false;
    }
  }
}

/** @internal */
export function rememberTransactionRecordState(this: TransactionsRecord): void {
  this._startTransactionState ||= {
    id: this.id,
    newRecord: this._newRecord,
    previouslyNewRecord: this._previouslyNewRecord,
    destroyed: this._destroyed,
    attributes: this._attributes,
    frozen: this.isFrozen(),
    level: 0,
  };
  this._startTransactionState.level += 1;

  if (this._committedAlreadyCalled) {
    this._newRecordBeforeLastCommit = false;
  } else {
    this._newRecordBeforeLastCommit = this._startTransactionState.newRecord;
  }
}

/** @internal */
export function restoreTransactionRecordState(
  this: TransactionsRecord,
  forceRestoreState = false,
): void {
  const restoreState = this._startTransactionState;
  if (restoreState) {
    if (forceRestoreState || restoreState.level <= 1) {
      this._newRecord = restoreState.newRecord;
      this._previouslyNewRecord = restoreState.previouslyNewRecord;
      this._destroyed = restoreState.destroyed;
      this._attributes = restoreState.attributes.map((attr) => {
        const value = this._attributes.fetchValue(attr.name!);
        if (attr.value() !== value) attr = attr.withValueFromUser(value);
        return attr;
      });
      this._mutationsFromDatabase = null;
      this._mutationsBeforeLastSave = null;
      const ctor = this.constructor;
      const primaryKey = ctor.primaryKey;
      if (ctor.isCompositePrimaryKey()) {
        const cols = primaryKey as string[];
        const savedId = restoreState.id as unknown[];
        if (cols.some((col, i) => this._attributes.fetchValue(col) !== savedId[i])) {
          cols.forEach((col, i) => {
            this._attributes.writeFromUser(col, savedId[i]);
          });
        }
      } else {
        if (this._attributes.fetchValue(primaryKey as string) !== restoreState.id) {
          this._attributes.writeFromUser(primaryKey as string, restoreState.id);
        }
      }

      if (restoreState.frozen) this._attributes.freeze();
    }
  }
}

export function destroy<T>(this: Base, superFn: () => Promise<T>): Promise<T> {
  return withTransactionReturningStatus.call(this, superFn) as Promise<T>;
}

export async function save<T>(this: Base, superFn: () => Promise<T>): Promise<T> {
  await this.constructor.ensureSchemaLoaded();
  return withTransactionReturningStatus.call(this, superFn) as Promise<T>;
}

export async function saveBang<T>(this: Base, superFn: () => Promise<T>): Promise<T> {
  await this.constructor.ensureSchemaLoaded();
  return withTransactionReturningStatus.call(this, superFn) as Promise<T>;
}

export function touch(this: Base, ...names: TouchArgs): Promise<boolean> {
  return withTransactionReturningStatus.call(
    this,
    () => Transactions.superMethod(this, "touch")!(...names) as Promise<boolean>,
  ) as Promise<boolean>;
}

export async function withTransactionReturningStatus<T>(
  this: Base,
  fn: () => Promise<T>,
): Promise<T> {
  const modelClass = this.constructor;

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

export function _newRecordBeforeLastCommit(this: TransactionsRecord): boolean {
  return this._newRecordBeforeLastCommit ?? false;
}

export function isTriggerTransactionalCallbacks(this: TransactionsRecord): boolean {
  const newBeforeLastCommit = this._newRecordBeforeLastCommit === true;
  const triggerUpdate = this._triggerUpdateCallback === true;
  const triggerDestroy = this._triggerDestroyCallback === true;
  return (
    ((newBeforeLastCommit || triggerUpdate) && this.isPersisted()) ||
    (triggerDestroy && this.isDestroyed())
  );
}

// Exported so base.ts can wire them into include(Base, {...}) for parity:api.

/** @internal */
export function _committedAlreadyCalled(this: TransactionsRecord): boolean | null {
  return this._committedAlreadyCalled ?? null;
}

/** @internal */
export function _triggerUpdateCallback(this: TransactionsRecord): boolean | null {
  return this._triggerUpdateCallback ?? null;
}

/** @internal */
export function _triggerDestroyCallback(this: TransactionsRecord): boolean | null {
  return this._triggerDestroyCallback ?? null;
}

/** @internal */
export function initInternals(this: TransactionsRecord): void {
  Transactions.superMethod(this, "initInternals")!();
  this._startTransactionState = null;
  this._committedAlreadyCalled = null;
  this._newRecordBeforeLastCommit = null;
}

/** @internal */
export function clearTransactionRecordState(this: TransactionsRecord): void {
  if (!this._startTransactionState) return;
  this._startTransactionState.level -= 1;
  if (this._startTransactionState.level < 1) this._startTransactionState = null;
}

/** @internal */
export function isTransactionIncludeAnyAction(
  this: TransactionsRecord,
  actions: string[],
): boolean {
  return actions.some((action) => {
    switch (action) {
      case "create":
        return this.isPersisted() && this._newRecordBeforeLastCommit === true;
      case "update":
        return (
          !(this._newRecordBeforeLastCommit || this.isDestroyed()) &&
          this._triggerUpdateCallback === true
        );
      case "destroy":
        return this._triggerDestroyCallback === true;
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
  const self = this as unknown as Record<
    "_rollbackCallbacks" | "_commitCallbacks" | "_beforeCommitCallbacks",
    CallbackChain
  >;
  return (
    !self._rollbackCallbacks.isEmpty ||
    !self._commitCallbacks.isEmpty ||
    !self._beforeCommitCallbacks.isEmpty
  );
}

/** @internal */
function prependOption(): Record<string, unknown> {
  if (runAfterTransactionCallbacksInOrderDefined()) {
    return { prepend: true };
  } else {
    return {};
  }
}

const VALID_TRANSACTION_ACTIONS = new Set(["create", "update", "destroy"]);

/** @internal */
export function setOptionsForCallbacksBang(
  args: unknown[],
  enforcedOptions: Record<string, unknown> = {},
): void {
  const options = mergeBang<unknown>(extractOptionsBang(args), enforcedOptions);
  args.push(options);

  if (rtest(options.on)) {
    const fireOn = kernelArray(options.on) as string[];
    assertValidTransactionAction(fireOn);
    options.if = [
      (record: Base): boolean => isTransactionIncludeAnyAction.call(record, fireOn),
      ...kernelArray(options.if),
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

Transactions.defineMethod("beforeCommittedBang", beforeCommittedBang);
Transactions.defineMethod("touch", touch);
Transactions.defineMethod("initInternals", initInternals);
