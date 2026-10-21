import { NotImplementedError, rbModConstSet } from "@blazetrails/ruby-compat";
import { QueueAdapters } from "../namespaces.js";

export class AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::AbstractAdapter";
  }

  enqueue(_job: unknown): Promise<unknown> | unknown {
    throw new NotImplementedError();
  }

  enqueueAt(_job: unknown, _timestamp: unknown): Promise<unknown> | unknown {
    throw new NotImplementedError();
  }
}
rbModConstSet(QueueAdapters, "AbstractAdapter", AbstractAdapter);
