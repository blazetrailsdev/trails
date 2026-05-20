/**
 * JobRuntime — instruments ActiveJob with ActiveRecord SQL runtime tracking.
 *
 * Mirrors: ActiveRecord::Railties::JobRuntime (railties/job_runtime.rb)
 *
 * Mix this into an ActiveJob class to track DB time used per job and expose
 * it in the job's instrumentation payload as `dbRuntime`.
 *
 * In Rails, the method delegates to super for the outer instrumentation frame
 * and tracks db_runtime inside the block. Since ActiveJob is not yet ported,
 * the TS version tracks db_runtime inline and calls the block directly.
 */
import * as RuntimeRegistry from "../runtime-registry.js";

/**
 * @internal
 */
export function instrument(
  this: unknown,
  operation: string,
  payload: Record<string, unknown> = {},
  block?: () => unknown,
): unknown {
  if (operation === "perform" && block) {
    const runtimeBefore = RuntimeRegistry.stats().sqlRuntime;
    const result = block();
    payload["dbRuntime"] = RuntimeRegistry.stats().sqlRuntime - runtimeBefore;
    return result;
  }
  return block ? block() : undefined;
}

/**
 * Mirrors: ActiveRecord::Railties::JobRuntime
 */
export const JobRuntime = { instrument };
