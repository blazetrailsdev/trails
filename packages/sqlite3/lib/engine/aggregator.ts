import type { Aggregator } from "../database.js";

type Instance = InstanceType<Aggregator>;

/** @internal */
export function aggregateOptions(aggregator: Aggregator) {
  const step = (instance: Instance, ...args: unknown[]): Instance => {
    instance.step(...args);
    return instance;
  };
  const varargs = aggregator.arity < 0;
  if (!varargs) Object.defineProperty(step, "length", { value: aggregator.arity + 1 });
  return {
    start: (): Instance => new aggregator(),
    step,
    result: (instance: Instance): unknown => instance.finalize() ?? null,
    varargs,
  };
}

/** @internal */
export function databaseListFilename(
  rows: readonly { name: string; file: string }[],
  dbName: string,
): string | null {
  return rows.find((row) => row.name === dbName)?.file ?? null;
}
