import {
  Concern,
  classAttribute,
  demodulize,
  extend,
  tryCall,
  underscore,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  classModule,
  rbModConstSet,
  rbModName,
  rbObjClass,
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

/** @internal */
export function adapterName(adapter: unknown): string {
  if (rbObjRespondTo(adapter, "queueAdapterName")) {
    return (adapter as { queueAdapterName: string }).queueAdapterName;
  }

  const adapterClass = typeof adapter === "function" ? adapter : rbObjClass(adapter);
  const name = demodulize(rbModName(adapterClass as object) as string);
  return `${name.endsWith("Adapter") ? name.slice(0, -"Adapter".length) : name}`;
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
  }

  /** @internal */
  static isQueueAdapter(object: unknown): boolean {
    return QUEUE_ADAPTER_METHODS.every((meth) => rbObjRespondTo(object, meth));
  }
}

export class QueueAdapter {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  get queueAdapter(): unknown {
    return (rbObjClass(this) as unknown as QueueAdapterClass).queueAdapter;
  }
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
  },
);

rbModConstSet(ActiveJob, "QueueAdapter", QueueAdapter);
