import { Executor, OrderedOptions } from "@blazetrails/activesupport";

class AppExecutor extends Executor {}

export const app: {
  executor: typeof Executor;
  config: { x: OrderedOptions & { solidQueueRecordHookRan?: boolean } };
} = {
  executor: AppExecutor,
  config: { x: new OrderedOptions() },
};
