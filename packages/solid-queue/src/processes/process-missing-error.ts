import { RuntimeError } from "@blazetrails/ruby-compat";

export class ProcessMissingError extends RuntimeError {
  static override toString(): string {
    return "SolidQueue::Processes::ProcessMissingError";
  }

  constructor() {
    super("The process that was running this job no longer exists");
  }
}
