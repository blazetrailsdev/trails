import * as RuntimeRegistry from "../runtime-registry.js";

/** @internal */
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

export const JobRuntime = { instrument };
