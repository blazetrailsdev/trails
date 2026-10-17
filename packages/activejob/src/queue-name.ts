import { classAttribute, Concern, presence, mattrAccessor } from "@blazetrails/activesupport";
import {
  rbObjIsProc,
  extend,
  Module,
  rtest,
  compact,
  aryJoin,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { jsInstanceExec } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function queueName(this: any): any {
  if (rbObjIsProc(this._queueName)) {
    this._queueName = this.constructor.queueNameFromPart(jsInstanceExec(this, this._queueName));
  }
  return this._queueName ?? null;
}

export const QueueName: any = new Module((mod: any) => {
  mod.moduleEval((table: any) =>
    Object.defineProperty(table, "queueName", { configurable: true, get: queueName }),
  );
});
extend(QueueName, Concern);
QueueName.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "queueName", {
    instanceAccessor: false,
    default: () => base.constructor.defaultQueueName,
  });
  classAttribute.call(base, "queueNameDelimiter", { instanceAccessor: false, default: "_" });
  classAttribute.call(base, "queueNamePrefix");
});
export function queueAs(this: any, partName: any = null, block?: any): any {
  if (block != null) {
    this.queueName = block;
    return this.queueName;
  } else {
    this.queueName = this.queueNameFromPart(partName);
    return this.queueName;
  }
}

export function queueNameFromPart(this: any, partName: any): any {
  const queueName: any = rtest(partName) ? partName : this.defaultQueueName;
  const nameParts: any = [presence(this.queueNamePrefix), queueName];
  return aryJoin(compact(nameParts), this.queueNameDelimiter);
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("queueAs", queueAs);
  mod.defineMethod("queueNameFromPart", queueNameFromPart);
});
{
  mattrAccessor.call(ClassMethods, "defaultQueueName", { default: "default" });
}
rbModConstSet(ActiveJobSeat, "QueueName", QueueName);
QueueName.ClassMethods = ClassMethods;
