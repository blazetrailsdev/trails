import { Concern, classAttribute, mattrAccessor } from "@blazetrails/activesupport";
import { extend, classModule, Extended } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export class QueuePriority {
  declare _priority: (...args: unknown[]) => unknown;
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::QueuePriority";
  }

  get priority() {
    if (
      typeof this._priority === "function" &&
      !Function.prototype.toString.call(this._priority).startsWith("class")
    ) {
      this._priority = this._priority.call(this) as (...args: unknown[]) => unknown;
    }
    return this._priority ?? null;
  }
}
extend(QueuePriority, Concern);
QueuePriority.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "priority", { instanceAccessor: false, default: this.defaultPriority });
});
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::QueuePriority::ClassMethods";
  }

  static queueWithPriority(
    this: typeof Base,
    priority: unknown = null,
    block?: (...args: unknown[]) => unknown,
  ) {
    if (block != null) {
      this.priority = block;
      return this.priority;
    } else {
      this.priority = priority as (...args: unknown[]) => unknown;
      return this.priority;
    }
  }
}
{
  mattrAccessor.call(ClassMethods, "defaultPriority");
}
Object.assign(QueuePriority, { ClassMethods: ClassMethods });
