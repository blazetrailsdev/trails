import type { Base } from "../base.js";

export async function lockBang<T extends Base>(this: T, lock: boolean | string = true): Promise<T> {
  if (this.isPersisted()) {
    if (this.isChanged) {
      const dirtyAttrs = this.changedAttributeNamesToSave.map((a) => `"${a}"`).join(", ");
      throw new Error(
        "Locking a record with unpersisted changes is not supported. Use " +
          "`save` to persist the changes, or `reload` to discard them " +
          `explicitly. Changed attributes: ${dirtyAttrs}.`,
      );
    }
    await (this as unknown as { reload(o: { lock: boolean | string }): Promise<unknown> }).reload({
      lock,
    });
  }
  return this;
}

type TxOptions = { requiresNew?: boolean; joinable?: boolean; isolation?: string };

export async function withLock<T extends Base>(
  this: T,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockClause: boolean | string,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  options: TxOptions,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockClause: boolean | string,
  options: TxOptions,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockOrOptOrFn: boolean | string | TxOptions | ((record: T) => Promise<void> | void),
  optOrFn?: TxOptions | ((record: T) => Promise<void> | void),
  fn?: (record: T) => Promise<void> | void,
): Promise<void> {
  let lockClause: boolean | string = true;
  let txOptions: TxOptions = {};
  let callback: ((record: T) => Promise<void> | void) | undefined;

  if (typeof lockOrOptOrFn === "function") {
    callback = lockOrOptOrFn;
  } else if (typeof lockOrOptOrFn === "string" || typeof lockOrOptOrFn === "boolean") {
    lockClause = lockOrOptOrFn;
    if (typeof optOrFn === "function") {
      callback = optOrFn;
    } else if (optOrFn !== null && optOrFn !== undefined && typeof optOrFn === "object") {
      txOptions = optOrFn;
      callback = fn;
    }
  } else if (lockOrOptOrFn !== null && typeof lockOrOptOrFn === "object") {
    txOptions = lockOrOptOrFn;
    if (typeof optOrFn === "function") callback = optOrFn;
  }

  if (!callback) {
    throw new Error("withLock requires a callback block");
  }

  const cb = callback;
  const instance = this;
  await instance.transaction(async () => {
    await lockBang.call(instance, lockClause);
    await cb(instance);
  }, txOptions);
}

export const InstanceMethods = {
  lockBang,
  withLock,
};
