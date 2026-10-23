import { squish, TopLevel } from "@blazetrails/activesupport";
import { rbCallSuper, rbModConstSet, rbModName, rbObjClass } from "@blazetrails/ruby-compat";
import { deprecator } from "./deprecator.js";
import { ActiveJob } from "./namespaces.js";

interface EnqueueAfterTransactionCommitJob {
  successfullyEnqueued: unknown;
}

/** @internal */
async function rawEnqueue(this: EnqueueAfterTransactionCommitJob): Promise<unknown> {
  const klass = rbObjClass(this) as unknown as { enqueueAfterTransactionCommit: unknown };
  const enqueueAfterTransactionCommit = klass.enqueueAfterTransactionCommit;

  let afterTransaction: unknown;
  switch (klass.enqueueAfterTransactionCommit) {
    case ":always":
      deprecator().warn(
        squish(`
          Setting \`${rbModName(klass)}.enqueue_after_transaction_commit = :always\` is deprecated and will be removed in Rails 8.1.
          Set to \`true\` to always enqueue the job after the transaction is committed.
        `),
      );
      afterTransaction = true;
      break;
    case ":never":
      deprecator().warn(
        squish(`
          Setting \`${rbModName(klass)}.enqueue_after_transaction_commit = :never\` is deprecated and will be removed in Rails 8.1.
          Set to \`false\` to never enqueue the job after the transaction is committed.
        `),
      );
      afterTransaction = false;
      break;
    case ":default":
      deprecator().warn(
        squish(`
          Setting \`${rbModName(klass)}.enqueue_after_transaction_commit = :default\` is deprecated and will be removed in Rails 8.1.
          Set to \`false\` to never enqueue the job after the transaction is committed.
        `),
      );
      afterTransaction = false;
      break;
    default:
      afterTransaction = enqueueAfterTransactionCommit;
  }

  if (afterTransaction != null && afterTransaction !== false) {
    this.successfullyEnqueued = true;
    await TopLevel.ActiveRecord!.afterAllTransactionsCommit(async () => {
      this.successfullyEnqueued = false;
      return await rbCallSuper(this, rawEnqueue);
    });
    return this;
  } else {
    return await rbCallSuper(this, rawEnqueue);
  }
}

export const EnqueueAfterTransactionCommit = { rawEnqueue };
rbModConstSet(ActiveJob, "EnqueueAfterTransactionCommit", EnqueueAfterTransactionCommit);
