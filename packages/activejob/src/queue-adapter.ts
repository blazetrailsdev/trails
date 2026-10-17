import {
  demodulize,
  classAttribute,
  delegate,
  Concern,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import {
  rbObjRespondTo,
  Module,
  rbObjAsString,
  rbModName,
  rbStrSend,
  extend,
  ArgumentError,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { rbEnum, rbTsName } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";
import { lookup } from "./queue-adapters.js";

export function adapterName(adapter: any): any {
  if (rbObjRespondTo(adapter, "queueAdapterName")) {
    return adapter.queueAdapterName();
  }
  const adapterClass: any =
    typeof adapter === "function" || adapter instanceof Module ? adapter : adapter.constructor;
  return `${rbObjAsString(rbStrSend(demodulize(rbModName(adapterClass)), "deleteSuffix", "Adapter")[0])}`;
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { adapterName });
export const QueueAdapter: any = new Module();
extend(QueueAdapter, Concern);
QueueAdapter.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "_queueAdapterName", {
    instanceAccessor: false,
    instancePredicate: false,
  });
  classAttribute.call(base, "_queueAdapter", { instanceAccessor: false, instancePredicate: false });
  delegate.call(base.prototype, "queueAdapter", { to: "class" });
});
export function queueAdapter(this: any): any {
  if (this._queueAdapter == null) {
    this.setQueueAdapter("async");
  }
  return this._queueAdapter;
}

export function queueAdapterName(this: any): any {
  if (this._queueAdapterName == null) {
    this.setQueueAdapter("async");
  }
  return this._queueAdapterName;
}

export function setQueueAdapter(this: any, nameOrAdapter: any): any {
  let queueAdapter: any, adapterName: any;
  if (typeof nameOrAdapter === "string" || typeof nameOrAdapter === "string") {
    queueAdapter = new (lookup(nameOrAdapter))();
    tryCall(queueAdapter, "checkAdapter");
    this.assignAdapter(rbObjAsString(nameOrAdapter), queueAdapter);
  } else {
    if (this.isQueueAdapter(nameOrAdapter)) {
      adapterName = underscore((ActiveJobSeat as any).adapterName(nameOrAdapter));
      this.assignAdapter(adapterName, nameOrAdapter);
    } else {
      throw new ArgumentError();
    }
  }
}

/** @internal */
export function assignAdapter(this: any, adapterName: any, queueAdapter: any): any {
  this._queueAdapterName = adapterName;
  this._queueAdapter = queueAdapter;
  return this._queueAdapter;
}

export const QUEUE_ADAPTER_METHODS: any = Object.freeze(["enqueue", "enqueue_at"]);

/** @internal */
export function isQueueAdapter(this: any, object: any): any {
  return rbEnum(QUEUE_ADAPTER_METHODS).every((meth?: any) =>
    rbObjRespondTo(object, rbTsName(meth)),
  );
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("queueAdapter", queueAdapter);
  mod.defineMethod("queueAdapterName", queueAdapterName);
  mod.defineMethod("setQueueAdapter", setQueueAdapter);
  mod.defineMethod("assignAdapter", assignAdapter);
  mod.defineMethod("isQueueAdapter", isQueueAdapter);
});
rbModConstSet(ClassMethods, "QUEUE_ADAPTER_METHODS", QUEUE_ADAPTER_METHODS);
rbModConstSet(ActiveJobSeat, "QueueAdapter", QueueAdapter);
QueueAdapter.ClassMethods = ClassMethods;
