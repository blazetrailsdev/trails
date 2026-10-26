import { isPresent } from "@blazetrails/activesupport";
import { RuntimeError } from "@blazetrails/ruby-compat";

interface Status {
  pid: number | null;
  exitstatus: number | null;
  isSignaled(): boolean;
  termsig: number | null;
}

export class ProcessExitError extends RuntimeError {
  static override toString(): string {
    return "SolidQueue::Processes::ProcessExitError";
  }

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
