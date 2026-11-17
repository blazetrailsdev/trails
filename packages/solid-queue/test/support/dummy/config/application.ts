import { Executor, OrderedOptions } from "@blazetrails/activesupport";

class AppExecutor extends Executor {}

export const app: {
  executor: typeof Executor;
  config: { x: OrderedOptions & { solidQueueRecordHookRan?: boolean }; timeZone: string };
} = {
  executor: AppExecutor,
  config: { x: new OrderedOptions(), timeZone: "UTC" },
};
