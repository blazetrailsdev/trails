import {
  Concern,
  DescendantsTracker,
  classAttribute,
  delegate,
  demodulize,
  extend,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  classModule,
  deleteSuffix,
  rbCModule,
  rbClassSuperclass,
  rbModConstSet,
  rbModName,
  rbObjClass,
  rbObjIsKindOf,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "./namespaces.js";

interface QueueAdapterClass {
  _queueAdapterName: string | null;
  _queueAdapter: unknown;
  queueAdapter: unknown;
  setQueueAdapter(nameOrAdapter: unknown): void;
  assignAdapter(adapterName: string, queueAdapter: unknown): void;
  isQueueAdapter(object: unknown): boolean;
}

/** @missingRailsArgs delete_suffix — PERMANENT */
export function adapterName(adapter: unknown): string {
  if (rbObjRespondTo(adapter, "queueAdapterName")) {
    return (adapter as { queueAdapterName: string }).queueAdapterName;
  }

  const adapterClass = rbObjIsKindOf(adapter, rbCModule) ? adapter : rbObjClass(adapter);
  const name = demodulize(rbModName(adapterClass as object) as string);
  return `${deleteSuffix(name, "Adapter")}`;
}
Object.assign(ActiveJob, { adapterName });

const QUEUE_ADAPTER_METHODS = Object.freeze(["enqueue", "enqueueAt"]);

export class ClassMethods {
  static get queueAdapter(): unknown {
    const self = this as unknown as QueueAdapterClass;
    if (self._queueAdapter == null) self.setQueueAdapter("async");
    return self._queueAdapter;
  }

  static get queueAdapterName(): string {
    const self = this as unknown as QueueAdapterClass;
    if (self._queueAdapterName == null) self.setQueueAdapter("async");
    return self._queueAdapterName!;
  }

  static setQueueAdapter(this: QueueAdapterClass, nameOrAdapter: unknown): void {
    if (typeof nameOrAdapter === "string") {
      const queueAdapter = new (QueueAdapters.lookup(nameOrAdapter) as new () => object)();
      tryCall(queueAdapter, "checkAdapter");
      this.assignAdapter(String(nameOrAdapter), queueAdapter);
    } else {
      if (this.isQueueAdapter(nameOrAdapter)) {
        const adapterName = underscore(ActiveJob.adapterName(nameOrAdapter));
        this.assignAdapter(adapterName, nameOrAdapter);
      } else {
        throw new ArgumentError();
      }
    }
  }

  /** @internal */
  static assignAdapter(this: QueueAdapterClass, adapterName: string, queueAdapter: unknown): void {
    this._queueAdapterName = adapterName;
    this._queueAdapter = queueAdapter;
    let klass = this as unknown as Parameters<typeof DescendantsTracker.registerSubclass>[1];
    for (let superclass; (superclass = rbClassSuperclass(klass)); klass = superclass) {
      DescendantsTracker.registerSubclass(superclass, klass);
    }
  }

  /** @internal */
  static isQueueAdapter(object: unknown): boolean {
    return QUEUE_ADAPTER_METHODS.every((meth) => rbObjRespondTo(object, meth));
  }
}

export class QueueAdapter {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  declare queueAdapter: unknown;
}
extend(QueueAdapter, Concern);
Object.defineProperty(QueueAdapter, "ClassMethods", { value: ClassMethods });
(QueueAdapter as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    classAttribute.call(this, "_queueAdapterName", {
      instanceAccessor: false,
      instancePredicate: false,
    });
    classAttribute.call(this, "_queueAdapter", {
      instanceAccessor: false,
      instancePredicate: false,
    });

    delegate.call((this as { prototype: object }).prototype, "queueAdapter", { to: "class" });
  },
);

rbModConstSet(ActiveJob, "QueueAdapter", QueueAdapter);
