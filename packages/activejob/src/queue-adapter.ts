import {
  demodulize,
  Concern,
  classAttribute,
  delegate,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import {
  Module,
  rbStrSend,
  extend,
  classModule,
  Extended,
  rbInspect,
  ArgumentError,
  Enumerator,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./active-job.js";
import { QueueAdapters } from "./queue-adapters.js";
import type { Base } from "./base.js";

const adapterNameFn = adapterName;

export function adapterName(adapter: unknown): string {
  if ("queueAdapterName" in Object(adapter)) {
    return adapter.queueAdapterName();
  }
  const adapterClass =
    typeof adapter === "function" || adapter instanceof Module ? adapter : adapter.constructor;
  return `${rbStrSend(demodulize(Object.hasOwn(adapterClass, "toString") ? String(adapterClass) : adapterClass.name || null), "deleteSuffix", "Adapter")[0] ?? ""}`;
}

export class QueueAdapter {
  declare static included: Extended<typeof Concern>["included"];
  declare static ClassMethods: typeof ClassMethods;

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::QueueAdapter";
  }
}
extend(QueueAdapter, Concern);
QueueAdapter.included(null, function (this: typeof Base): void {
  classAttribute.call(this, "_queueAdapterName", {
    instanceAccessor: false,
    instancePredicate: false,
  });
  classAttribute.call(this, "_queueAdapter", { instanceAccessor: false, instancePredicate: false });
  delegate.call(this.prototype, "queueAdapter", { to: "class" });
});
export class ClassMethods {
  declare _queueAdapterName: string | null;
  declare _queueAdapter: unknown;
  declare static _queueAdapter: unknown;
  declare static _queueAdapterName: string | null;

  static toString(): string {
    return "ActiveJob::QueueAdapter::ClassMethods";
  }

  static get queueAdapter() {
    if (this._queueAdapter == null) {
      this.setQueueAdapter("async");
    }
    return this._queueAdapter;
  }

  static get queueAdapterName(): string {
    if (this._queueAdapterName == null) {
      this.setQueueAdapter("async");
    }
    return this._queueAdapterName!;
  }

  static setQueueAdapter(this: typeof Base, nameOrAdapter: unknown) {
    let queueAdapter, adapterName;
    if (typeof nameOrAdapter === "string" || typeof nameOrAdapter === "string") {
      queueAdapter = new (QueueAdapters.lookup(nameOrAdapter))();
      tryCall(queueAdapter, "checkAdapter");
      this.assignAdapter(
        Array.isArray(nameOrAdapter) ? rbInspect(nameOrAdapter) : String(nameOrAdapter ?? ""),
        queueAdapter,
      );
    } else {
      if (this.isQueueAdapter(nameOrAdapter)) {
        adapterName = underscore(adapterNameFn(nameOrAdapter));
        this.assignAdapter(adapterName, nameOrAdapter);
      } else {
        throw new ArgumentError();
      }
    }
  }

  /** @internal */
  static assignAdapter(this: typeof Base, adapterName: string, queueAdapter: unknown) {
    this._queueAdapterName = adapterName;
    this._queueAdapter = queueAdapter as null;
    return this._queueAdapter;
  }

  static QUEUE_ADAPTER_METHODS: unknown = Object.freeze(["enqueue", "enqueue_at"]);

  /** @internal */
  static isQueueAdapter(this: typeof Base, object: unknown): boolean {
    return (
      (ClassMethods.QUEUE_ADAPTER_METHODS instanceof globalThis.Set ||
      ClassMethods.QUEUE_ADAPTER_METHODS instanceof globalThis.Map ||
      ClassMethods.QUEUE_ADAPTER_METHODS instanceof Enumerator
        ? [...ClassMethods.QUEUE_ADAPTER_METHODS]
        : Object.getPrototypeOf(ClassMethods.QUEUE_ADAPTER_METHODS) === Object.prototype
          ? Object.entries(ClassMethods.QUEUE_ADAPTER_METHODS as object)
          : (ClassMethods.QUEUE_ADAPTER_METHODS as unknown[])
      ).every(
        (meth) =>
          ((s: string) => {
            const c = s
              .replace(/[?!]$/, "")
              .replace(/_([a-z0-9])/g, (_m: string, x: string) => x.toUpperCase());
            return s.endsWith("?") ? "is" + c[0].toUpperCase() + c.slice(1) : c;
          })(String(meth)) in Object(object),
      ) ?? null
    );
  }
}
Object.assign(QueueAdapter, { ClassMethods: ClassMethods });
