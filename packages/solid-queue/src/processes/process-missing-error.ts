import { RuntimeError, registerConstant } from "@blazetrails/ruby-compat";

export class ProcessMissingError extends RuntimeError {
  constructor() {
    super("The process that was running this job no longer exists");
  }
}

registerConstant("SolidQueue::Processes::ProcessMissingError", ProcessMissingError);
