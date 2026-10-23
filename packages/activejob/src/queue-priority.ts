import { Concern, classAttribute, extend, mattrAccessor } from "@blazetrails/activesupport";
import { classModule, rbModConstSet, rbObjIsProc } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface QueuePriorityClass {
  defaultPriority: unknown;
  priority: unknown;
}

interface QueuePriorityJob {
  _priority: unknown;
}

export class ClassMethods {
  declare static defaultPriority: unknown;

  static queueWithPriority(
    this: QueuePriorityClass,
    priority: unknown = null,
    block?: (this: QueuePriorityJob) => unknown,
  ): void {
    if (block !== undefined) {
      this.priority = block;
    } else {
      this.priority = priority;
    }
  }
}
mattrAccessor.call(ClassMethods, "defaultPriority");

export class QueuePriority {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare _priority: unknown;

  get priority(): unknown {
    if (rbObjIsProc(this._priority)) {
      this._priority = (this._priority as (this: QueuePriorityJob) => unknown).call(this);
    }
    return this._priority;
  }
}
extend(QueuePriority, Concern);
Object.defineProperty(QueuePriority, "ClassMethods", { value: ClassMethods });
(
  QueuePriority as unknown as {
    included(base: null, block: (this: QueuePriorityClass) => void): void;
  }
).included(null, function (this: QueuePriorityClass) {
  classAttribute.call(this, "priority", {
    instanceAccessor: false,
    default: this.defaultPriority,
  });
});

rbModConstSet(ActiveJob, "QueuePriority", QueuePriority);
