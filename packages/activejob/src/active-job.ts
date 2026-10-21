import { demodulize } from "@blazetrails/activesupport";
import { rbModName, rbObjClass, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

let _verboseEnqueueLogs = false;

export function verboseEnqueueLogs(): boolean {
  return _verboseEnqueueLogs;
}

export function setVerboseEnqueueLogs(verboseEnqueueLogs: boolean): void {
  _verboseEnqueueLogs = verboseEnqueueLogs;
}

/** @internal */
export function adapterName(adapter: unknown): string {
  if (rbObjRespondTo(adapter, "queueAdapterName")) {
    return (adapter as { queueAdapterName: string }).queueAdapterName;
  }

  const adapterClass = typeof adapter === "function" ? adapter : rbObjClass(adapter);
  const name = demodulize(rbModName(adapterClass as object) as string);
  return `${name.endsWith("Adapter") ? name.slice(0, -"Adapter".length) : name}`;
}
Object.assign(ActiveJob, { adapterName });
