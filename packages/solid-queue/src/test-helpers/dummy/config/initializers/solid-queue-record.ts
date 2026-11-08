import { onLoad } from "@blazetrails/activesupport";
import { RuntimeError, rbInspect } from "@blazetrails/ruby-compat";
import { Record } from "../../../../record.js";

export const x = { solidQueueRecordHookRan: false };

onLoad("solid_queue_record", function (this: unknown) {
  if (this !== Record)
    throw new RuntimeError(`Expected to run on SolidQueue::Record, got ${rbInspect(this)}`);
  x.solidQueueRecordHookRan = true;
});
