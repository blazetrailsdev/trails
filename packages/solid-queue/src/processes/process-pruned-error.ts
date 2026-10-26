import { RuntimeError } from "@blazetrails/ruby-compat";

export class ProcessPrunedError extends RuntimeError {
  static override toString(): string {
    return "SolidQueue::Processes::ProcessPrunedError";
  }

  constructor(lastHeartbeatAt: unknown) {
    super(`Process was found dead and pruned (last heartbeat at: ${lastHeartbeatAt}`);
  }
}
