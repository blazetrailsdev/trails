import { Autoload } from "@blazetrails/activesupport";
import { extend } from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function verboseEnqueueLogs(): any {
  return ActiveJob._verboseEnqueueLogs;
}

export function setVerboseEnqueueLogs(value: any): any {
  return (ActiveJob._verboseEnqueueLogs = value);
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { verboseEnqueueLogs, setVerboseEnqueueLogs });
{
  extend(ActiveJob, Autoload);
  ActiveJob.autoload("Base");
  ActiveJob.autoload("QueueAdapters");
  ActiveJob.autoload("Arguments");
  ActiveJob.autoload("DeserializationError", "active_job/arguments");
  ActiveJob.autoload("SerializationError", "active_job/arguments");
  ActiveJob.autoload("EnqueueAfterTransactionCommit");
  ActiveJob.autoload("Serializers");
  ActiveJob.autoload("ConfiguredJob");
  ActiveJob.autoload("TestCase");
  ActiveJob.autoload("TestHelper");
  ActiveJob.verboseEnqueueLogs = false;
}
