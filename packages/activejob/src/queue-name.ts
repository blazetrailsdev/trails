import { Concern, classAttribute, presence, mattrAccessor } from "@blazetrails/activesupport";
import { extend, classModule, Extended, aryJoin } from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";

export class QueueName {
  declare _queueName: string | null;
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::QueueName";
  }

  get queueName() {
    if (
      ((x) => typeof x === "function" && !Function.prototype.toString.call(x).startsWith("class"))(
        this._queueName!,
      )
    ) {
      this._queueName = this.constructor.queueNameFromPart(this._queueName.call(this));
    }
    return this._queueName ?? null;
  }
}
extend(QueueName, Concern);
QueueName.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "queueName", {
    instanceAccessor: false,
    default: function (this: unknown) {
      return this.constructor.defaultQueueName;
    },
  });
  classAttribute.call(this, "queueNameDelimiter", { instanceAccessor: false, default: "_" });
  classAttribute.call(this, "queueNamePrefix");
});
export class ClassMethods {
  static toString(): string {
    return "ActiveJob::QueueName::ClassMethods";
  }

  static queueAs(
    this: typeof Base,
    partName: unknown = null,
    block?: (...args: unknown[]) => unknown,
  ) {
    if (block != null) {
      this.queueName = block;
      return this.queueName;
    } else {
      this.queueName = this.queueNameFromPart(partName);
      return this.queueName;
    }
  }

  static queueNameFromPart(this: typeof Base, partName: unknown): string {
    const queueName = partName != null && partName !== false ? partName : this.defaultQueueName;
    const nameParts = [presence(this.queueNamePrefix), queueName];
    return aryJoin(
      nameParts.filter((x) => x != null),
      this.queueNameDelimiter,
    );
  }
}
{
  mattrAccessor.call(ClassMethods, "defaultQueueName", { default: "default" });
}
Object.assign(QueueName, { ClassMethods: ClassMethods });
