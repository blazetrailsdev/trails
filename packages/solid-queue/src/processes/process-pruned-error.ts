import { RuntimeError } from "@blazetrails/ruby-compat";

export class ProcessPrunedError extends RuntimeError {
  constructor(lastHeartbeatAt: unknown) {
    super(`Process was found dead and pruned (last heartbeat at: ${lastHeartbeatAt}`);
  }
}
