import { classAttribute, Concern, mattrAccessor } from "@blazetrails/activesupport";
import { rbObjIsProc, extend, Module, rbModConstSet } from "@blazetrails/ruby-compat";
import { jsInstanceExec } from "./codegen-runtime.js";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function priority(this: any): any {
  if (rbObjIsProc(this._priority)) {
    this._priority = jsInstanceExec(this, this._priority);
  }
  return this._priority ?? null;
}

export const QueuePriority: any = new Module((mod: any) => {
  mod.moduleEval((table: any) =>
    Object.defineProperty(table, "priority", { configurable: true, get: priority }),
  );
});
extend(QueuePriority, Concern);
QueuePriority.included(null, function (this: any): void {
  const base = this;
  classAttribute.call(base, "priority", { instanceAccessor: false, default: base.defaultPriority });
});
export function queueWithPriority(this: any, priority: any = null, block?: any): any {
  if (block != null) {
    this.priority = block;
    return this.priority;
  } else {
    this.priority = priority;
    return this.priority;
  }
}

export const ClassMethods: any = new Module((mod: any) => {
  mod.defineMethod("queueWithPriority", queueWithPriority);
});
{
  mattrAccessor.call(ClassMethods, "defaultPriority");
}
rbModConstSet(ActiveJobSeat, "QueuePriority", QueuePriority);
QueuePriority.ClassMethods = ClassMethods;
