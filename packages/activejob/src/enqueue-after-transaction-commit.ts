import { squish, TopLevel } from "@blazetrails/activesupport";
import { rbObjAsString, rbModName, rtest, Module, rbModConstSet } from "@blazetrails/ruby-compat";
import { deprecator } from "./deprecator.js";
import { ActiveJob } from "./namespaces.js";

/** @internal */
export function rawEnqueue(this: any): any {
  const enqueueAfterTransactionCommit: any = this.constructor.enqueueAfterTransactionCommit;
  const afterTransaction: any = (() => {
    const caseValue = this.constructor.enqueueAfterTransactionCommit;
    if (caseValue === "always") {
      deprecator().warn(
        squish(
          `Setting \`${rbObjAsString(rbModName(this.constructor))}.enqueue_after_transaction_commit = :always\` is deprecated and will be removed in Rails 8.1.\nSet to \`true\` to always enqueue the job after the transaction is committed.\n`,
        ),
      );
      return true;
    } else if (caseValue === "never") {
      deprecator().warn(
        squish(
          `Setting \`${rbObjAsString(rbModName(this.constructor))}.enqueue_after_transaction_commit = :never\` is deprecated and will be removed in Rails 8.1.\nSet to \`false\` to never enqueue the job after the transaction is committed.\n`,
        ),
      );
      return false;
    } else if (caseValue === "default") {
      deprecator().warn(
        squish(
          `Setting \`${rbObjAsString(rbModName(this.constructor))}.enqueue_after_transaction_commit = :default\` is deprecated and will be removed in Rails 8.1.\nSet to \`false\` to never enqueue the job after the transaction is committed.\n`,
        ),
      );
      return false;
    } else {
      return enqueueAfterTransactionCommit;
    }
  })();
  if (rtest(afterTransaction)) {
    this.successfullyEnqueued = true;
    (TopLevel as any).ActiveRecord.afterAllTransactionsCommit(() => {
      this.successfullyEnqueued = false;
      return EnqueueAfterTransactionCommit.superMethod(this, "rawEnqueue")!();
    });
    return this;
  } else {
    return EnqueueAfterTransactionCommit.superMethod(this, "rawEnqueue")!();
  }
}

export const EnqueueAfterTransactionCommit: any = new Module((mod: any) => {
  mod.defineMethod("rawEnqueue", rawEnqueue);
});
rbModConstSet(ActiveJob, "EnqueueAfterTransactionCommit", EnqueueAfterTransactionCommit);
