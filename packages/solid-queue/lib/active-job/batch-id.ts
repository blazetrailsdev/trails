import { ActiveJob } from "@blazetrails/activejob";
import { Concern, extend } from "@blazetrails/activesupport";
import { rbCallSuper, rbModAttrReader, rbModAttrWriter } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";
import type { Batch } from "../batch.js";

declare module "@blazetrails/activejob/base" {
  interface Base {
    batchId?: number | null;
    callbackBatchId?: number | null;
  }
}

type JobData = { [key: string]: unknown };

interface BatchIdHost {
  batchId?: number | null;
  callbackBatchId?: number | null;
  _batch?: Batch | null;
  _loadedBatchId?: number;
  constructor: { queueAdapterName: string };
  isSolidQueueJob(): boolean;
}

async function enqueue(
  this: BatchIdHost,
  options: { [key: string]: unknown } = {},
): Promise<unknown> {
  if (this.isSolidQueueJob()) this.batchId = SolidQueue.Batch!.currentBatchId() ?? this.batchId;
  return await rbCallSuper(this, enqueue, options);
}

function serialize(this: BatchIdHost): JobData {
  const data = rbCallSuper(this, serialize) as JobData;
  if (this.batchId != null) data["batch_id"] = this.batchId;
  if (this.callbackBatchId != null) data["callback_batch_id"] = this.callbackBatchId;
  return data;
}

function deserialize(this: BatchIdHost, jobData: JobData): void {
  rbCallSuper(this, deserialize, jobData);
  this.batchId = jobData["batch_id"] as number | null;
  this.callbackBatchId = jobData["callback_batch_id"] as number | null;
}

async function batch(this: BatchIdHost): Promise<Batch | null> {
  const batchIdToLoad = this.callbackBatchId ?? this.batchId;
  if (batchIdToLoad == null) return null;
  if ("_batch" in this && this._loadedBatchId === batchIdToLoad) return this._batch ?? null;

  this._loadedBatchId = batchIdToLoad;
  return (this._batch = await SolidQueue.Batch!.findBy({ id: batchIdToLoad }));
}

/** @internal */
function isSolidQueueJob(this: BatchIdHost): boolean {
  return this.constructor.queueAdapterName === "solid_queue";
}

export const BatchId = { enqueue, serialize, deserialize, batch, isSolidQueueJob };
extend(BatchId, Concern);
(
  BatchId as unknown as {
    included(base: null, block: (this: { prototype: object }) => void): void;
  }
).included(null, function (this: { prototype: object }) {
  rbModAttrReader(this, "batchId");
  rbModAttrWriter(this, "batchId");
  rbModAttrReader(this, "callbackBatchId");
  rbModAttrWriter(this, "callbackBatchId");
});
ActiveJob.BatchId = BatchId;
