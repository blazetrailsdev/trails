import { ExecutionContext } from "@blazetrails/activesupport";
import { QueryLogs } from "./query-logs.js";

export const queryLogs = new QueryLogs();

ExecutionContext.afterChange(() => {
  queryLogs.clearCache();
});
