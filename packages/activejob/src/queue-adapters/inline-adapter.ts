import { NotImplementedError, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { QueueAdapters as QueueAdaptersSeat } from "../namespaces.js";
import { AbstractAdapter } from "../queue-adapters/abstract-adapter.js";

export class InlineAdapter extends AbstractAdapter {
  [key: string]: any;
  static [key: string]: any;

  async enqueue(job: any): Promise<any> {
    return await Base.execute(job.serialize());
  }

  enqueueAt(...rest: any[]): any {
    throw new NotImplementedError(
      "Use a queueing backend to enqueue jobs in the future. Read more at https://guides.rubyonrails.org/active_job_basics.html",
    );
  }
}
registerConstant("ActiveJob::QueueAdapters::InlineAdapter", InlineAdapter);
rbModConstSet(QueueAdaptersSeat, "InlineAdapter", InlineAdapter);
