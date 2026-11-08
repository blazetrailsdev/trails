import { ActiveJob } from "./namespaces.js";

let _verboseEnqueueLogs: boolean;

export function verboseEnqueueLogs(): boolean {
  return _verboseEnqueueLogs;
}

export function setVerboseEnqueueLogs(verboseEnqueueLogs: boolean): void {
  _verboseEnqueueLogs = verboseEnqueueLogs;
}

Object.assign(ActiveJob, { verboseEnqueueLogs, setVerboseEnqueueLogs });
setVerboseEnqueueLogs(false);
