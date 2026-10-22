import { ActiveJob } from "./namespaces.js";

let _verboseEnqueueLogs = false;

export function verboseEnqueueLogs(): boolean {
  return _verboseEnqueueLogs;
}

export function setVerboseEnqueueLogs(verboseEnqueueLogs: boolean): void {
  _verboseEnqueueLogs = verboseEnqueueLogs;
}

Object.assign(ActiveJob, { verboseEnqueueLogs, setVerboseEnqueueLogs });
