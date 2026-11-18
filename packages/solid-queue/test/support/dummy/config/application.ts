import { Executor, OrderedOptions } from "@blazetrails/activesupport";

class AppExecutor extends Executor {}

const activeJob = new OrderedOptions();
activeJob.queueAdapter = "solid_queue";

export const app: {
  executor: typeof Executor;
  reloader: typeof Executor;
  deprecators: Map<string, unknown>;
  config: {
    x: OrderedOptions & { solidQueueRecordHookRan?: boolean };
    timeZone: string;
    activeJob: OrderedOptions;
  };
} = {
  executor: AppExecutor,
  reloader: AppExecutor,
  deprecators: new Map(),
  config: { x: new OrderedOptions(), timeZone: "UTC", activeJob },
};
