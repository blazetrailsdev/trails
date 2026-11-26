import { extractOptionsBang, isPresent } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat/runtime-error";
import type { Base } from "../base.js";
import { Locking } from "../namespaces.js";

export async function lockBang<T extends Base>(this: T, lock: boolean | string = true): Promise<T> {
  if (this.isPersisted()) {
    if (this.isChanged) {
      const dirtyAttrs = this.changedAttributeNamesToSave.map((a) => `"${a}"`).join(", ");
      throw new RuntimeError(
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

export async function withLock<T extends Base, R>(
  this: T,
  fn: () => Promise<R> | R,
): Promise<R | undefined>;
export async function withLock<T extends Base, R>(
  this: T,
  lockClause: boolean | string,
  fn: () => Promise<R> | R,
): Promise<R | undefined>;
export async function withLock<T extends Base, R>(
  this: T,
  options: TxOptions,
  fn: () => Promise<R> | R,
): Promise<R | undefined>;
export async function withLock<T extends Base, R>(
  this: T,
  lockClause: boolean | string,
  options: TxOptions,
  fn: () => Promise<R> | R,
): Promise<R | undefined>;
export async function withLock<T extends Base>(this: T, ...args: unknown[]): Promise<unknown> {
  const block = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
  const transactionOpts = extractOptionsBang(args) as TxOptions;
  const lock = isPresent(args) ? (args[0] as boolean | string) : true;
  return await this.transaction(async () => {
    await lockBang.call(this, lock);
    return await (block as () => unknown)();
  }, transactionOpts);
}

export const Pessimistic = {
  lockBang,
  withLock,
};

Locking.Pessimistic = Pessimistic;
