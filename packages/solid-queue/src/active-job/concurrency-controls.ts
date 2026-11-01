import { Base as ActiveRecordBase } from "@blazetrails/activerecord";
import {
  Concern,
  classAttribute,
  extend,
  isPresent,
  type Duration,
} from "@blazetrails/activesupport";
import { classModule, rbModName } from "@blazetrails/ruby-compat";
import { SolidQueue } from "../solid-queue.js";

type ConcurrencyOption = string | ((this: ConcurrencyControls, ...args: unknown[]) => unknown);

interface ConcurrencyControlsClass {
  concurrencyKey: unknown;
  concurrencyGroup: unknown;
  concurrencyLimit: number | null;
  concurrencyDuration: Duration;
}

const DEFAULT_CONCURRENCY_GROUP = function (this: ConcurrencyControls): unknown {
  return rbModName(this.constructor);
};

declare module "@blazetrails/activejob/base" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Base {
    let concurrencyKey: unknown;
    let concurrencyGroup: unknown;
    let concurrencyLimit: number | null;
    let concurrencyDuration: Duration;
    const limitsConcurrency: typeof ClassMethods.limitsConcurrency;
  }
}

export class ClassMethods {
  static limitsConcurrency(
    this: ConcurrencyControlsClass,
    {
      key,
      to = 1,
      group = DEFAULT_CONCURRENCY_GROUP,
      duration = SolidQueue.defaultConcurrencyControlPeriod,
    }: { key: ConcurrencyOption; to?: number; group?: ConcurrencyOption; duration?: Duration },
  ): void {
    this.concurrencyKey = key;
    this.concurrencyLimit = to;
    this.concurrencyGroup = group;
    this.concurrencyDuration = duration;
  }
}

export class ConcurrencyControls {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
  declare static DEFAULT_CONCURRENCY_GROUP: typeof DEFAULT_CONCURRENCY_GROUP;
  declare arguments: unknown[];

  concurrencyKey(): string | null {
    const klass = this.constructor as unknown as ConcurrencyControlsClass;
    if (klass.concurrencyKey != null) {
      const param = this.computeConcurrencyParameter(klass.concurrencyKey as ConcurrencyOption);

      let parts: unknown[];
      if (param instanceof ActiveRecordBase) {
        parts = [this.concurrencyGroup(), rbModName(param.constructor), param.id];
      } else {
        parts = [this.concurrencyGroup(), param];
      }
      return parts.filter((part) => part != null).join("/");
    }
    return null;
  }

  isConcurrencyLimited(): boolean {
    return isPresent(this.concurrencyKey());
  }

  /** @internal */
  concurrencyGroup(): unknown {
    return this.computeConcurrencyParameter(
      (this.constructor as unknown as ConcurrencyControlsClass)
        .concurrencyGroup as ConcurrencyOption,
    );
  }

  /** @internal */
  computeConcurrencyParameter(option: ConcurrencyOption): unknown {
    if (typeof option === "string") {
      return option;
    } else if (typeof option === "function") {
      return option.apply(this, this.arguments);
    }
    return null;
  }
}
extend(ConcurrencyControls, Concern);
Object.defineProperty(ConcurrencyControls, "ClassMethods", { value: ClassMethods });
Object.defineProperty(ConcurrencyControls, "DEFAULT_CONCURRENCY_GROUP", {
  value: DEFAULT_CONCURRENCY_GROUP,
});
(
  ConcurrencyControls as unknown as {
    included(base: null, block: (this: ConcurrencyControlsClass) => void): void;
  }
).included(null, function (this: ConcurrencyControlsClass) {
  classAttribute.call(this, "concurrencyKey", { instanceAccessor: false });
  classAttribute.call(this, "concurrencyGroup", {
    default: DEFAULT_CONCURRENCY_GROUP,
    instanceAccessor: false,
  });

  classAttribute.call(this, "concurrencyLimit");
  classAttribute.call(this, "concurrencyDuration", {
    default: SolidQueue.defaultConcurrencyControlPeriod,
  });
});
