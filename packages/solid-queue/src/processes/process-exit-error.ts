import { isPresent } from "@blazetrails/activesupport";
import { RuntimeError, registerConstant } from "@blazetrails/ruby-compat";

interface Status {
  pid: number | string | null;
  exitstatus: number | null;
  isSignaled(): boolean;
  termsig: number | null;
}

export class ProcessExitError extends RuntimeError {
  constructor(status: Status) {
    let message = `Process pid=${status.pid} exited unexpectedly.`;
    if (isPresent(status.exitstatus)) {
      message += ` Exited with status ${status.exitstatus}.`;
    }

    if (status.isSignaled()) {
      message += ` Received unhandled signal ${status.termsig}.`;
    }

    super(message);
  }
}

registerConstant("SolidQueue::Processes::ProcessExitError", ProcessExitError);
