import {
  Concern,
  classAttribute,
  extend,
  mattrAccessor,
  presence,
} from "@blazetrails/activesupport";
import { aryJoin, compact, rbModConstSet, rbObjClass, rbObjIsProc } from "@blazetrails/ruby-compat";
import { classModule } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface QueueNameClass {
  defaultQueueName: unknown;
  queueName: unknown;
  queueNameDelimiter: string;
  queueNamePrefix: unknown;
  queueNameFromPart(partName: unknown): string;
}

interface QueueNameJob {
  _queueName: unknown;
}

export class ClassMethods {
  declare static defaultQueueName: unknown;

  static queueAs(
    this: QueueNameClass,
    partName: unknown = null,
    block?: (this: QueueNameJob) => unknown,
  ): void {
    if (block !== undefined) {
      this.queueName = block;
    } else {
      this.queueName = this.queueNameFromPart(partName);
    }
  }

  /** @internal */
  static queueNameFromPart(this: QueueNameClass, partName: unknown): string {
    const queueName = partName != null && partName !== false ? partName : this.defaultQueueName;
    const nameParts = [presence(this.queueNamePrefix), queueName];
    return aryJoin(compact(nameParts), this.queueNameDelimiter);
  }
}
mattrAccessor.call(ClassMethods, "defaultQueueName", { default: "default" });

export class QueueName {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare _queueName: unknown;
  declare queueNamePrefix: unknown;
  declare isQueueNamePrefix: () => boolean;

  get queueName(): unknown {
    if (rbObjIsProc(this._queueName)) {
      this._queueName = (rbObjClass(this) as unknown as QueueNameClass).queueNameFromPart(
        (this._queueName as (this: QueueNameJob) => unknown).call(this),
      );
    }
    return this._queueName;
  }
}
extend(QueueName, Concern);
Object.defineProperty(QueueName, "ClassMethods", { value: ClassMethods });
(QueueName as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function () {
    classAttribute.call(this, "queueName", {
      instanceAccessor: false,
      default: function (this: QueueNameJob) {
        return (rbObjClass(this) as unknown as QueueNameClass).defaultQueueName;
      },
    });
    classAttribute.call(this, "queueNameDelimiter", { instanceAccessor: false, default: "_" });
    classAttribute.call(this, "queueNamePrefix");
  },
);

rbModConstSet(ActiveJob, "QueueName", QueueName);
