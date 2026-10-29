import { NotImplementedError } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { QueueAdapters } from "../namespaces.js";
import { AbstractAdapter } from "./abstract-adapter.js";

export class InlineAdapter extends AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::InlineAdapter";
  }

  override async enqueue(job: { serialize(): Record<string, unknown> }): Promise<unknown> {
    return await Base.execute(job.serialize());
  }

  override enqueueAt(..._args: unknown[]): never {
    throw new NotImplementedError(
      "Use a queueing backend to enqueue jobs in the future. Read more at https://guides.rubyonrails.org/active_job_basics.html",
    );
  }
}
QueueAdapters.InlineAdapter = InlineAdapter;
