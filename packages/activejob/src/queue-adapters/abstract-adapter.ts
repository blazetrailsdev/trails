import { NotImplementedError } from "@blazetrails/ruby-compat";

export class AbstractAdapter {
  static toString(): string {
    return "ActiveJob::QueueAdapters::AbstractAdapter";
  }

  enqueue(_job: unknown) {
    throw new NotImplementedError();
  }

  enqueueAt(_job: unknown, _timestamp: unknown) {
    throw new NotImplementedError();
  }
}
