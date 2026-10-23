import { NotImplementedError } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class InlineAdapter extends AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::InlineAdapter";
  }

  async enqueue(job: { serialize(): Record<string, unknown> }) {
    return await Base.execute(job.serialize());
  }

  enqueueAt(...rest: unknown[]) {
    throw new NotImplementedError(
      "Use a queueing backend to enqueue jobs in the future. Read more at https://guides.rubyonrails.org/active_job_basics.html",
    );
  }
}
