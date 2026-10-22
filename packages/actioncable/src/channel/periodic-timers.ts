import { Concern, classAttribute, extend } from "@blazetrails/activesupport";
import {
  ArgumentError,
  defineModule,
  fetch,
  rbCNumeric,
  rbCSymbol,
  rbFSend,
  rbInspect,
  rbModConstSet,
  rbObjClass,
  rbObjIsKindOf,
  rbObjIsProc,
} from "@blazetrails/ruby-compat";
import { Channel } from "../namespaces.js";

type Callback = (this: unknown) => unknown;
type PeriodicTimer = [Callback, { every: unknown }];

interface Timer {
  shutdown(): unknown;
}

interface PeriodicTimersConnection {
  server: { eventLoop: { timer(interval: unknown, block: () => unknown): Timer } };
  workerPool: {
    asyncExec(receiver: unknown, options: { connection: unknown }, block: Callback): unknown;
  };
}

interface PeriodicTimersClass {
  periodicTimers: PeriodicTimer[];
  afterSubscribe(...methods: unknown[]): void;
  afterUnsubscribe(...methods: unknown[]): void;
}

export class ClassMethods {
  static periodically(
    this: PeriodicTimersClass,
    callbackOrMethodName: unknown = null,
    { every }: { every: unknown },
    block?: Callback,
  ): void {
    let callback: Callback;
    if (block !== undefined) {
      if (callbackOrMethodName != null && callbackOrMethodName !== false) {
        throw new ArgumentError("Pass a block or provide a callback arg, not both");
      }
      callback = block;
    } else {
      if (rbObjIsProc(callbackOrMethodName)) {
        callback = callbackOrMethodName as Callback;
      } else if (rbObjIsKindOf(callbackOrMethodName, rbCSymbol)) {
        callback = function (this: unknown) {
          return rbFSend(this, callbackOrMethodName);
        };
      } else {
        throw new ArgumentError(
          `Expected a Symbol method name or a Proc, got ${rbInspect(callbackOrMethodName)}`,
        );
      }
    }

    if (!(rbObjIsKindOf(every, rbCNumeric) && (every as number) > 0)) {
      throw new ArgumentError(
        `Expected every: to be a positive number of seconds, got ${rbInspect(every)}`,
      );
    }

    this.periodicTimers = [...this.periodicTimers, [callback, { every }]];
  }
}

interface PeriodicTimersChannel {
  connection: PeriodicTimersConnection;
  _activePeriodicTimers?: Timer[];
  activePeriodicTimers: Timer[];
  startPeriodicTimer(callback: Callback, options: { every: unknown }): Timer;
}

/** @internal */
function startPeriodicTimers(this: PeriodicTimersChannel): void {
  for (const [callback, options] of (rbObjClass(this) as unknown as PeriodicTimersClass)
    .periodicTimers) {
    this.activePeriodicTimers.push(
      this.startPeriodicTimer(callback, { every: fetch(options, "every") }),
    );
  }
}

/** @internal */
function startPeriodicTimer(
  this: PeriodicTimersChannel,
  callback: Callback,
  { every }: { every: unknown },
): Timer {
  return this.connection.server.eventLoop.timer(every, () => {
    return this.connection.workerPool.asyncExec(this, { connection: this.connection }, callback);
  });
}

/** @internal */
function stopPeriodicTimers(this: PeriodicTimersChannel): void {
  for (const timer of this.activePeriodicTimers) timer.shutdown();
  this.activePeriodicTimers.length = 0;
}

export const PeriodicTimers = defineModule(
  {},
  {},
  {
    /** @internal */
    get activePeriodicTimers(): Timer[] {
      const self = this as unknown as PeriodicTimersChannel;
      return (self._activePeriodicTimers ??= []);
    },
    startPeriodicTimers,
    startPeriodicTimer,
    stopPeriodicTimers,
  },
);
extend(PeriodicTimers, Concern);
Object.defineProperty(PeriodicTimers, "ClassMethods", { value: ClassMethods });

(
  PeriodicTimers as unknown as {
    included(base: null, block: (this: PeriodicTimersClass) => void): void;
  }
).included(null, function (this: PeriodicTimersClass) {
  classAttribute.call(this, "periodicTimers", { instanceReader: false, default: [] });

  this.afterSubscribe(":startPeriodicTimers");
  this.afterUnsubscribe(":stopPeriodicTimers");
});

rbModConstSet(Channel, "PeriodicTimers", PeriodicTimers);
