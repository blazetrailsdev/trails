import { squish, TopLevel } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./active-job.js";
import { deprecator } from "./deprecator.js";
import { Enqueuing } from "./enqueuing.js";
import type { Base } from "./base.js";

export class EnqueueAfterTransactionCommit {
  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::EnqueueAfterTransactionCommit";
  }

  /** @internal */
  async rawEnqueue(this: Base) {
    const enqueueAfterTransactionCommit = this.constructor.enqueueAfterTransactionCommit;
    const afterTransaction = (() => {
      const caseValue = this.constructor.enqueueAfterTransactionCommit;
      if (caseValue === "always") {
        deprecator().warn(
          squish(
            `Setting \`${(Object.hasOwn(this.constructor, "toString") ? String(this.constructor) : this.constructor.name || null) ?? ""}.enqueue_after_transaction_commit = :always\` is deprecated and will be removed in Rails 8.1.\nSet to \`true\` to always enqueue the job after the transaction is committed.\n`,
          ),
        );
        return true;
      } else if (caseValue === "never") {
        deprecator().warn(
          squish(
            `Setting \`${(Object.hasOwn(this.constructor, "toString") ? String(this.constructor) : this.constructor.name || null) ?? ""}.enqueue_after_transaction_commit = :never\` is deprecated and will be removed in Rails 8.1.\nSet to \`false\` to never enqueue the job after the transaction is committed.\n`,
          ),
        );
        return false;
      } else if (caseValue === "default") {
        deprecator().warn(
          squish(
            `Setting \`${(Object.hasOwn(this.constructor, "toString") ? String(this.constructor) : this.constructor.name || null) ?? ""}.enqueue_after_transaction_commit = :default\` is deprecated and will be removed in Rails 8.1.\nSet to \`false\` to never enqueue the job after the transaction is committed.\n`,
          ),
        );
        return false;
      } else {
        return enqueueAfterTransactionCommit;
      }
    })();
    if (afterTransaction != null && afterTransaction !== false) {
      this.successfullyEnqueued = true;
      TopLevel.ActiveRecord!.afterAllTransactionsCommit(async () => {
        this.successfullyEnqueued = false;
        return await Enqueuing.prototype.rawEnqueue.call(this);
      });
      return this;
    } else {
      return await Enqueuing.prototype.rawEnqueue.call(this);
    }
  }
}
