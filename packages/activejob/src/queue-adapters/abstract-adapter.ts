import { NotImplementedError, registerConstant, rbModConstSet } from "@blazetrails/ruby-compat";
import { QueueAdapters as QueueAdaptersSeat } from "../namespaces.js";

export class AbstractAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(job: any): any {
    throw new NotImplementedError();
  }

  enqueueAt(job: any, timestamp: any): any {
    throw new NotImplementedError();
  }
}
registerConstant("ActiveJob::QueueAdapters::AbstractAdapter", AbstractAdapter);
rbModConstSet(QueueAdaptersSeat, "AbstractAdapter", AbstractAdapter);
