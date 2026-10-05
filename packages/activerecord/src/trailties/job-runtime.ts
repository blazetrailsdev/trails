import * as RuntimeRegistry from "../runtime-registry.js";

/** @internal */
export function instrument(
  this: unknown,
  super_: (operation: string, payload: Record<string, unknown>, block?: () => unknown) => unknown,
  operation: string,
  payload: Record<string, unknown> = {},
  block?: () => unknown,
): unknown {
  if (operation === "perform" && block) {
    return super_(operation, payload, () => {
      const dbRuntimeBeforePerform = RuntimeRegistry.sqlRuntime();
      const result = block();
      payload["dbRuntime"] = RuntimeRegistry.sqlRuntime() - dbRuntimeBeforePerform;
      return result;
    });
  } else {
    return super_(operation, payload, block);
  }
}

export const JobRuntime = { instrument };
